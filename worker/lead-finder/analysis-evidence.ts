import type { WebsiteAuditDetail } from "./audit-types";
import { ANALYSIS_INPUT_BYTES, AnalysisError, CATEGORY_MAX, type AnalysisInput, type EvidenceItem, type CategoryScores, type Finding, type ValidatedAnalysis } from "./analysis-types";

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
export function buildAnalysisInput(audit: WebsiteAuditDetail): AnalysisInput {
  const home = audit.pages.find(p => p.pageKind === "homepage" && p.status === "SUCCESS");
  if (!["COMPLETE", "PARTIAL"].includes(audit.auditStatus) || !home || !(home.cleanedText || home.markdown || home.title)) {
    throw new AnalysisError("INSUFFICIENT_EVIDENCE", "Za AI analizu potreban je uspješno dohvaćen homepage i COMPLETE/PARTIAL audit.", 409);
  }
  const input: AnalysisInput = { auditId: audit.id, sourceAuditStatus: audit.auditStatus, evidence: [], truncated: false };
  const add = (item: EvidenceItem) => {
    if (bytes({ ...input, evidence: [...input.evidence, item] }) <= ANALYSIS_INPUT_BYTES) input.evidence.push(item);
    else input.truncated = true;
  };
  const groups = { technical: audit.technicalSignals, conversion: audit.conversionSignals, seo: audit.seoSignals };
  for (const [group, signals] of Object.entries(groups)) {
    for (const [key, signal] of Object.entries(signals).sort(([a], [b]) => a.localeCompare(b))) {
      add({ id: `signal:${group}:${key}`, pageId: null, url: signal.evidence[0]?.pageUrl ?? null, kind: "signal", status: signal.status, data: JSON.stringify(signal) });
    }
  }
  if (audit.pageSpeedMobile) add({ id: "performance:mobile", pageId: home.id, url: home.finalUrl ?? home.requestedUrl, kind: "performance", status: audit.pageSpeedMobile.status === "SUCCESS" ? "PASS" : "UNKNOWN", data: JSON.stringify(audit.pageSpeedMobile) });
  const order = { homepage: 0, contact: 1, services: 2, commercial: 3, about: 4 };
  add({ id:"audit:contentSignals",pageId:null,url:audit.websiteUrl,kind:"content",status:"UNKNOWN",data:JSON.stringify(audit.contentSignals) });
  const pages = [...audit.pages].sort((a,b) => order[a.pageKind] - order[b.pageKind] || a.position - b.position);
  for (const page of pages) {
    add({ id: `page:${page.id}`, pageId: page.id, url: page.finalUrl ?? page.requestedUrl, kind: "page", status: page.status === "SUCCESS" ? "PASS" : "UNKNOWN", data: JSON.stringify({ kind: page.pageKind, title: page.title, metaDescription: page.metaDescription, httpStatus: page.httpStatus, headings: page.headings.slice(0,30), links: page.relevantLinks.slice(0,40) }) });
  }
  for (const page of pages.filter(p => p.status === "SUCCESS")) {
    const content = page.cleanedText || page.markdown || "";
    const item: EvidenceItem = { id: `content:${page.id}`, pageId: page.id, url: page.finalUrl ?? page.requestedUrl, kind: "content", status: "UNKNOWN", data: content.slice(0, page.pageKind === "homepage" ? 10000 : 4000) };
    if (item.data.length < content.length) input.truncated = true;
    while (item.data.length && bytes({ ...input, evidence: [...input.evidence, item] }) > ANALYSIS_INPUT_BYTES) { item.data = item.data.slice(0, Math.max(0, item.data.length - 256)); input.truncated = true; }
    if (item.data) add(item);
  }
  if (!input.evidence.some(e => e.id === `page:${home.id}`)) throw new AnalysisError("EVIDENCE_TOO_LARGE", "Homepage evidence prelazi sigurnosni limit.", 409);
  return input;
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => k in v);
const text = (v: unknown, max = 1200): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const level = (v: unknown) => ["LOW","MEDIUM","HIGH"].includes(String(v));
const invalid = () => { throw new AnalysisError("INVALID_AI_OUTPUT", "AI odgovor nije prošao provjeru strukture ili evidencea. Score nije spremljen.", 502); };

