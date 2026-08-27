import { persistLeadSearch } from "./repository";
import type {
  BusinessSearchProvider,
  LeadSearchInput,
  LeadSearchResponse,
  ProviderLead,
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
): Promise<LeadSearchResponse> {
  const providerResult = await provider.search(input);
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
      createdCount: persisted.createdCount,
      updatedCount: persisted.updatedCount,
      storedLeadCount: persisted.storedLeadCount,
    },
    leads: persisted.leads,
    provider: {
      name: provider.name,
      attribution: "Google Maps",
      contentStored: false,
    },
  };
}
