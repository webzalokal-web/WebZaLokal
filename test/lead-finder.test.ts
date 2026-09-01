import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  GooglePlacesProvider,
  googlePlacesRequestFieldMask,
} from "../worker/lead-finder/google-places-provider";
import {
  ensureLeadFinderSchema,
  getLeadArchive,
} from "../worker/lead-finder/repository";
import { runLeadSearch } from "../worker/lead-finder/service";
import {
  BusinessSearchProviderError,
  LeadArchiveMatchError,
  type BusinessSearchProvider,
  type ProviderLead,
} from "../worker/lead-finder/types";
import { validateLeadSearchInput } from "../worker/lead-finder/validation";

const input = {
  location: "Rijeka, Croatia",
  businessType: "restaurant",
  limit: 20,
  refresh: false,
};

const validTestApiKey = "AIzaSyD_test_key_12345678901234567890";

function providerLead(providerPlaceId: string, overrides: Partial<ProviderLead> = {}): ProviderLead {
  return {
    provider: "fake-provider",
    providerPlaceId,
    name: `Restaurant ${providerPlaceId}`,
    businessType: "Restaurant",
    address: "Korzo 1, Rijeka",
    city: "Rijeka",
    country: "Hrvatska",
    latitude: 45.3271,
    longitude: 14.4422,
    rating: 4.8,
    reviewCount: 842,
    websiteUrl: null,
    phone: null,
    hasWebsite: false,
    sourceUrl: null,
    attributions: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await ensureLeadFinderSchema(env.LEADS_DB);
  await env.LEADS_DB.batch([
    env.LEADS_DB.prepare("DELETE FROM lead_finder_search_leads"),
    env.LEADS_DB.prepare("DELETE FROM lead_finder_searches"),
    env.LEADS_DB.prepare("DELETE FROM lead_finder_leads"),
    env.LEADS_DB.prepare("DELETE FROM lead_finder_provider_usage"),
  ]);
});

describe("Lead Finder input validation", () => {
  it("accepts the Rijeka acceptance-test input", () => {
    expect(validateLeadSearchInput(input)).toEqual({ success: true, value: input });
  });

  it("rejects empty fields and any limit above the one-request maximum", () => {
    const result = validateLeadSearchInput({ location: "", businessType: "x", limit: 21 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors).toHaveProperty("location");
      expect(result.fieldErrors).toHaveProperty("businessType");
      expect(result.fieldErrors).toHaveProperty("limit");
    }
  });
});