export function validateAnalysis(output: unknown, input: AnalysisInput): ValidatedAnalysis {
  if (!object(output) || !exact(output, ["categoryScores","fixabilityScore","findings"]) || !object(output.categoryScores)) return invalid();
  const scores = output.categoryScores;
  if (!exact(scores, Object.keys(CATEGORY_MAX))) return invalid();
  for (const [key,max] of Object.entries(CATEGORY_MAX)) if (!Number.isInteger(scores[key]) || Number(scores[key]) < 0 || Number(scores[key]) > max) return invalid();
  if (!Number.isInteger(output.fixabilityScore) || Number(output.fixabilityScore) < 0 || Number(output.fixabilityScore) > 100 || !Array.isArray(output.findings) || output.findings.length > 12) return invalid();
  const refs = new Map(input.evidence.map(e => [e.id,e]));
  const findings: Finding[] = [];
  for (const f of output.findings) {
    if (!object(f) || !exact(f,["problem","evidenceRefs","evidence","severity","salesRelevance","suggestedFix","confidence"]) || !text(f.problem,400) || !text(f.evidence) || !text(f.suggestedFix,600) || !level(f.severity) || !level(f.salesRelevance) || !level(f.confidence) || !Array.isArray(f.evidenceRefs) || f.evidenceRefs.length < 1 || f.evidenceRefs.length > 5 || !f.evidenceRefs.every(r => typeof r === "string" && refs.has(r))) return invalid();
    const cited = f.evidenceRefs.map(r => refs.get(r)!);
    // Exact supporting excerpt must be present in a referenced item. PASS or
    // UNKNOWN deterministic checks can never be promoted to negative findings.
    if (!cited.some(e => e.data.includes(f.evidence as string))) return invalid();
    if (cited.some(e => e.kind === "signal" && e.status !== "FAIL")) return invalid();
    const prose = `${f.problem} ${f.suggestedFix}`;
    const urls = prose.match(/https?:\/\/[^\s<>"']+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? [];
    if (urls.some(url => !cited.some(e => e.url === url || e.data.includes(url)))) return invalid();
    // Qualitative claims require human review; references validate provenance,
    // not semantic truth. Only explicit deterministic FAILs are outreach eligible.
    const deterministic = cited.find(e => e.kind === "signal" && e.status === "FAIL");
    const finding = { ...(f as unknown as Omit<Finding,"outreachEligible">), outreachEligible: false };
    if (deterministic) {
      // The actionable factual claim comes from M2, not free-form model prose.
      // This prevents attaching a real citation to a different invented problem.
      let signal: {evidence?:{detail?:string}[]} = {};
      try { signal = JSON.parse(deterministic.data); } catch { /* Fixture/plain evidence. */ }
      const detail = signal.evidence?.find(e => e.detail)?.detail;
      if(detail) { finding.problem = detail; finding.evidence = detail; finding.evidenceRefs = [deterministic.id]; }
      finding.outreachEligible = !!detail && f.confidence !== "LOW";
    } else {
      // Text-only inference is retained transparently but cannot be outreach copy
      // until a later human/independent validation stage confirms the claim.
      finding.confidence = "LOW";
    }
    findings.push(finding);
  }
  const categoryScores = { ...scores } as CategoryScores;
  const adjustments: string[] = [];
  // Known technical facts take precedence; unknown earns no automatic penalty.
  const fact = (id: string, category: keyof CategoryScores, points: number) => {
    const status = refs.get(id)?.status;
    if (status === "PASS" && categoryScores[category] < points) { categoryScores[category] = points; adjustments.push(`${id}: confirmed PASS minimum ${points}`); }
    if (status === "FAIL" && categoryScores[category] > CATEGORY_MAX[category] - points) { categoryScores[category] = CATEGORY_MAX[category] - points; adjustments.push(`${id}: confirmed FAIL cap`); }
  };
  fact("signal:technical:mobileViewport", "mobileUx", 5);
  fact("signal:technical:https", "performanceTechnical", 3);
  const seo = ["title","metaDescription","h1"].map(k => refs.get(`signal:seo:${k}`)?.status);
  const minimum = seo.filter(s => s === "PASS").length * 3;
  const maximum = 15 - seo.filter(s => s === "FAIL").length * 3;
  categoryScores.seoDiscoverability = Math.max(minimum, Math.min(maximum, categoryScores.seoDiscoverability));
  if (categoryScores.seoDiscoverability !== scores.seoDiscoverability) adjustments.push("SEO score bounded by confirmed title/meta/H1 evidence");
  const psi = refs.get("performance:mobile");
  if (psi?.status === "PASS") {
    const perf = JSON.parse(psi.data).performanceScore;
    if (typeof perf === "number" && perf >= 0 && perf <= 100) {
      const base = Math.round(perf * .15);
      const known = [["https",3],["availability",2]] as const;
      const floor = base + known.reduce((sum,[key,points]) => sum+(refs.get(`signal:technical:${key}`)?.status === "PASS" ? points : 0),0);
      const ceiling = base + known.reduce((sum,[key,points]) => sum+(refs.get(`signal:technical:${key}`)?.status === "FAIL" ? 0 : points),0);
      categoryScores.performanceTechnical = Math.max(floor,Math.min(ceiling,categoryScores.performanceTechnical));
      adjustments.push("Performance & Technical calculated from PageSpeed and confirmed HTTPS/availability; missing facts remain unknown");
    }
  }
  const conversionPasses = ["booking","primaryCta","phone","email","contactForm","menuServicesPricing"].filter(key => refs.get(`signal:conversion:${key}`)?.status === "PASS").length;
  const conversionMinimum = Math.min(15,conversionPasses*3);
  if(categoryScores.conversion<conversionMinimum) {categoryScores.conversion=conversionMinimum;adjustments.push("Conversion minimum follows confirmed contact/booking/menu signals");}
  return { categoryScores, websiteQualityScore: Object.values(categoryScores).reduce((a,b) => a+b,0), fixabilityScore: findings.length ? Number(output.fixabilityScore) : 0, findings, adjustments };
}
