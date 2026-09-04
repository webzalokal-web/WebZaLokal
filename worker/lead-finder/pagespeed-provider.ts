import {
  AUDIT_MAX_PAGESPEED_RUNS,
  type PageSpeedMetric,
  type PageSpeedMobileResult,
  type WebsitePerformanceProvider,
} from "./audit-types";

const pageSpeedEndpoint = "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";
const maximumResponseBytes = 8_000_000;
const metricIds = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "speed-index",
  "total-blocking-time",
  "cumulative-layout-shift",
  "interactive",
] as const;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function string(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readBoundedText(response: Response) {
  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (declaredLength > maximumResponseBytes) return null;
  if (!response.body) return "";
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
        return null;
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
  return new TextDecoder().decode(bytes);
}

function unavailable(url: string, errorCode: string): PageSpeedMobileResult {
  return {
    status: "UNAVAILABLE",
    requestedUrl: url,
    finalUrl: null,
    fetchedAt: null,
    lighthouseVersion: null,
    performanceScore: null,
    metrics: {},
    errorCode,
  };
}

function errorCodeForStatus(status: number) {
  if (status === 429) return "PAGESPEED_RATE_LIMITED";
  if (status === 408 || status === 504) return "PAGESPEED_TIMEOUT";
  if (status >= 500) return "PAGESPEED_UNAVAILABLE";
  return "PAGESPEED_REQUEST_REJECTED";
}

export class PageSpeedProvider implements WebsitePerformanceProvider {
  readonly name = "pagespeed-insights" as const;
  readonly maximumRunsPerAudit = AUDIT_MAX_PAGESPEED_RUNS;
  private readonly fetcher: FetchLike;

  constructor(fetcher: FetchLike = fetch) {
    this.fetcher = (input, init) => fetcher(input, init);
  }

  async runMobilePerformance(url: string): Promise<PageSpeedMobileResult> {
    const endpoint = new URL(pageSpeedEndpoint);
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("strategy", "MOBILE");
    endpoint.searchParams.set("category", "PERFORMANCE");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("pagespeed_timeout"), 45_000);
    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      const detail = `${error instanceof Error ? error.name : ""} ${error instanceof Error ? error.message : ""}`.toLowerCase();
      return unavailable(url, detail.includes("abort") || detail.includes("timeout")
        ? "PAGESPEED_TIMEOUT"
        : "PAGESPEED_FETCH_FAILED");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return unavailable(url, errorCodeForStatus(response.status));
    const text = await readBoundedText(response);
    if (text === null) return unavailable(url, "PAGESPEED_RESPONSE_TOO_LARGE");

    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      return unavailable(url, "PAGESPEED_INVALID_RESPONSE");
    }

    const root = object(payload);
    const lighthouse = object(root?.lighthouseResult);
    const categories = object(lighthouse?.categories);
    const performance = object(categories?.performance);
    const audits = object(lighthouse?.audits);
    if (!lighthouse || !performance || !audits) return unavailable(url, "PAGESPEED_INVALID_RESPONSE");

    const rawScore = finiteNumber(performance.score);
    const metrics: Record<string, PageSpeedMetric> = {};
    for (const metricId of metricIds) {
      const audit = object(audits[metricId]);
      if (!audit) continue;
      metrics[metricId] = {
        displayValue: string(audit.displayValue, 120) || null,
        numericValue: finiteNumber(audit.numericValue),
        numericUnit: string(audit.numericUnit, 40) || null,
        score: finiteNumber(audit.score),
      };
    }

    return {
      status: "SUCCESS",
      requestedUrl: url,
      finalUrl: string(lighthouse.finalUrl, 2_000) || null,
      fetchedAt: string(lighthouse.fetchTime, 80) || null,
      lighthouseVersion: string(lighthouse.lighthouseVersion, 40) || null,
      performanceScore: rawScore === null ? null : Math.round(rawScore * 100),
      metrics,
      errorCode: null,
    };
  }
}

export const pageSpeedRunEndpoint = pageSpeedEndpoint;
