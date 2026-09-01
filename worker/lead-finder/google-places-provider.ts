import {
  BusinessSearchProviderError,
  GOOGLE_PLACES_PROVIDER,
  type BusinessSearchProvider,
  type BusinessSearchProviderResult,
  type LeadSearchInput,
  type ProviderAttribution,
  type ProviderLead,
} from "./types";

const googlePlacesEndpoint = "https://places.googleapis.com/v1/places:searchText";
const maximumResponseBytes = 512_000;
const googleFieldMask = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.attributions",
].join(",");

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function string(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function localizedText(value: unknown) {
  return string(object(value)?.text, 200);
}

function httpUrl(value: unknown) {
  const candidate = string(value, 1_000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeAttributions(value: unknown): ProviderAttribution[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const attributions: ProviderAttribution[] = [];

  for (const candidate of value) {
    const attribution = object(candidate);
    const provider = string(attribution?.provider, 120);
    if (!provider || seen.has(provider)) continue;
    seen.add(provider);
    attributions.push({
      provider,
      providerUri: httpUrl(attribution?.providerUri),
    });
  }

  return attributions;
}

function normalizePlace(value: unknown, fallbackBusinessType: string): ProviderLead | null {
  const place = object(value);
  if (!place) return null;

  const providerPlaceId = string(place.id, 500);
  const name = localizedText(place.displayName);
  if (!providerPlaceId || !name) return null;

  const websiteUrl = httpUrl(place.websiteUri);
  return {
    provider: GOOGLE_PLACES_PROVIDER,
    providerPlaceId,
    name,
    businessType: fallbackBusinessType,
    address: string(place.formattedAddress, 500) || null,
    city: null,
    country: null,
    latitude: null,
    longitude: null,
    rating: typeof place.rating === "number" && Number.isFinite(place.rating) && place.rating >= 0 && place.rating <= 5
      ? place.rating
      : null,
    reviewCount: nonNegativeInteger(place.userRatingCount),
    websiteUrl,
    phone: string(place.nationalPhoneNumber, 100) || null,
    hasWebsite: websiteUrl !== null,
    sourceUrl: null,
    attributions: normalizeAttributions(place.attributions),
  };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (declaredLength > maximumResponseBytes) {
    throw new BusinessSearchProviderError(
      "PROVIDER_RESPONSE_TOO_LARGE",
      "Provider je vratio neočekivano velik odgovor.",
      502,
    );
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumResponseBytes) {
        await reader.cancel("response_too_large");
        throw new BusinessSearchProviderError(
          "PROVIDER_RESPONSE_TOO_LARGE",
          "Provider je vratio neočekivano velik odgovor.",
          502,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new BusinessSearchProviderError(
      "PROVIDER_INVALID_RESPONSE",
      "Provider je vratio neispravan odgovor.",
      502,
    );
  }
}

function providerErrorForStatus(status: number) {
  if (status === 429) {
    return new BusinessSearchProviderError(
      "PROVIDER_RATE_LIMITED",
      "Google Places je privremeno ograničio broj zahtjeva. Pokušajte ponovno za minutu.",
      429,
      60,
    );
  }
  if (status === 401 || status === 403) {
    return new BusinessSearchProviderError(
      "PROVIDER_CONFIGURATION_ERROR",
      "Google Places pristup nije ispravno konfiguriran.",
      503,
    );
  }
  if (status === 400) {
    return new BusinessSearchProviderError(
      "PROVIDER_REJECTED_QUERY",
      "Google Places nije prihvatio ovu kombinaciju pretrage.",
      422,
    );
  }
  return new BusinessSearchProviderError(
    "PROVIDER_UNAVAILABLE",
    "Google Places trenutačno nije dostupan.",
    502,
  );
}

function fetchExceptionDiagnostic(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "";
  const normalized = `${name} ${message}`.toLowerCase();

  if (normalized.includes("header") || normalized.includes("bytestring")) {
    return "INVALID_SECRET_HEADER";
  }
  if (normalized.includes("abort") || normalized.includes("timeout")) {
    return "UPSTREAM_TIMEOUT";
  }
  if (normalized.includes("dns") || normalized.includes("resolve")) {
    return "UPSTREAM_DNS_FAILURE";
  }
  if (normalized.includes("network connection lost")) {
    return "NETWORK_CONNECTION_LOST";
  }
  if (normalized.includes("connection refused") || normalized.includes("connection reset")) {
    return "UPSTREAM_CONNECTION_FAILED";
  }
  return "FETCH_EXCEPTION";
}

function validGoogleApiKey(value: string) {
  return /^[A-Za-z0-9_-]{20,200}$/.test(value);
}

export class GooglePlacesProvider implements BusinessSearchProvider {
  readonly name = GOOGLE_PLACES_PROVIDER;
  readonly maximumRequestsPerSearch = 1 as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async search(input: LeadSearchInput): Promise<BusinessSearchProviderResult> {
    const apiKey = this.apiKey.trim();
    if (!validGoogleApiKey(apiKey)) {
      throw new BusinessSearchProviderError(
        "PROVIDER_CONFIGURATION_ERROR",
        "Google Places API key nije spremljen u valjanom formatu.",
        503,
        undefined,
        "INVALID_API_KEY_FORMAT",
      );
    }

    let response: Response;
    try {
      response = await this.fetcher(googlePlacesEndpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": googleFieldMask,
        },
        body: JSON.stringify({
          textQuery: `${input.businessType} in ${input.location}`,
          pageSize: input.limit,
        }),
      });
    } catch (error) {
      if (error instanceof BusinessSearchProviderError) throw error;
      const diagnosticCode = fetchExceptionDiagnostic(error);
      console.error(JSON.stringify({
        event: "google_places_fetch_exception",
        diagnosticCode,
        errorName: error instanceof Error ? error.name : "UnknownError",
      }));
      throw new BusinessSearchProviderError(
        "PROVIDER_UNREACHABLE",
        `Google Places nije moguće kontaktirati (${diagnosticCode}).`,
        502,
        undefined,
        diagnosticCode,
      );
    }

    if (!response.ok) throw providerErrorForStatus(response.status);

    const payload = object(await readBoundedJson(response));
    if (!payload) {
      throw new BusinessSearchProviderError(
        "PROVIDER_INVALID_RESPONSE",
        "Provider je vratio neispravan odgovor.",
        502,
      );
    }

    const rawPlaces = Array.isArray(payload.places) ? payload.places : [];
    const leads = rawPlaces
      .map((place) => normalizePlace(place, input.businessType))
      .filter((lead): lead is ProviderLead => lead !== null);

    return {
      leads,
      providerRequestCount: 1,
      rawResultCount: rawPlaces.length,
    };
  }
}

export const googlePlacesRequestFieldMask = googleFieldMask;
