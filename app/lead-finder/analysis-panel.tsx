"use client";
import { useEffect, useState } from "react";
import type { AnalysisRecord } from "../../worker/lead-finder/analysis-types";
import { findingLevels, presentFinding } from "./finding-presentation";
import { analysisStatus, businessLabel, priorityLabel, reviewMessage, reviewStatus } from "./display-labels";

const categories = { mobileUx:"Mobilni prikaz i lakoća korištenja",conversion:"Put do upita ili rezervacije",performanceTechnical:"Brzina i tehnička ispravnost",seoDiscoverability:"Pronalazak putem tražilica",contentPresentation:"Sadržaj i predstavljanje ponude" };
const maxima = { mobileUx:25,conversion:25,performanceTechnical:20,seoDiscoverability:15,contentPresentation:15 };
export default function AnalysisPanel({leadId,auditId,businessName,websiteUrl,onSaved}:{leadId:string;auditId:string|null;businessName?:string|null;websiteUrl?:string|null;onSaved:()=>Promise<void>}) {
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
    if (refresh && !window.confirm("Ponovna AI analiza radi 1 novi OpenAI API poziv i troši jednu mjesečnu analizu. Nastaviti?")) return;
    if (!auditId && !window.confirm("Potvrđuješ da ovaj lokal nema web-stranicu? Nedostatak pregleda weba nije dovoljan dokaz. Ova akcija sprema tvoju potvrdu i izračunava prioritet, bez AI poziva.")) return;
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
    <div className="audit-section-heading"><div><p className="section-kicker">AI analiza i procjena</p><h2>Što se može poboljšati?</h2></div><span>{usage ? `${usage.monthlyCount}/${usage.monthlyLimit} AI pokušaja ovaj mjesec` : ""}</span></div>
    <p>Otvaranje spremljene analize ne troši nove AI pozive.</p>
    {loading ? <p>Učitavam spremljenu analizu…</p> : <div className="audit-heading-actions">
      <button className="audit-table-button start" disabled={busy || (analysis?.status==="RUNNING")} onClick={()=>void run(false)}>{busy ? "Analiziram…" : sameAudit && analysis?.status==="COMPLETE" ? "Otvori spremljenu analizu" : auditId ? "Pokreni AI analizu · najviše 1 AI poziv" : "Potvrdi lokal bez web-stranice · 0 AI poziva"}</button>
      {sameAudit && analysis?.status==="COMPLETE" && auditId && <button className="audit-table-button" disabled={busy} onClick={()=>void run(true)}>Ponovi AI analizu · 1 novi AI poziv</button>}
    </div>}
    {error && <p className="lead-error" role="alert">{reviewMessage(error)}</p>}
    {analysis && <>
      <p>AI analiza: <strong>{analysisStatus(analysis.status)}</strong> · Pregled weba: {reviewStatus(analysis.sourceAuditStatus)} · {new Date(analysis.updatedAt).toLocaleString("hr-HR")}</p>
      {!sameAudit && <p>Ova analiza pripada ranijem pregledu weba. Novi pregled još treba analizirati.</p>}
      {analysis.errorCode && <p>Analiza nije završena. Prethodni spremljeni rezultat ostaje sačuvan. Razlog je dostupan pod tehničkim dokazom.</p>}
      <div className="audit-summary-grid">
        <article><span>Kvaliteta weba</span><strong>{analysis.result ? `${analysis.result.websiteQualityScore}/100` : "Nije dostupno"}</strong></article>
        <article><span>Prodajni potencijal</span><strong>{analysis.opportunity?.score !== null && analysis.opportunity?.score !== undefined ? `${analysis.opportunity.score}/100` : "Nije dostupno"}</strong></article>
        <article><span>Prioritet</span><strong>{priorityLabel(analysis.opportunity?.priority)}</strong></article>
        <article><span>LOKAL</span><strong>{businessLabel(businessName,websiteUrl)}</strong></article>
      </div>
      {analysis.opportunity && <>
        <p>{analysis.opportunity.score === null ? "Prodajni potencijal: nema dovoljno podataka za procjenu." : `Prodajni potencijal: ${analysis.opportunity.score}/100 — ${priorityLabel(analysis.opportunity.priority)}.`} {analysis.opportunity.provisional && "Procjena je djelomična jer nisu dostupni svi podaci o poslovanju ili web-stranici."}</p>
        <details><summary>Kako je rezultat izračunat?</summary>
          <p>Dostupnost podataka za izračun: {analysis.opportunity.coverage}%. Nedostupni podaci ne računaju se kao nula.</p>
          <p>Ponderi: potreba za poboljšanjem weba 40%, kvaliteta poslovanja 30%, mogućnost poboljšanja 15%, dostupnost kontakta 15%. Zbroj se zaokružuje; kada podaci nedostaju, koriste se ponderi dostupnih komponenti.</p>
          <dl className="ai-score-list">{Object.entries({"Potreba za poboljšanjem weba":analysis.opportunity.websiteNeed,"Kvaliteta poslovanja":analysis.opportunity.businessQuality,"Mogućnost poboljšanja":analysis.opportunity.fixability,"Dostupnost kontakta":analysis.opportunity.contactability}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value===null?"Nije dostupno":`${value}/100`}</dd></div>)}</dl>
        </details>
      </>}
      {analysis.result && <><dl className="ai-score-list">{Object.entries(categories).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{analysis.result!.categoryScores[key as keyof typeof categories]}/{maxima[key as keyof typeof categories]}</dd></div>)}</dl>
        <h3>Nalazi i prijedlozi poboljšanja</h3>
        {!analysis.result.findings.length && <p>Nema potvrđenih nalaza. To samo po sebi ne dokazuje da je website bez problema.</p>}
        {analysis.result.findings.map((f,i)=>{
          const copy = presentFinding(f, analysis.evidence);
          return <article className="ai-finding" key={i}>
            <h4>Problem</h4><p>{copy.problem}</p>
            <p><strong>Zašto je važno</strong><br />{copy.whyItMatters}</p>
            <p><strong>Kako poboljšati</strong><br />{copy.improvement}</p>
            <dl className="ai-score-list">
              <div><dt>Važnost</dt><dd>{findingLevels[f.severity]}</dd></div>
              <div><dt>Pouzdanost</dt><dd>{findingLevels[f.confidence]}</dd></div>
              <div><dt>Za javljanje klijentu</dt><dd>{f.outreachEligible ? "Može se koristiti nakon provjere" : "Nemoj koristiti bez dodatne provjere"}</dd></div>
            </dl>
            <p>{f.outreachEligible ? "Prije korištenja u poruci provjeri nalaz i njegov dokaz." : "Ovaj nalaz nemoj koristiti kao tvrdnju u poruci bez dodatne provjere."}</p>
            <details>
              <summary>Prikaži tehnički dokaz</summary>
              <p><strong>Izvorni nalaz:</strong> {f.problem}</p>
              <p><strong>Važnost za prodajni razgovor:</strong> {findingLevels[f.salesRelevance]}</p>
              <blockquote>{f.evidence}</blockquote>
              <p><strong>Izvorni prijedlog:</strong> {f.suggestedFix}</p>
              <ul>{f.evidenceRefs.map(ref=>{const e=analysis.evidence.find(item=>item.id===ref);return <li key={ref}>
                <code>{ref}</code>{e?.url && <p><strong>Adresa:</strong> {e.url}</p>}
                {e?.pageId && <p><strong>ID stranice:</strong> <code>{e.pageId}</code></p>}
                {e && <p style={{whiteSpace:"pre-wrap"}}>{e.data}</p>}
              </li>;})}</ul>
            </details>
          </article>;
        })}
      </>}
      <details><summary>Prikaži tehnički dokaz</summary>
        <p>Interni Lead ID: <code>{leadId}</code> · ID analize: <code>{analysis.id}</code> · ID pregleda: <code>{analysis.auditId ?? "—"}</code></p>
        <p>Izvorni statusi: {analysis.status} / {analysis.sourceAuditStatus} · Greška: {analysis.errorCode ?? "—"}</p>
        <p>Izvorno objašnjenje rezultata: {analysis.opportunity?.reason ?? "—"}</p>
        <p>Provider: {analysis.provider} · Model: {analysis.model} · Analysis v{analysis.analysisVersion} / Prompt v{analysis.promptVersion} · Tokeni: {analysis.inputTokens ?? "—"} input / {analysis.outputTokens ?? "—"} output</p>
        <ul>{analysis.result?.adjustments.map((a,i)=><li key={i}>{a}</li>)}</ul>
      </details>
    </>}
  </section>;
}
