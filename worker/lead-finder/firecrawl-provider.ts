import {
  AUDIT_MAX_FIRECRAWL_PAGES,
  type AuditLink,
  type AuditPageKind,
  type FirecrawlPage,
  type WebsiteContentProvider,
  WebsiteAuditError,
} from "./audit-types";
import { normalizePublicWebsiteUrl } from "./audit-validation";

const firecrawlEndpoint = "https://api.firecrawl.dev/v2/scrape";
const maximumResponseBytes = 1_500_000;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function boundedString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (declaredLength > maximumResponseBytes) {
    throw new WebsiteAuditError("FIRECRAWL_RESPONSE_TOO_LARGE", "Firecrawl odgovor je prevelik.", 502);
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumResponseBytes) {
        await reader.cancel("response_too_large");
        throw new WebsiteAuditError("FIRECRAWL_RESPONSE_TOO_LARGE", "Firecrawl odgovor je prevelik.", 502);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new WebsiteAuditError("FIRECRAWL_INVALID_RESPONSE", "Firecrawl je vratio neispravan odgovor.", 502);
  }
}

function normalizeLinks(value: unknown): AuditLink[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: AuditLink[] = [];
  for (const candidate of value.slice(0, 500)) {
    const rawUrl = typeof candidate === "string"
      ? candidate
      : boundedString(object(candidate)?.url ?? object(candidate)?.href, 2_000);
    const url = normalizePublicWebsiteUrl(rawUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({
      url,
      text: typeof candidate === "string"
        ? null
        : boundedString(object(candidate)?.text, 200) || null,
      kind: "other",
    });
  }
  return result;
}

function errorCodeForStatus(status: number) {
  if (status === 401 || status === 403) return "FIRECRAWL_AUTH_REJECTED";
  if (status === 402) return "FIRECRAWL_CREDITS_EXHAUSTED";
  if (status === 408 || status === 504) return "FIRECRAWL_TIMEOUT";
  if (status === 429) return "FIRECRAWL_RATE_LIMITED";
  if (status >= 500) return "FIRECRAWL_UNAVAILABLE";
  return "FIRECRAWL_REQUEST_REJECTED";
}

function safeFetchErrorCode(error: unknown) {
  const detail = `${error instanceof Error ? error.name : ""} ${error instanceof Error ? error.message : ""}`.toLowerCase();
  return detail.includes("abort") || detail.includes("timeout")
    ? "FIRECRAWL_TIMEOUT"
    : "FIRECRAWL_FETCH_FAILED";
}

function validApiKey(value: string) {
  return /^[A-Za-z0-9_-]{20,500}$/.test(value);
}

export class FirecrawlProvider implements WebsiteContentProvider {
  readonly name = "firecrawl" as const;
  readonly maximumPagesPerAudit = AUDIT_MAX_FIRECRAWL_PAGES;
  private readonly fetcher: FetchLike;

  constructor(
    private readonly apiKey: string,
    fetcher: FetchLike = fetch,
  ) {
    this.fetcher = (input, init) => fetcher(input, init);
  }

  async scrape(url: string, pageKind: AuditPageKind): Promise<FirecrawlPage> {
    const apiKey = this.apiKey.trim();
    if (!validApiKey(apiKey)) {
      throw new WebsiteAuditError(
        "FIRECRAWL_NOT_CONFIGURED",
        "Firecrawl pristup nije ispravno konfiguriran.",
        503,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("firecrawl_timeout"), 35_000);
    let response: Response;
    try {
      response = await this.fetcher(firecrawlEndpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown", "html", "links"],
          onlyMainContent: false,
          onlyCleanContent: false,
          mobile: true,
          skipTlsVerification: false,
          timeout: 30_000,
          waitFor: 0,
          maxAge: 0,
          proxy: "basic",
          parsers: [],
          removeBase64Images: true,
          blockAds: true,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      return {
        requestedUrl: url,
        finalUrl: null,
        pageKind,
        status: "FAILED",
        httpStatus: null,
        title: null,
        metaDescription: null,
        language: null,
        contentType: null,
        html: null,
        markdown: null,
        links: [],
        errorCode: safeFetchErrorCode(error),
      };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return {
        requestedUrl: url,
        finalUrl: null,
        pageKind,
        status: "FAILED",
        httpStatus: response.status,
        title: null,
        metaDescription: null,
        language: null,
        contentType: null,
        html: null,
        markdown: null,
        links: [],
        errorCode: errorCodeForStatus(response.status),
      };
    }

    let payload: unknown;
    try {
      payload = await readBoundedJson(response);
    } catch (error) {
      return {
        requestedUrl: url,
        finalUrl: null,
        pageKind,
        status: "FAILED",
        httpStatus: response.status,
        title: null,
        metaDescription: null,
        language: null,
        contentType: null,
        html: null,
        markdown: null,
        links: [],
        errorCode: error instanceof WebsiteAuditError ? error.code : "FIRECRAWL_INVALID_RESPONSE",
      };
    }

    const root = object(payload);
    const data = object(root?.data);
    const metadata = object(data?.metadata);
    if (root?.success !== true || !data) {
      return {
        requestedUrl: url,
        finalUrl: null,
        pageKind,
        status: "FAILED",
        httpStatus: response.status,
        title: null,
        metaDescription: null,
        language: null,
        contentType: null,
        html: null,
        markdown: null,
        links: [],
        errorCode: "FIRECRAWL_INVALID_RESPONSE",
      };
    }

    const finalUrl = normalizePublicWebsiteUrl(metadata?.url ?? metadata?.sourceURL ?? url);
    const pageHttpStatus = boundedInteger(metadata?.statusCode, 100, 599) ?? response.status;
    const pageFailed = pageHttpStatus >= 400;
    return {
      requestedUrl: url,
      finalUrl,
      pageKind,
      status: pageFailed ? "FAILED" : "SUCCESS",
      httpStatus: pageHttpStatus,
      title: boundedString(metadata?.title, 500) || null,
      metaDescription: boundedString(metadata?.description, 1_000) || null,
      language: boundedString(metadata?.language, 40) || null,
      contentType: boundedString(metadata?.contentType, 120) || null,
      html: boundedString(data.html, 600_000) || null,
      markdown: boundedString(data.markdown, 200_000) || null,
      links: normalizeLinks(data.links),
      errorCode: pageFailed ? `PAGE_HTTP_${pageHttpStatus}` : null,
    };
  }
}

export const firecrawlScrapeEndpoint = firecrawlEndpoint;
