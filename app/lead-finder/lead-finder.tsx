"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type ProviderAttribution = {
  provider: string;
  providerUri: string | null;
};

type Lead = {
  id: string;
  provider: string;
  providerPlaceId: string;
  name: string;
  businessType: string;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
  websiteUrl: string | null;
  phone: string | null;
  hasWebsite: boolean;
  sourceUrl: string | null;
  attributions: ProviderAttribution[];
  persistenceStatus: "created" | "updated";
  priority: "UNCLASSIFIED" | "HIGH" | "GOOD" | "MEDIUM" | "LOW" | "REJECT";
  priorityReason: string | null;
  leadStatus: string;
  auditStatus: string;
  contactStatus: string;
  discoveredAt: string;
  lastCheckedAt: string;
  createdAt: string;
  updatedAt: string;
};

type SearchResponse = {
  success: true;
  search: {
    id: string;
    location: string;
    businessType: string;
    requestedLimit: number;
    returnedCount: number;
    rawResultCount: number;
    providerRequestCount: number;
    monthlyProviderRequestCount: number;
    monthlyProviderRequestLimit: number;
    createdCount: number;
    updatedCount: number;
    storedLeadCount: number;
    refreshRequested: boolean;
  };
  leads: Lead[];
};

type RecentSearch = {
  id: string;
  location: string;
  businessType: string;
  requestedLimit: number;
  returnedCount: number;
  providerRequestCount: number;
  createdAt: string;
};

type SummaryResponse = {
  success: true;
  storedLeadCount: number;
  searchCount: number;
  recentSearches: RecentSearch[];
  providerUsage: {
    provider: string;
    periodKey: string;
    requestCount: number;
  };
  monthlyProviderRequestLimit: number;
};

type LeadArchiveRecord = {
  id: string;
  provider: string;
  providerPlaceId: string;
  locationHint: string;
  businessTypeHint: string;
  priority: Lead["priority"];
  priorityReason: string | null;
  leadStatus: string;
  auditStatus: string;
  contactStatus: string;
  emailStatus: string | null;
  websiteQualityScore: number | null;
  opportunityScore: number | null;
  discoveredAt: string;
  lastCheckedAt: string;
  updatedAt: string;
};

type ArchiveResponse = {
  success: true;
  leads: LeadArchiveRecord[];
};

type ArchiveMatch = {
  searchId: string;
  provider: string;
  location: string;
  businessType: string;
  requestedLimit: number;
  returnedCount: number;
  createdAt: string;
};

type ApiError = {
  success: false;
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  archiveMatch?: ArchiveMatch;
  refreshRequired?: boolean;
  providerRequestCount?: number;
  diagnosticCode?: string;
  diagnosticDetail?: string;
};

type AuditCheckStatus = "PASS" | "FAIL" | "UNKNOWN";
type AuditStatus = "PENDING" | "RUNNING" | "COMPLETE" | "PARTIAL" | "FAILED";

type AuditSignal = {
  status: AuditCheckStatus;
  evidence: Array<{ pageUrl: string | null; detail: string; value?: string | number | boolean | null }>;
};

type PageSpeedMobile = {
  status: "SUCCESS" | "UNAVAILABLE";
  performanceScore: number | null;
  metrics: Record<string, {
    displayValue: string | null;
    numericValue: number | null;
    numericUnit: string | null;
    score: number | null;
  }>;
  errorCode: string | null;
};

type AuditSummary = {
  id: string;
  leadId: string;
  websiteUrl: string;
  finalUrl: string | null;
  auditStatus: AuditStatus;
  auditedAt: string | null;
  firecrawlPagesUsed: number;
  pagesChecked: number;
  pageSpeedMobile: PageSpeedMobile | null;
  errorDetails: Array<{ component: string; code: string; pageUrl: string | null }>;
};