describe("Google Places provider", () => {
  it("uses one bounded Text Search request and normalizes partial data", async () => {
    let request: Request | null = null;
    const fetcher = async (resource: string | URL | Request, init?: RequestInit) => {
      request = new Request(resource, init);
      return Response.json({
        places: [
          {
            id: "ChIJ-test-1",
            displayName: { text: "Konoba Test" },
            primaryType: "restaurant",
            primaryTypeDisplayName: { text: "Restoran" },
            formattedAddress: "Korzo 1, 51000 Rijeka, Hrvatska",
            addressComponents: [
              { longText: "Rijeka", shortText: "Rijeka", types: ["locality"] },
              { longText: "Hrvatska", shortText: "HR", types: ["country"] },
            ],
            location: { latitude: 45.3271, longitude: 14.4422 },
            rating: 4.8,
            userRatingCount: 842,
            websiteUri: "https://konoba.example/",
            nationalPhoneNumber: "051 123 456",
            googleMapsUri: "https://maps.google.com/?cid=123",
            attributions: [{ provider: "Example Data", providerUri: "https://data.example/" }],
          },
          {
            id: "ChIJ-test-2",
            displayName: { text: "Bistro Bez Weba" },
            formattedAddress: "Rijeka, Hrvatska",
          },
        ],
      });
    };

    const result = await new GooglePlacesProvider(`  ${validTestApiKey}  `, fetcher).search(input);

    expect(request).not.toBeNull();
    expect(request?.url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("X-Goog-Api-Key")).toBe(validTestApiKey);
    expect(request?.headers.get("X-Goog-FieldMask")).toBe(googlePlacesRequestFieldMask);
    expect(request?.headers.get("X-Goog-FieldMask")).not.toContain("*");
    expect(request?.headers.get("X-Goog-FieldMask")).not.toContain("addressComponents");
    expect(request?.headers.get("X-Goog-FieldMask")).not.toContain("location");
    expect(request?.headers.get("X-Goog-FieldMask")).not.toContain("primaryType");
    expect(request?.headers.get("X-Goog-FieldMask")).not.toContain("googleMapsUri");
    expect(await request?.json()).toEqual({
      textQuery: "restaurant in Rijeka, Croatia",
      pageSize: 20,
    });
    expect(result.providerRequestCount).toBe(1);
    expect(result.rawResultCount).toBe(2);
    expect(result.leads).toHaveLength(2);
    expect(result.leads[0]).toMatchObject({
      providerPlaceId: "ChIJ-test-1",
      name: "Konoba Test",
      city: null,
      country: null,
      hasWebsite: true,
      reviewCount: 842,
    });
    expect(result.leads[1]).toMatchObject({
      providerPlaceId: "ChIJ-test-2",
      businessType: "restaurant",
      rating: null,
      reviewCount: null,
      websiteUrl: null,
      phone: null,
      hasWebsite: false,
    });
  });

  it("maps quota errors without retrying", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return new Response(null, { status: 429 });
    };

    await expect(new GooglePlacesProvider(validTestApiKey, fetcher).search(input)).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      httpStatus: 429,
    } satisfies Partial<BusinessSearchProviderError>);
    expect(calls).toBe(1);
  });

  it("rejects a malformed secret before making an outbound request", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return Response.json({ places: [] });
    };

    await expect(new GooglePlacesProvider("GOOGLE_PLACES_API_KEY=bad", fetcher).search(input))
      .rejects.toMatchObject({
        code: "PROVIDER_CONFIGURATION_ERROR",
        diagnosticCode: "INVALID_API_KEY_FORMAT",
      } satisfies Partial<BusinessSearchProviderError>);
    expect(calls).toBe(0);
  });

  it("returns a safe diagnostic for a Worker fetch exception", async () => {
    const fetcher = async () => {
      throw new TypeError("Network connection lost.");
    };

    await expect(new GooglePlacesProvider(validTestApiKey, fetcher).search(input))
      .rejects.toMatchObject({
        code: "PROVIDER_UNREACHABLE",
        diagnosticCode: "NETWORK_CONNECTION_LOST",
      } satisfies Partial<BusinessSearchProviderError>);
  });
});

