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
    createdCount: number;
    updatedCount: number;
    storedLeadCount: number;
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
};

type ApiError = {
  success: false;
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
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

export default function LeadFinder() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

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

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      loadSummary(controller.signal)
        .catch((loadError: unknown) => {
          if (loadError instanceof DOMException && loadError.name === "AbortError") return;
          setSummary(null);
        })
        .finally(() => setSummaryLoading(false));
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
        body: JSON.stringify(form),
      });
      const payload = await responsePayload(response);
      if (!response.ok || !isRecord(payload) || payload.success !== true) {
        const apiError: ApiError = isRecord(payload) && payload.success === false
          ? (payload as ApiError)
          : { success: false, message: "Pretragu nije moguće dovršiti." };
        setError(apiError);
        return;
      }

      setResult(payload as SearchResponse);
      await loadSummary();
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

  return (
    <main className="lead-finder-shell">
      <header className="lead-finder-header">
        <Link className="brand" href="/"><span className="brand-mark">WZL</span><span>WebZaLokal</span></Link>
        <div><span className="lead-finder-badge">Interno · Milestone 1</span><strong>Lead Finder</strong></div>
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
          <span>Trajno spremljeni ID-jevi</span>
          <strong>{summaryLoading ? "…" : summary?.storedLeadCount ?? "—"}</strong>
          <small>Google Place ID + interni status</small>
        </article>
        <article>
          <span>Dosadašnje pretrage</span>
          <strong>{summaryLoading ? "…" : summary?.searchCount ?? "—"}</strong>
          <small>Bez spremanja Google detalja</small>
        </article>
        <article>
          <span>Troškovna zaštita</span>
          <strong>1</strong>
          <small>provider poziv po pretrazi</small>
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
              <strong>Pretraga nije završena</strong>
              <p>{error.message ?? "Provjerite podatke i pokušajte ponovno."}</p>
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
                    <th>D1</th>
                  </tr>
                </thead>
                <tbody>
                  {result.leads.map((lead) => (
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
                      <td><span className={`lead-persisted ${lead.persistenceStatus}`}>{lead.persistenceStatus === "created" ? "Novo" : "Ažurirano"}</span></td>
                    </tr>
                  ))}
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
    </main>
  );
}
