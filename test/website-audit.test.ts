import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { analyzeFirecrawlPage, selectSecondaryPages } from "../worker/lead-finder/audit-analysis";
import {
  ensureWebsiteAuditSchema,
  getLatestWebsiteAudit,
  getWebsiteAuditSummaries,
} from "../worker/lead-finder/audit-repository";
import { runWebsiteAudit } from "../worker/lead-finder/audit-service";
import {
  AUDIT_MAX_FIRECRAWL_PAGES,
  type AuditPageKind,
  type FirecrawlPage,
  type PageSpeedMobileResult,
  type WebsiteContentProvider,
  type WebsitePerformanceProvider,
  WebsiteAuditError,
} from "../worker/lead-finder/audit-types";
import { FirecrawlProvider, firecrawlScrapeEndpoint } from "../worker/lead-finder/firecrawl-provider";
import { PageSpeedProvider, pageSpeedRunEndpoint } from "../worker/lead-finder/pagespeed-provider";

const leadId = "a".repeat(32);
const websiteUrl = "https://restaurant.example/";

function firecrawlPage(
  requestedUrl: string,
  pageKind: AuditPageKind,
  overrides: Partial<FirecrawlPage> = {},
): FirecrawlPage {
  return {
    requestedUrl,
    finalUrl: requestedUrl,
    pageKind,
    status: "SUCCESS",
    httpStatus: 200,
    title: "Restaurant Example",
    metaDescription: "Restaurant in Rijeka",
    language: "hr",
    contentType: "text/html",
    html: '<html><head><meta name="viewport" content="width=device-width"><title>Restaurant Example</title></head><body><h1>Restaurant Example</h1></body></html>',
    markdown: "# Restaurant Example\n\nWelcome.",
    links: [],
    errorCode: null,
    ...overrides,
  };
}

function pageSpeed(overrides: Partial<PageSpeedMobileResult> = {}): PageSpeedMobileResult {
  return {
    status: "SUCCESS",
    requestedUrl: websiteUrl,
    finalUrl: websiteUrl,
    fetchedAt: "2026-09-04T10:00:00.000Z",
    lighthouseVersion: "13.0.0",
    performanceScore: 83,
    metrics: {
      "largest-contentful-paint": {
        displayValue: "2.1 s",
        numericValue: 2100,
        numericUnit: "millisecond",
        score: 0.82,
      },
    },
    errorCode: null,
    ...overrides,
  };
}

class FakeContentProvider implements WebsiteContentProvider {
  readonly name = "firecrawl" as const;
  readonly maximumPagesPerAudit = AUDIT_MAX_FIRECRAWL_PAGES;
  calls: Array<{ url: string; kind: AuditPageKind }> = [];

  constructor(private readonly responder: (url: string, kind: AuditPageKind) => FirecrawlPage) {}

  async scrape(url: string, kind: AuditPageKind) {
    this.calls.push({ url, kind });
    return this.responder(url, kind);
  }
}

class FakePerformanceProvider implements WebsitePerformanceProvider {
  readonly name = "pagespeed-insights" as const;
  readonly maximumRunsPerAudit = 1 as const;
  calls: string[] = [];

  constructor(private readonly result: PageSpeedMobileResult = pageSpeed()) {}

  async runMobilePerformance(url: string) {
    this.calls.push(url);
    return this.result;
  }
}

async function insertLead() {
  const now = "2026-09-04T09:00:00.000Z";
  await env.LEADS_DB.prepare(
    `INSERT INTO lead_finder_leads (
      id, provider, provider_place_id, location_hint, business_type_hint,
      audit_status, contact_status, lead_status, priority,
      discovered_at, last_checked_at, created_at, updated_at, last_seen_at
    ) VALUES (?, 'google-places', 'place-audit-test', 'Rijeka, Croatia', 'restaurant',
      'NOT_STARTED', 'NOT_STARTED', 'NEW', 'UNCLASSIFIED', ?, ?, ?, ?, ?)`,
  ).bind(leadId, now, now, now, now, now).run();
}

