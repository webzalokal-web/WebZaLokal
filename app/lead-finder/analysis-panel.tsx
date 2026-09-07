"use client";
import { useEffect, useState } from "react";
import type { AnalysisRecord } from "../../worker/lead-finder/analysis-types";

const categories = { mobileUx:"Mobile & UX",conversion:"Conversion",performanceTechnical:"Performance & Technical",seoDiscoverability:"SEO & Discoverability",contentPresentation:"Content & Presentation" };
const maxima = { mobileUx:25,conversion:25,performanceTechnical:20,seoDiscoverability:15,contentPresentation:15 };
export default function AnalysisPanel({leadId,auditId,onSaved}:{leadId:string;auditId:string|null;onSaved:()=>Promise<void>}) {
  const [analysis,setAnalysis]=useState<AnalysisRecord|null>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [usage,setUsage]=useState<{monthlyCount:number;monthlyLimit:number}|null>(null);
  useEffect(() => {
    const controller=new AbortController();
    Promise.all([
      fetch(`/api/lead-finder/analyses/${leadId}`,{credentials:"same-origin",signal:controller.signal,cache:"no-store"}),
      fetch("/api/lead-finder/analyses",{credentials:"same-origin",signal:controller.signal,cache:"no-store"}),
    ]).then(async ([detail,quota]) => {
      if (!detail.ok || !quota.ok) throw new Error("Analizu nije moguće učitati.");
      const [d,q]=await Promise.all([detail.json() as Promise<{analysis:AnalysisRecord|null}>,quota.json() as Promise<{monthlyCount:number;monthlyLimit:number}>]);
      if (!controller.signal.aborted) {setAnalysis(d.analysis);setUsage(q);}
    }).catch(e => {if(!controller.signal.aborted)setError(e instanceof Error ? e.message : "Greška učitavanja.");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[leadId,auditId]);
  const run = async(refresh:boolean) => {
    if (refresh && !window.confirm("Re-analyze radi 1 novi OpenAI API poziv i troši jednu mjesečnu analizu. Nastaviti?")) return;
    if (!auditId && !window.confirm("Potvrđuješ da ovaj business nema website? Nedostatak audita nije dovoljan dokaz. Ova akcija sprema tvoju potvrdu i deterministički prioritet, bez OpenAI poziva.")) return;
    setBusy(true);setError(null);
    try {
      const response=await fetch("/api/lead-finder/analyses",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({leadId,auditId,refresh,noWebsiteConfirmed:!auditId})});
      const payload=await response.json() as {message?:string;analysis:AnalysisRecord};
      if(!response.ok) throw new Error(payload.message ?? "Analiza nije uspjela.");
      setAnalysis(payload.analysis);
      const quota=await fetch("/api/lead-finder/analyses",{credentials:"same-origin",cache:"no-store"});
      if(quota.ok)setUsage(await quota.json() as {monthlyCount:number;monthlyLimit:number});
      await onSaved();
    } catch(e) {setError(e instanceof Error ? e.message : "Analiza nije uspjela.");}
    finally {setBusy(false);}
  };
  const sameAudit=analysis?.auditId===auditId;
  return <section className="website-audit-card ai-analysis-panel" aria-live="polite">
    <div className="audit-section-heading"><div><p className="section-kicker">AI Analysis & Scoring</p><h2>Analiza spremljenog evidencea</h2></div><span>{usage ? `${usage.monthlyCount}/${usage.monthlyLimit} AI pokušaja ovaj UTC mjesec` : ""}</span></div>
    <p>Lead: {leadId}. Otvaranje spremljene analize ne radi vanjske pozive.</p>
    {loading ? <p>Učitavam spremljenu analizu…</p> : <div className="audit-heading-actions">
      <button className="audit-table-button start" disabled={busy || (analysis?.status==="RUNNING")} onClick={()=>void run(false)}>{busy ? "Analiziram…" : sameAudit && analysis?.status==="COMPLETE" ? "Otvori spremljenu analizu" : auditId ? "Analyze · najviše 1 AI poziv" : "Potvrdi business bez websitea · 0 AI poziva"}</button>
      {sameAudit && analysis?.status==="COMPLETE" && auditId && <button className="audit-table-button" disabled={busy} onClick={()=>void run(true)}>Re-analyze · 1 novi AI poziv</button>}
    </div>}
    {error && <p className="lead-error" role="alert">{error}</p>}
    {analysis && <>
      <p>Status: <strong>{analysis.status}</strong> · {new Date(analysis.updatedAt).toLocaleString("hr-HR")} · Izvorni audit: {analysis.sourceAuditStatus}</p>
      {!sameAudit && <p>Ovo je povijesna analiza ranijeg audita. Novi audit još treba analizirati.</p>}
      {analysis.errorCode && <p>Analiza nije završena: {analysis.errorCode}. Prethodni spremljeni score nije prepisan.</p>}
      <div className="audit-summary-grid">
        <article><span>Website Quality</span><strong>{analysis.result ? `${analysis.result.websiteQualityScore}/100` : "UNKNOWN / nema websitea"}</strong></article>
        <article><span>Sales Opportunity</span><strong>{analysis.opportunity?.score !== null && analysis.opportunity?.score !== undefined ? `${analysis.opportunity.score}/100` : "UNKNOWN"}</strong></article>
        <article><span>Prioritet</span><strong>{analysis.opportunity?.priority ?? "UNCLASSIFIED"}</strong></article>
      </div>
      {analysis.opportunity && <><p>{analysis.opportunity.reason}</p><dl className="ai-score-list">{Object.entries({"Website Need":analysis.opportunity.websiteNeed,"Business Quality":analysis.opportunity.businessQuality,"Fixability":analysis.opportunity.fixability,"Contactability":analysis.opportunity.contactability}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value===null?"UNKNOWN":`${value}/100`}</dd></div>)}</dl></>}
      {analysis.result && <><dl className="ai-score-list">{Object.entries(categories).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{analysis.result!.categoryScores[key as keyof typeof categories]}/{maxima[key as keyof typeof categories]}</dd></div>)}</dl>
        {analysis.result.adjustments.length>0 && <details><summary>Backend provjere scorea</summary><ul>{analysis.result.adjustments.map((a,i)=><li key={i}>{a}</li>)}</ul></details>}
        <h3>Findings · dokazi i pouzdanost</h3>
        {!analysis.result.findings.length && <p>Nema potvrđenih nalaza. To samo po sebi ne dokazuje da je website bez problema.</p>}
        {analysis.result.findings.map((f,i)=><article className="ai-finding" key={i}><h4>{f.problem}</h4><p>Severity: {f.severity} · Confidence: {f.confidence} · Sales relevance: {f.salesRelevance}</p><blockquote>{f.evidence}</blockquote><p>{f.suggestedFix}</p><p>{f.outreachEligible?"Kandidat za buduću outreach tvrdnju; potrebna ljudska provjera.":"Nije dopušten za budući outreach tekst bez dodatne provjere."}</p><ul>{f.evidenceRefs.map(ref=>{const e=analysis.evidence.find(item=>item.id===ref);return <li key={ref}><code>{ref}</code>{e?.url && <span> · {e.url}</span>}</li>;})}</ul></article>)}
      </>}
      <p>Provider: {analysis.provider} · Model: {analysis.model} · Analysis v{analysis.analysisVersion} / Prompt v{analysis.promptVersion} · Tokeni: {analysis.inputTokens ?? "—"} input / {analysis.outputTokens ?? "—"} output</p>
    </>}
  </section>;
}