type AuditPage = {
  id: string;
  position: number;
  pageKind: "homepage" | "contact" | "services" | "about" | "commercial";
  requestedUrl: string;
  finalUrl: string | null;
  status: "SUCCESS" | "FAILED";
  httpStatus: number | null;
  title: string | null;
  metaDescription: string | null;
  headings: Array<{ level: 1 | 2 | 3; text: string }>;
  relevantLinks: Array<{ url: string; text: string | null; kind: string }>;
  technicalSignals: Record<string, AuditSignal>;
  conversionSignals: Record<string, AuditSignal>;
  seoSignals: Record<string, AuditSignal>;
  errorCode: string | null;
};

type AuditDetail = AuditSummary & {
  refreshRequested: boolean;
  startedAt: string;
  firecrawlAttemptCount: number;
  pageSpeedAttemptCount: number;
  technicalSignals: Record<string, AuditSignal>;
  conversionSignals: Record<string, AuditSignal>;
  seoSignals: Record<string, AuditSignal>;
  contentSignals: Record<string, unknown>;
  pages: AuditPage[];
};

type AuditsResponse = { success: true; audits: AuditSummary[] };
type AuditDetailResponse = { success: true; audit: AuditDetail };
type AuditRunResponse = AuditDetailResponse & {
  reused: boolean;
  externalRequests: { firecrawl: number; pageSpeed: number };
};

const initialForm = {
  location: "Rijeka, Croatia",
  businessType: "restaurant",
  limit: 20,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function responsePayload(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function displayDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hr-HR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function websiteLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Otvori web";
  }
}

const signalLabels: Record<string, string> = {
  availability: "Dostupnost",
  https: "HTTPS",
  mobileViewport: "Mobile viewport",
  reviewedPages: "Pregledane stranice",
  title: "Title",
  metaDescription: "Meta description",
  h1: "H1",
  phone: "Telefon",
  email: "Javni email",
  contactPage: "Kontakt stranica",
  contactForm: "Kontakt forma",
  booking: "Rezervacija",
  onlineOrdering: "Online naručivanje",
  primaryCta: "Glavni CTA",
  messaging: "Messaging",
  socialProfiles: "Društvene mreže",
  mapsDirections: "Karta / upute",
  menuServicesPricing: "Meni / usluge / cijene",
};