beforeEach(async () => {
  await ensureWebsiteAuditSchema(env.LEADS_DB);
  await env.LEADS_DB.batch([
    env.LEADS_DB.prepare("DELETE FROM lead_finder_audit_pages"),
    env.LEADS_DB.prepare("DELETE FROM lead_finder_website_audits"),
    env.LEADS_DB.prepare("DELETE FROM lead_finder_search_leads"),
    env.LEADS_DB.prepare("DELETE FROM lead_finder_searches"),
    env.LEADS_DB.prepare("DELETE FROM lead_finder_leads"),
    env.LEADS_DB.prepare("DELETE FROM lead_finder_provider_usage"),
  ]);
  await insertLead();
});

describe("Firecrawl and PageSpeed provider contracts", () => {
  it("uses a bounded Firecrawl scrape request without AI extraction or automatic proxy retries", async () => {
    let captured: Request | null = null;
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      captured = new Request(input, init);
      return Response.json({
        success: true,
        data: {
          markdown: "# Example",
          html: "<h1>Example</h1>",
          links: ["https://restaurant.example/contact"],
          metadata: { url: websiteUrl, statusCode: 200, title: "Example" },
        },
      });
    };

    const provider = new FirecrawlProvider("fc-test-secret-12345678901234567890", fetcher);
    const result = await provider.scrape(websiteUrl, "homepage");
    const request = captured as Request | null;

    expect(request).not.toBeNull();
    expect(request?.url).toBe(firecrawlScrapeEndpoint);
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("Authorization")).toBe("Bearer fc-test-secret-12345678901234567890");
    const body = await request?.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      url: websiteUrl,
      formats: ["markdown", "html", "links"],
      onlyMainContent: false,
      onlyCleanContent: false,
      mobile: true,
      skipTlsVerification: false,
      maxAge: 0,
      proxy: "basic",
      parsers: [],
    });
    expect(body).not.toHaveProperty("extract");
    expect(body).not.toHaveProperty("jsonOptions");
    expect(body).not.toHaveProperty("actions");
    expect(result.status).toBe("SUCCESS");
  });

  it("runs only mobile performance PageSpeed without any API key", async () => {
    let captured: Request | null = null;
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      captured = new Request(input, init);
      return Response.json({
        lighthouseResult: {
          requestedUrl: websiteUrl,
          finalUrl: websiteUrl,
          fetchTime: "2026-09-04T10:00:00.000Z",
          lighthouseVersion: "13.0.0",
          categories: { performance: { score: 0.83 } },
          audits: {
            "largest-contentful-paint": {
              displayValue: "2.1 s",
              numericValue: 2100,
              numericUnit: "millisecond",
              score: 0.82,
            },
          },
        },
      });
    };

    const result = await new PageSpeedProvider(fetcher).runMobilePerformance(websiteUrl);
    const request = captured as Request | null;
    const url = new URL(request?.url ?? "https://invalid.example/");
    expect(`${url.origin}${url.pathname}`).toBe(pageSpeedRunEndpoint);
    expect(url.searchParams.get("url")).toBe(websiteUrl);
    expect(url.searchParams.get("strategy")).toBe("MOBILE");
    expect(url.searchParams.getAll("category")).toEqual(["PERFORMANCE"]);
    expect(url.searchParams.has("key")).toBe(false);
    expect(result).toMatchObject({ status: "SUCCESS", performanceScore: 83 });
  });
});

