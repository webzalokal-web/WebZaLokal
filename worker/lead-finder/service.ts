import {
  findArchivedSearch,
  persistLeadSearch,
  reserveProviderRequest,
} from "./repository";
import type {
  BusinessSearchProvider,
  LeadSearchInput,
  LeadSearchResponse,
  ProviderLead,
} from "./types";
import {
  BusinessSearchProviderError,
  LeadArchiveMatchError,
  PROVIDER_REQUESTS_PER_SEARCH_MAX,
} from "./types";

function deduplicateProviderLeads(leads: ProviderLead[]) {
  const seen = new Set<string>();
  return leads.filter((lead) => {
    const key = `${lead.provider}\u0000${lead.providerPlaceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runLeadSearch(
  db: D1Database,
  provider: BusinessSearchProvider,
  input: LeadSearchInput,
  monthlyRequestLimit: number,
): Promise<LeadSearchResponse> {
  if (!input.refresh) {
    const archivedSearch = await findArchivedSearch(db, provider.name, input);
    if (archivedSearch) throw new LeadArchiveMatchError(archivedSearch);
  }

  if (provider.maximumRequestsPerSearch !== PROVIDER_REQUESTS_PER_SEARCH_MAX) {
    throw new BusinessSearchProviderError(
      "PROVIDER_REQUEST_LIMIT_UNSAFE",
      "Provider ne zadovoljava sigurnosno ograničenje jednog zahtjeva po pretrazi.",
      500,
    );
  }

  const usage = await reserveProviderRequest(db, provider.name, monthlyRequestLimit);
  const providerResult = await provider.search(input);
  if (providerResult.providerRequestCount !== PROVIDER_REQUESTS_PER_SEARCH_MAX) {
    throw new BusinessSearchProviderError(
      "PROVIDER_REQUEST_LIMIT_EXCEEDED",
      "Provider je prijavio neočekivan broj zahtjeva; rezultat nije spremljen.",
      502,
    );
  }

  const leads = deduplicateProviderLeads(providerResult.leads).slice(0, input.limit);
  const persisted = await persistLeadSearch(
    db,
    input,
    leads,
    provider.name,
    providerResult.providerRequestCount,
  );

  return {
    success: true,
    search: {
      id: persisted.searchId,
      location: input.location,
      businessType: input.businessType,
      requestedLimit: input.limit,
      returnedCount: persisted.leads.length,
      rawResultCount: providerResult.rawResultCount,
      providerRequestCount: providerResult.providerRequestCount,
      monthlyProviderRequestCount: usage.requestCount,
      monthlyProviderRequestLimit: monthlyRequestLimit,
      createdCount: persisted.createdCount,
      updatedCount: persisted.updatedCount,
      storedLeadCount: persisted.storedLeadCount,
      refreshRequested: input.refresh,
    },
    leads: persisted.leads,
    provider: {
      name: provider.name,
      attribution: "Google Maps",
      contentStored: false,
    },
  };
}
