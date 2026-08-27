export const LEAD_SEARCH_DEFAULT_LIMIT = 20;
export const LEAD_SEARCH_MAX_LIMIT = 20;
export const GOOGLE_PLACES_PROVIDER = "google-places";

export type LeadSearchInput = {
  location: string;
  businessType: string;
  limit: number;
};

export type ProviderAttribution = {
  provider: string;
  providerUri: string | null;
};

export type ProviderLead = {
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
};

export type BusinessSearchProviderResult = {
  leads: ProviderLead[];
  providerRequestCount: number;
  rawResultCount: number;
};

export interface BusinessSearchProvider {
  readonly name: string;
  search(input: LeadSearchInput): Promise<BusinessSearchProviderResult>;
}

export type PersistedLead = ProviderLead & {
  id: string;
  persistenceStatus: "created" | "updated";
  createdAt: string;
  updatedAt: string;
};

export type SearchPersistenceSummary = {
  searchId: string;
  createdCount: number;
  updatedCount: number;
  storedLeadCount: number;
  leads: PersistedLead[];
};

export type LeadSearchResponse = {
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
  leads: PersistedLead[];
  provider: {
    name: string;
    attribution: "Google Maps" | string;
    contentStored: false;
  };
};

export type RecentLeadSearch = {
  id: string;
  location: string;
  businessType: string;
  requestedLimit: number;
  returnedCount: number;
  providerRequestCount: number;
  createdAt: string;
};

export type LeadFinderSummary = {
  storedLeadCount: number;
  searchCount: number;
  recentSearches: RecentLeadSearch[];
};

export class BusinessSearchProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "BusinessSearchProviderError";
  }
}