describe("Evidence-first analysis", () => {
  it("selects only real relevant internal links and never exceeds four secondary pages", () => {
    const homepage = firecrawlPage(websiteUrl, "homepage", {
      links: [
        { url: "https://restaurant.example/kontakt", text: "Kontakt", kind: "other" },
        { url: "https://restaurant.example/menu", text: "Meni", kind: "other" },
        { url: "https://restaurant.example/o-nama", text: "O nama", kind: "other" },
        { url: "https://restaurant.example/rezervacija", text: "Rezerviraj", kind: "other" },
        { url: "https://restaurant.example/dostava", text: "Dostava", kind: "other" },
        { url: "https://external.example/contact", text: "External", kind: "other" },
        { url: "https://restaurant.example/gallery", text: "Galerija", kind: "other" },
      ],
    });

    const selected = selectSecondaryPages(homepage);
    expect(selected).toHaveLength(4);
    expect(selected.map((link) => link.kind)).toEqual(["contact", "services", "about", "commercial"]);
    expect(selected.every((link) => link.url.startsWith("https://restaurant.example/"))).toBe(true);
    expect(selected.some((link) => link.url.endsWith("/gallery"))).toBe(false);
  });

  it("keeps unconfirmed conversion checks UNKNOWN instead of turning them into FAIL", () => {
    const analyzed = analyzeFirecrawlPage(firecrawlPage(websiteUrl, "homepage", {
      html: '<html><head><title>Example</title></head><body><h1>Example</h1></body></html>',
      links: [],
    }));

    expect(analyzed.technicalSignals.mobileViewport.status).toBe("FAIL");
    expect(analyzed.conversionSignals.booking.status).toBe("UNKNOWN");
    expect(analyzed.conversionSignals.contactForm.status).toBe("UNKNOWN");
    expect(analyzed.conversionSignals.email.status).toBe("UNKNOWN");
  });
});

