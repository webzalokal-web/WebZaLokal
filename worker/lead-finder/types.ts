export const LEAD_SEARCH_DEFAULT_LIMIT = 20;
export const LEAD_SEARCH_MAX_LIMIT = 20;
export const LEAD_SEARCH_MONTHLY_REQUEST_LIMIT_DEFAULT = 100;
export const LEAD_SEARCH_MONTHLY_REQUEST_LIMIT_MAX = 1_000;
export const PROVIDER_REQUESTS_PER_SEARCH_MAX = 1;
export const GOOGLE_PLACES_PROVIDER = "google-places";

export type LeadSearchInput = {
  location: string;
  businessType: string;
  limit: number;
  refresh: boolean;
};

export type LeadPriority =
  | "UNCLASSIFIED"
  | "HIGH"
  | "GOOD"
  | "MEDIUM"
  | "LOW"
  | "REJECT";

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
  readonly maximumRequestsPerSearch: 1;
  search(input: LeadSearchInput): Promise<BusinessSearchProviderResult>;
}

export type PersistedLead = ProviderLead & {
  id: string;
  persistenceStatus: "created" | "updated";
  priority: LeadPriority;
  priorityReason: string | null;
  leadStatus: string;
  auditStatus: string;
  contactStatus: string;
  discoveredAt: string;
  lastCheckedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type LeadArchiveRecord = {
  id: string;
  provider: string;
  providerPlaceId: string;
  locationHint: string;
  businessTypeHint: string;
  priority: LeadPriority;
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

export type ArchivedSearchMatch = {
  searchId: string;
  provider: string;
  location: string;
  businessType: string;
  requestedLimit: number;
  returnedCount: number;
  createdAt: string;
};

export type ProviderUsage = {
  provider: string;
  periodKey: string;
  requestCount: number;
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
    monthlyProviderRequestCount: number;
    monthlyProviderRequestLimit: number;
    createdCount: number;
    updatedCount: number;
    storedLeadCount: number;
    refreshRequested: boolean;
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
  providerUsage: ProviderUsage;
};

export class LeadArchiveMatchError extends Error {
  constructor(public readonly match: ArchivedSearchMatch) {
    super("Ova je pretraga već zastupljena u Lead Archiveu.");
    this.name = "LeadArchiveMatchError";
  }
}

export class BusinessSearchProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
    public readonly retryAfterSeconds?: number,
    public readonly diagnosticCode?: string,
  ) {
    super(message);
    this.name = "BusinessSearchProviderError";
  }
}