describe("Lead Finder persistence", () => {
  it("deduplicates repeated provider IDs and updates instead of inserting duplicates", async () => {
    const provider: BusinessSearchProvider = {
      name: "fake-provider",
      maximumRequestsPerSearch: 1,
      async search() {
        return {
          leads: [
            providerLead("place-1"),
            providerLead("place-2", { websiteUrl: "https://example.com/", hasWebsite: true }),
            providerLead("place-1", { name: "Duplicate raw result" }),
          ],
          providerRequestCount: 1,
          rawResultCount: 3,
        };
      },
    };

    const first = await runLeadSearch(env.LEADS_DB, provider, input, 100);
    const second = await runLeadSearch(
      env.LEADS_DB,
      provider,
      { ...input, refresh: true },
      100,
    );
    const stored = await env.LEADS_DB
      .prepare("SELECT COUNT(*) AS total FROM lead_finder_leads")
      .first<{ total: number }>();
    const searches = await env.LEADS_DB
      .prepare("SELECT COUNT(*) AS total FROM lead_finder_searches")
      .first<{ total: number }>();

    expect(first.search).toMatchObject({
      returnedCount: 2,
      rawResultCount: 3,
      createdCount: 2,
      updatedCount: 0,
      providerRequestCount: 1,
    });
    expect(second.search).toMatchObject({
      returnedCount: 2,
      createdCount: 0,
      updatedCount: 2,
      storedLeadCount: 2,
    });
    expect(stored?.total).toBe(2);
    expect(searches?.total).toBe(2);
    expect(second.leads.map((lead) => lead.id)).toEqual(first.leads.map((lead) => lead.id));
  });

  it("uses the archive before discovery and makes no repeated provider request by default", async () => {
    let calls = 0;
    const provider: BusinessSearchProvider = {
      name: "fake-provider",
      maximumRequestsPerSearch: 1,
      async search() {
        calls += 1;
        return {
          leads: [providerLead("place-archive")],
          providerRequestCount: 1,
          rawResultCount: 1,
        };
      },
    };

    await runLeadSearch(env.LEADS_DB, provider, input, 100);
    await expect(runLeadSearch(env.LEADS_DB, provider, input, 100)).rejects.toBeInstanceOf(
      LeadArchiveMatchError,
    );

    expect(calls).toBe(1);
    const usage = await env.LEADS_DB.prepare(
      "SELECT request_count FROM lead_finder_provider_usage WHERE provider = ?",
    ).bind(provider.name).first<{ request_count: number }>();
    expect(usage?.request_count).toBe(1);
  });

  it("enforces the monthly provider-request cap before a second outbound request", async () => {
    let calls = 0;
    const provider: BusinessSearchProvider = {
      name: "fake-provider",
      maximumRequestsPerSearch: 1,
      async search() {
        calls += 1;
        return {
          leads: [providerLead(`place-${calls}`)],
          providerRequestCount: 1,
          rawResultCount: 1,
        };
      },
    };

    await runLeadSearch(env.LEADS_DB, provider, input, 1);
    await expect(runLeadSearch(
      env.LEADS_DB,
      provider,
      { ...input, location: "Opatija, Croatia" },
      1,
    )).rejects.toMatchObject({
      code: "MONTHLY_PROVIDER_LIMIT_REACHED",
      httpStatus: 429,
    } satisfies Partial<BusinessSearchProviderError>);
    expect(calls).toBe(1);
  });

  it("stores Google-independent identifiers and workflow fields, not volatile provider content", async () => {
    const columns = await env.LEADS_DB
      .prepare("PRAGMA table_info(lead_finder_leads)")
      .all<{ name: string }>();
    const names = columns.results.map((column) => column.name);

    expect(names).toEqual(expect.arrayContaining([
      "id",
      "provider",
      "provider_place_id",
      "business_type_hint",
      "location_hint",
      "lead_status",
      "audit_status",
      "contact_status",
      "email_status",
      "priority",
      "priority_reason",
      "discovered_at",
      "last_checked_at",
      "website_quality_score",
      "opportunity_score",
    ]));
    expect(names).not.toEqual(expect.arrayContaining([
      "name",
      "address",
      "rating",
      "review_count",
      "website_url",
      "phone",
    ]));
  });

  it("persists a successful zero-result search without crashing", async () => {
    const provider: BusinessSearchProvider = {
      name: "fake-provider",
      maximumRequestsPerSearch: 1,
      async search() {
        return { leads: [], providerRequestCount: 1, rawResultCount: 0 };
      },
    };

    const result = await runLeadSearch(
      env.LEADS_DB,
      provider,
      { ...input, location: "Nigdje" },
      100,
    );
    expect(result.search.returnedCount).toBe(0);
    expect(result.leads).toEqual([]);
  });

  it("keeps low-priority archive records and their reason during an explicit refresh", async () => {
    const provider: BusinessSearchProvider = {
      name: "fake-provider",
      maximumRequestsPerSearch: 1,
      async search() {
        return {
          leads: [providerLead("place-low")],
          providerRequestCount: 1,
          rawResultCount: 1,
        };
      },
    };

    const first = await runLeadSearch(env.LEADS_DB, provider, input, 100);
    await env.LEADS_DB.prepare(
      "UPDATE lead_finder_leads SET priority = 'LOW', priority_reason = ? WHERE id = ?",
    ).bind("Premalo recenzija", first.leads[0].id).run();

    const refreshed = await runLeadSearch(
      env.LEADS_DB,
      provider,
      { ...input, refresh: true },
      100,
    );
    const archive = await getLeadArchive(env.LEADS_DB);

    expect(refreshed.leads[0]).toMatchObject({
      priority: "LOW",
      priorityReason: "Premalo recenzija",
      persistenceStatus: "updated",
    });
    expect(archive[0]).toMatchObject({
      providerPlaceId: "place-low",
      priority: "LOW",
      priorityReason: "Premalo recenzija",
    });
  });
});