function SignalList({ signals }: { signals: Record<string, AuditSignal> }) {
  return (
    <ul className="audit-signal-list">
      {Object.entries(signals).map(([key, signal]) => (
        <li key={key}>
          <span className={`audit-check ${signal.status.toLowerCase()}`}>{signal.status}</span>
          <div>
            <strong>{signalLabels[key] ?? key}</strong>
            <small>
              {signal.evidence[0]?.detail ?? "Nema evidence detalja."}
              {signal.evidence[0]?.value !== undefined && signal.evidence[0]?.value !== null
                ? ` · ${String(signal.evidence[0].value)}`
                : ""}
            </small>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function LeadFinder() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [archive, setArchive] = useState<ArchiveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [audits, setAudits] = useState<AuditsResponse | null>(null);
  const [selectedAudit, setSelectedAudit] = useState<AuditDetail | null>(null);
  const [auditLoadingLeadId, setAuditLoadingLeadId] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const auditsByLead = useMemo(
    () => new Map((audits?.audits ?? []).map((audit) => [audit.leadId, audit])),
    [audits],
  );

  const attributions = useMemo(() => {
    const unique = new Map<string, ProviderAttribution>();
    for (const lead of result?.leads ?? []) {
      for (const attribution of lead.attributions) {
        unique.set(attribution.provider, attribution);
      }
    }
    return Array.from(unique.values());
  }, [result]);

  const loadSummary = async (signal?: AbortSignal) => {
    const response = await fetch("/api/lead-finder/summary", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    });
    const payload = await responsePayload(response);
    if (!response.ok || !isRecord(payload) || payload.success !== true) {
      throw new Error("summary_unavailable");
    }
    setSummary(payload as SummaryResponse);
  };

  const loadArchive = async (signal?: AbortSignal) => {
    const response = await fetch("/api/lead-finder/archive", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    });
    const payload = await responsePayload(response);
    if (!response.ok || !isRecord(payload) || payload.success !== true) {
      throw new Error("archive_unavailable");
    }
    setArchive(payload as ArchiveResponse);
  };

  const loadAudits = async (signal?: AbortSignal) => {
    const response = await fetch("/api/lead-finder/audits", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    });
    const payload = await responsePayload(response);
    if (!response.ok || !isRecord(payload) || payload.success !== true) {
      throw new Error("audits_unavailable");
    }
    setAudits(payload as AuditsResponse);
  };

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      Promise.allSettled([
        loadSummary(controller.signal),
        loadArchive(controller.signal),
        loadAudits(controller.signal),
      ])
        .then((results) => {
          if (results[0].status === "rejected") setSummary(null);
          if (results[1].status === "rejected") setArchive(null);
          if (results[2].status === "rejected") setAudits(null);
        })
        .finally(() => setSummaryLoading(false));
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const search = async (refresh: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/lead-finder/search", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...form, refresh }),
      });
      const payload = await responsePayload(response);
      if (!response.ok || !isRecord(payload) || payload.success !== true) {
        const apiError: ApiError = isRecord(payload) && payload.success === false
          ? (payload as ApiError)
          : { success: false, message: "Pretragu nije moguće dovršiti." };
        setError(apiError);
        await loadSummary().catch(() => undefined);
        return;
      }

      setResult(payload as SearchResponse);
      await Promise.all([loadSummary(), loadArchive(), loadAudits()]);
    } catch {
      setError({
        success: false,
        code: "NETWORK_ERROR",
        message: "Veza s Lead Finderom nije uspjela. Pokušajte ponovno.",
      });
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void search(false);
  };

  const openAudit = async (leadId: string) => {
    setAuditLoadingLeadId(leadId);
    setAuditError(null);
    try {
      const response = await fetch(`/api/lead-finder/audits/${leadId}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const payload = await responsePayload(response);
      if (!response.ok || !isRecord(payload) || payload.success !== true) {
        throw new Error(isRecord(payload) && typeof payload.message === "string" ? payload.message : "Audit nije dostupan.");
      }
      setSelectedAudit((payload as AuditDetailResponse).audit);
    } catch (caught) {
      setAuditError(caught instanceof Error ? caught.message : "Audit nije dostupan.");
    } finally {
      setAuditLoadingLeadId(null);
    }
  };

  const runAudit = async (leadId: string, websiteUrl: string | null, refresh: boolean) => {
    if (refresh && !window.confirm("Re-audit će napraviti nove Firecrawl pozive i jedan PageSpeed poziv. Nastaviti?")) return;
    setAuditLoadingLeadId(leadId);
    setAuditError(null);
    try {
      const response = await fetch("/api/lead-finder/audits", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, websiteUrl, refresh }),
      });
      const payload = await responsePayload(response);
      if (!response.ok || !isRecord(payload) || payload.success !== true) {
        throw new Error(isRecord(payload) && typeof payload.message === "string" ? payload.message : "Audit nije moguće pokrenuti.");
      }
      const audit = (payload as AuditRunResponse).audit;
      setSelectedAudit(audit);
      await Promise.all([loadAudits(), loadArchive()]);
    } catch (caught) {
      setAuditError(caught instanceof Error ? caught.message : "Audit nije moguće pokrenuti.");
    } finally {
      setAuditLoadingLeadId(null);
    }
  };

  return (
    <main className="lead-finder-shell">
      <header className="lead-finder-header">
        <Link className="brand" href="/"><span className="brand-mark">WZL</span><span>WebZaLokal</span></Link>
        <div><span className="lead-finder-badge">Interno · Milestone 2</span><strong>Lead Finder</strong></div>
        <Link className="lead-finder-back" href="/studio/">Studio Lite →</Link>
      </header>

      <section className="lead-finder-intro">
        <div>
          <p className="section-kicker">Search → normalize → store → display</p>
          <h1>Pronađi stvarne lokale bez ručnog pretraživanja.</h1>
          <p>Odaberi lokaciju, vrstu poslovanja i do 20 rezultata. Jedan klik radi najviše jedan provider zahtjev.</p>
        </div>
        <div className="lead-finder-security"><i aria-hidden="true" /><span>Zaštićena interna ruta</span></div>
      </section>

      <section className="lead-finder-metrics" aria-label="Lead Finder sažetak">
        <article>
          <span>Lead Archive</span>
          <strong>{summaryLoading ? "…" : summary?.storedLeadCount ?? "—"}</strong>
          <small>trajni D1 zapisi</small>
        </article>
        <article>
          <span>Dosadašnje pretrage</span>
          <strong>{summaryLoading ? "…" : summary?.searchCount ?? "—"}</strong>
          <small>Bez spremanja Google detalja</small>
        </article>
        <article>
          <span>Google pozivi ovaj mjesec</span>
          <strong>{summaryLoading ? "…" : `${summary?.providerUsage.requestCount ?? 0}/${summary?.monthlyProviderRequestLimit ?? 100}`}</strong>
          <small>UTC mjesec · najviše 1 po pretrazi</small>
        </article>
      </section>

      <div className="lead-finder-grid">
        <section className="lead-search-card">
          <div className="lead-card-heading">
            <div><span>Nova pretraga</span><h2>Business Search</h2></div>
            <small>Maksimalno 20 rezultata</small>
          </div>

          <form onSubmit={submit} className="lead-search-form">
            <label>
              <span>Lokacija</span>
              <input
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                aria-invalid={Boolean(error?.fieldErrors?.location)}
                placeholder="npr. Rijeka, Croatia"
                minLength={2}
                maxLength={120}
                required
              />
              {error?.fieldErrors?.location && <small>{error.fieldErrors.location}</small>}
            </label>
            <label>
              <span>Vrsta poslovanja</span>
              <input
                value={form.businessType}
                onChange={(event) => setForm((current) => ({ ...current, businessType: event.target.value }))}
                aria-invalid={Boolean(error?.fieldErrors?.businessType)}
                placeholder="npr. restaurant"
                minLength={2}
                maxLength={80}
                required
              />
              {error?.fieldErrors?.businessType && <small>{error.fieldErrors.businessType}</small>}
            </label>
            <label className="lead-limit-field">
              <span>Broj rezultata</span>
              <input
                type="number"
                value={form.limit}
                onChange={(event) => setForm((current) => ({ ...current, limit: Number(event.target.value) }))}
                aria-invalid={Boolean(error?.fieldErrors?.limit)}
                min={1}
                max={20}
                step={1}
                required
              />
              {error?.fieldErrors?.limit && <small>{error.fieldErrors.limit}</small>}
            </label>
            <button type="submit" disabled={loading}>
              <span>{loading ? "Tražim lokale…" : "Pronađi leadove"}</span>
              <b aria-hidden="true">{loading ? "…" : "→"}</b>
            </button>
          </form>

          {error && (
            <div className="lead-error" role="alert">
              <strong>{error.code === "ARCHIVE_MATCH_FOUND" ? "Pretraga je već arhivirana" : "Pretraga nije završena"}</strong>
              <p>{error.message ?? "Provjerite podatke i pokušajte ponovno."}</p>
              {error.diagnosticDetail && <p className="lead-diagnostic-detail">Detalj: <code>{error.diagnosticDetail}</code></p>}
              {error.archiveMatch && (
                <p>
                  Zadnji zapis: {displayDate(error.archiveMatch.createdAt)} · {error.archiveMatch.returnedCount} rezultata.
                </p>
              )}
              {error.refreshRequired && (
                <button className="lead-refresh-button" type="button" disabled={loading} onClick={() => void search(true)}>
                  Osvježi uz 1 novi Google poziv
                </button>
              )}
            </div>
          )}

          <aside className="lead-data-note">
            <strong>Što se sprema?</strong>
            <p>D1 trajno sprema interni lead ID, provider, Google Place ID, tvoju kategoriju i statuse. Naziv, adresa, rating, telefon i web prikazuju se iz svježeg Google odgovora i ne spremaju se.</p>
          </aside>
        </section>

        <aside className="lead-history-card">
          <div className="lead-card-heading">
            <div><span>D1 zapis</span><h2>Zadnje pretrage</h2></div>
          </div>
          {summaryLoading ? (
            <p className="lead-history-empty">Učitavam sažetak…</p>
          ) : summary?.recentSearches.length ? (
            <ol>
              {summary.recentSearches.map((search) => (
                <li key={search.id}>
                  <div><strong>{search.location}</strong><span>{search.businessType}</span></div>
                  <p><b>{search.returnedCount}</b> rezultata · {search.providerRequestCount} poziv</p>
                  <time dateTime={search.createdAt}>{displayDate(search.createdAt)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="lead-history-empty">Još nema spremljenih pretraga.</p>
          )}
        </aside>
      </div>

      <section className="lead-results-card" aria-live="polite">
        <div className="lead-results-heading">
          <div>
            <span>Rezultat pretrage</span>
            <h2>{result ? `${result.search.businessType} · ${result.search.location}` : "Leadovi će se prikazati ovdje"}</h2>
          </div>
          {result && (
            <div className="lead-results-stats">
              <span><b>{result.search.returnedCount}</b> pronađeno</span>
              <span><b>{result.search.createdCount}</b> novo</span>
              <span><b>{result.search.updatedCount}</b> osvježeno</span>
              <span><b>{result.search.providerRequestCount}</b> API poziv</span>
              <span><b>{result.search.monthlyProviderRequestCount}/{result.search.monthlyProviderRequestLimit}</b> ovaj mjesec</span>
            </div>
          )}
        </div>

        {!result ? (
          <div className="lead-results-empty">
            <i aria-hidden="true">⌕</i>
            <strong>Spremno za prvi Rijeka test.</strong>
            <p>Zadane vrijednosti odgovaraju acceptance scenariju: Rijeka, restaurant, 20.</p>
          </div>
        ) : result.leads.length === 0 ? (
          <div className="lead-results-empty">
            <i aria-hidden="true">0</i>
            <strong>Nema rezultata.</strong>
            <p>Provider je uspješno odgovorio, ali za ovu kombinaciju nije pronađen relevantan business.</p>
          </div>
        ) : (
          <div className="lead-table-container">
            <div className="lead-provider-attribution" translate="no">Google Maps</div>
            <div className="lead-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Vrsta</th>
                    <th>Adresa</th>
                    <th>Rating</th>
                    <th>Recenzije</th>
                    <th>Website</th>
                    <th>Telefon</th>
                    <th>Audit</th>
                    <th>D1</th>
                  </tr>
                </thead>
                <tbody>
                  {result.leads.map((lead) => {
                    const existingAudit = auditsByLead.get(lead.id);
                    const auditBusy = auditLoadingLeadId === lead.id;
                    return (
                    <tr key={lead.id}>
                      <td className="lead-business-cell">
                        <strong>{lead.name}</strong>
                        {lead.sourceUrl && <a href={lead.sourceUrl} target="_blank" rel="noreferrer">Izvor ↗</a>}
                      </td>
                      <td>{lead.businessType}</td>
                      <td className="lead-address-cell">{lead.address ?? <span className="lead-missing">Nije dostupno</span>}</td>
                      <td>{lead.rating !== null ? <strong>{lead.rating.toFixed(1)}</strong> : <span className="lead-missing">—</span>}</td>
                      <td>{lead.reviewCount !== null ? lead.reviewCount.toLocaleString("hr-HR") : <span className="lead-missing">—</span>}</td>
                      <td>
                        {lead.websiteUrl ? (
                          <a className="lead-website yes" href={lead.websiteUrl} target="_blank" rel="noreferrer"><i />{websiteLabel(lead.websiteUrl)}</a>
                        ) : (
                          <span className="lead-website no"><i />Nema web</span>
                        )}
                      </td>
                      <td>{lead.phone ? <a className="lead-phone" href={`tel:${lead.phone}`}>{lead.phone}</a> : <span className="lead-missing">—</span>}</td>
                      <td>
                        {existingAudit ? (
                          <button className="audit-table-button" type="button" disabled={auditBusy} onClick={() => void openAudit(lead.id)}>
                            {auditBusy ? "Učitavam…" : existingAudit.auditStatus}
                          </button>
                        ) : lead.websiteUrl ? (
                          <button className="audit-table-button start" type="button" disabled={auditBusy} onClick={() => void runAudit(lead.id, lead.websiteUrl, false)}>
                            {auditBusy ? "Auditiram…" : "Auditiraj"}
                          </button>
                        ) : (
                          <span className="lead-missing">Bez websitea</span>
                        )}
                      </td>
                      <td><span className={`lead-persisted ${lead.persistenceStatus}`}>{lead.persistenceStatus === "created" ? "Novo" : "Ažurirano"}</span></td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            {attributions.length > 0 && (
              <div className="lead-third-party-attributions">
                <span>Dodatni izvori:</span>
                {attributions.map((attribution) => attribution.providerUri ? (
                  <a key={attribution.provider} href={attribution.providerUri} target="_blank" rel="noreferrer">{attribution.provider}</a>
                ) : <span key={attribution.provider}>{attribution.provider}</span>)}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="website-audit-card" aria-live="polite">
        <div className="lead-results-heading">
          <div>
            <span>Evidence layer · D1</span>
            <h2>{selectedAudit ? `Website audit · ${websiteLabel(selectedAudit.finalUrl ?? selectedAudit.websiteUrl)}` : "Automated Website Audit"}</h2>
          </div>
          {selectedAudit && (
            <div className="audit-heading-actions">
              <span className={`audit-status ${selectedAudit.auditStatus.toLowerCase()}`}>{selectedAudit.auditStatus}</span>
              <button
                type="button"
                disabled={auditLoadingLeadId === selectedAudit.leadId}
                onClick={() => void runAudit(selectedAudit.leadId, selectedAudit.websiteUrl, true)}
              >
                {auditLoadingLeadId === selectedAudit.leadId ? "Re-auditiram…" : "Refresh / Re-audit"}
              </button>
            </div>
          )}
        </div>

        {auditError && <div className="lead-error audit-error" role="alert"><strong>Audit nije završen</strong><p>{auditError}</p></div>}

        {!selectedAudit ? (
          <div className="lead-results-empty audit-empty">
            <i aria-hidden="true">◎</i>
            <strong>Odaberi lead koji ima website.</strong>
            <p>Prvi audit koristi najviše 5 Firecrawl stranica i 1 PageSpeed mobile poziv. Ponovno otvaranje spremljenog audita nema vanjskih poziva.</p>
          </div>
        ) : (
          <>
            <div className="audit-summary-grid">
              <article><span>Status</span><strong>{selectedAudit.auditStatus}</strong></article>
              <article><span>Zadnji audit</span><strong>{selectedAudit.auditedAt ? displayDate(selectedAudit.auditedAt) : "U tijeku"}</strong></article>
              <article><span>Stranice</span><strong>{selectedAudit.firecrawlPagesUsed}/{selectedAudit.pagesChecked}</strong><small>uspješno / pregledano</small></article>
              <article><span>PageSpeed mobile</span><strong>{selectedAudit.pageSpeedMobile?.performanceScore ?? "—"}</strong><small>{selectedAudit.pageSpeedMobile?.status ?? "UNAVAILABLE"}</small></article>
            </div>

            <div className="audit-signal-columns">
              <article><h3>Technical</h3><SignalList signals={selectedAudit.technicalSignals} /></article>
              <article><h3>SEO</h3><SignalList signals={selectedAudit.seoSignals} /></article>
              <article><h3>Conversion</h3><SignalList signals={selectedAudit.conversionSignals} /></article>
            </div>

            <div className="audit-pages">
              <div className="audit-section-heading"><h3>Pregledane stranice</h3><span>Maksimalno 5 po audit runu</span></div>
              <ol>
                {selectedAudit.pages.map((page) => (
                  <li key={page.id}>
                    <span className={`audit-check ${page.status === "SUCCESS" ? "pass" : "fail"}`}>{page.status}</span>
                    <div>
                      <strong>{page.pageKind} · {page.title ?? websiteLabel(page.finalUrl ?? page.requestedUrl)}</strong>
                      <a href={page.finalUrl ?? page.requestedUrl} target="_blank" rel="noreferrer">{page.finalUrl ?? page.requestedUrl}</a>
                    </div>
                    <span>{page.httpStatus ?? page.errorCode ?? "UNKNOWN"}</span>
                  </li>
                ))}
              </ol>
            </div>

            {selectedAudit.errorDetails.length > 0 && (
              <div className="audit-errors">
                <strong>Partial / error detalji</strong>
                <ul>{selectedAudit.errorDetails.map((detail, index) => <li key={`${detail.component}-${detail.code}-${index}`}>{detail.component}: {detail.code}</li>)}</ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="lead-archive-card" aria-live="polite">
        <div className="lead-results-heading">
          <div>
            <span>D1 source of truth</span>
            <h2>Trajni Lead Archive</h2>
          </div>
          <p>{archive?.leads.length ?? 0} prikazanih · najviše 200</p>
        </div>

        {summaryLoading ? (
          <p className="lead-history-empty">Učitavam arhivu…</p>
        ) : !archive?.leads.length ? (
          <div className="lead-results-empty lead-archive-empty">
            <i aria-hidden="true">Σ</i>
            <strong>Arhiva je spremna za prvi discovery.</strong>
            <p>Svaki otkriveni provider ID ostaje spremljen i nakon budućeg filtriranja ili promjene prioriteta.</p>
          </div>
        ) : (
          <div className="lead-table-container lead-archive-table">
            <div className="lead-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Provider ID</th>
                    <th>Lokacija</th>
                    <th>Vrsta</th>
                    <th>Prioritet</th>
                    <th>Lead status</th>
                    <th>Audit</th>
                    <th>Kontakt</th>
                    <th>Otkriven</th>
                    <th>Zadnja provjera</th>
                  </tr>
                </thead>
                <tbody>
                  {archive.leads.map((lead) => {
                    const existingAudit = auditsByLead.get(lead.id);
                    return (
                    <tr key={lead.id}>
                      <td className="lead-archive-id"><strong>{lead.providerPlaceId}</strong><span>{lead.provider}</span></td>
                      <td>{lead.locationHint}</td>
                      <td>{lead.businessTypeHint}</td>
                      <td><span className={`lead-priority ${lead.priority.toLowerCase()}`}>{lead.priority}</span></td>
                      <td>{lead.leadStatus}</td>
                      <td>
                        {existingAudit ? (
                          <button className="audit-table-button" type="button" disabled={auditLoadingLeadId === lead.id} onClick={() => void openAudit(lead.id)}>
                            {auditLoadingLeadId === lead.id ? "Učitavam…" : existingAudit.auditStatus}
                          </button>
                        ) : lead.auditStatus}
                      </td>
                      <td>{lead.contactStatus}</td>
                      <td><time dateTime={lead.discoveredAt}>{displayDate(lead.discoveredAt)}</time></td>
                      <td><time dateTime={lead.lastCheckedAt}>{displayDate(lead.lastCheckedAt)}</time></td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