describe("Website audit resource protection and D1 persistence", () => {
  it("persists the first audit and reopening it makes zero external requests", async () => {
    const content = new FakeContentProvider((url, kind) => firecrawlPage(url, kind));
    const performance = new FakePerformanceProvider();
    const first = await runWebsiteAudit(env.LEADS_DB, content, performance, {
      leadId, websiteUrl, refresh: false,
    });

    expect(first.reused).toBe(false);
    expect(first.externalRequests).toEqual({ firecrawl: 1, pageSpeed: 1 });
    expect(first.audit.auditStatus).toBe("COMPLETE");
    expect(first.audit.pages).toHaveLength(1);
    expect(content.calls).toHaveLength(1);
    expect(performance.calls).toHaveLength(1);

    const reopenedContent = new FakeContentProvider((url, kind) => firecrawlPage(url, kind));
    const reopenedPerformance = new FakePerformanceProvider();
    const reopened = await runWebsiteAudit(env.LEADS_DB, reopenedContent, reopenedPerformance, {
      leadId, websiteUrl, refresh: false,
    });
    expect(reopened.reused).toBe(true);
    expect(reopened.externalRequests).toEqual({ firecrawl: 0, pageSpeed: 0 });
    expect(reopenedContent.calls).toHaveLength(0);
    expect(reopenedPerformance.calls).toHaveLength(0);

    const stored = await getLatestWebsiteAudit(env.LEADS_DB, leadId);
    const summaries = await getWebsiteAuditSummaries(env.LEADS_DB);
    expect(stored?.auditStatus).toBe("COMPLETE");
    expect(stored?.pages[0].markdown).toContain("Restaurant Example");
    expect(summaries).toHaveLength(1);
  });

  it("only explicit refresh creates another audit and new provider calls", async () => {
    const content = new FakeContentProvider((url, kind) => firecrawlPage(url, kind));
    const performance = new FakePerformanceProvider();
    await runWebsiteAudit(env.LEADS_DB, content, performance, { leadId, websiteUrl, refresh: false });
    const refreshed = await runWebsiteAudit(env.LEADS_DB, content, performance, { leadId, websiteUrl, refresh: true });
    const count = await env.LEADS_DB.prepare(
      "SELECT COUNT(*) AS total FROM lead_finder_website_audits WHERE lead_id = ?",
    ).bind(leadId).first<{ total: number }>();

    expect(refreshed.reused).toBe(false);
    expect(refreshed.externalRequests).toEqual({ firecrawl: 1, pageSpeed: 1 });
    expect(content.calls).toHaveLength(2);
    expect(performance.calls).toHaveLength(2);
    expect(count?.total).toBe(2);
  });

  it("makes no Firecrawl or PageSpeed call for a lead without a website", async () => {
    const content = new FakeContentProvider((url, kind) => firecrawlPage(url, kind));
    const performance = new FakePerformanceProvider();
    await expect(runWebsiteAudit(env.LEADS_DB, content, performance, {
      leadId, websiteUrl: null, refresh: false,
    })).rejects.toMatchObject({ code: "NO_WEBSITE", httpStatus: 422 } satisfies Partial<WebsiteAuditError>);
    expect(content.calls).toHaveLength(0);
    expect(performance.calls).toHaveLength(0);
    const count = await env.LEADS_DB.prepare(
      "SELECT COUNT(*) AS total FROM lead_finder_website_audits",
    ).first<{ total: number }>();
    expect(count?.total).toBe(0);
  });

  it("never exceeds five Firecrawl pages and uses only homepage-discovered URLs", async () => {
    const homepageLinks = [
      "/kontakt", "/menu", "/o-nama", "/rezervacija", "/dostava", "/pricing",
    ].map((path) => ({ url: new URL(path, websiteUrl).toString(), text: path, kind: "other" as const }));
    const content = new FakeContentProvider((url, kind) => firecrawlPage(url, kind, {
      links: kind === "homepage" ? homepageLinks : [],
    }));
    const performance = new FakePerformanceProvider();

    const result = await runWebsiteAudit(env.LEADS_DB, content, performance, {
      leadId, websiteUrl, refresh: false,
    });
    expect(result.externalRequests.firecrawl).toBe(5);
    expect(content.calls).toHaveLength(5);
    expect(content.calls[0]).toEqual({ url: websiteUrl, kind: "homepage" });
    expect(content.calls.slice(1).every((call) => homepageLinks.some((link) => link.url === call.url))).toBe(true);
    expect(result.audit.pagesChecked).toBe(5);
  });

  it("keeps successful evidence when a page and PageSpeed fail", async () => {
    const contactUrl = "https://restaurant.example/kontakt";
    const content = new FakeContentProvider((url, kind) => kind === "homepage"
      ? firecrawlPage(url, kind, { links: [{ url: contactUrl, text: "Kontakt", kind: "other" }] })
      : firecrawlPage(url, kind, {
          status: "FAILED",
          httpStatus: 500,
          html: null,
          markdown: null,
          errorCode: "FIRECRAWL_UNAVAILABLE",
        }));
    const performance = new FakePerformanceProvider(pageSpeed({
      status: "UNAVAILABLE",
      performanceScore: null,
      metrics: {},
      errorCode: "PAGESPEED_RATE_LIMITED",
    }));

    const result = await runWebsiteAudit(env.LEADS_DB, content, performance, {
      leadId, websiteUrl, refresh: false,
    });
    expect(result.audit.auditStatus).toBe("PARTIAL");
    expect(result.audit.firecrawlPagesUsed).toBe(1);
    expect(result.audit.pages).toHaveLength(2);
    expect(result.audit.pages[0].markdown).toContain("Restaurant Example");
    expect(result.audit.errorDetails.map((detail) => detail.code)).toEqual([
      "FIRECRAWL_UNAVAILABLE",
      "PAGESPEED_RATE_LIMITED",
    ]);

    const stored = await getLatestWebsiteAudit(env.LEADS_DB, leadId);
    expect(stored?.auditStatus).toBe("PARTIAL");
    expect(stored?.pages).toHaveLength(2);
    expect(stored?.pages[0].markdown).toContain("Restaurant Example");
  });
});
