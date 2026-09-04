import { aggregateAuditSignals, analyzeFirecrawlPage, selectSecondaryPages } from "./audit-analysis";
import {
  assertLeadExists,
  completeWebsiteAudit,
  createWebsiteAuditRun,
  failWebsiteAuditRun,
  getLatestWebsiteAudit,
} from "./audit-repository";
import {
  AUDIT_MAX_FIRECRAWL_PAGES,
  AUDIT_MAX_PAGESPEED_RUNS,
  type AuditErrorDetail,
  type AuditPageKind,
  type FirecrawlPage,
  type PageSpeedMobileResult,
  type WebsiteAuditInput,
  type WebsiteAuditRunResponse,
  type WebsiteContentProvider,
  type WebsitePerformanceProvider,
  WebsiteAuditError,
} from "./audit-types";

function failedPage(url: string, pageKind: AuditPageKind, code: string): FirecrawlPage {
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
    errorCode: code,
  };
}

function unavailablePageSpeed(url: string, code: string): PageSpeedMobileResult {
  return {
    status: "UNAVAILABLE",
    requestedUrl: url,
    finalUrl: null,
    fetchedAt: null,
    lighthouseVersion: null,
    performanceScore: null,
    metrics: {},
    errorCode: code,
  };
}

function publicErrorCode(error: unknown, component: "firecrawl" | "pagespeed") {
  if (error instanceof WebsiteAuditError) return error.code;
  return component === "firecrawl" ? "FIRECRAWL_UNEXPECTED_ERROR" : "PAGESPEED_UNEXPECTED_ERROR";
}

export async function runWebsiteAudit(
  db: D1Database,
  contentProvider: WebsiteContentProvider,
  performanceProvider: WebsitePerformanceProvider,
  input: WebsiteAuditInput,
): Promise<WebsiteAuditRunResponse> {
  await assertLeadExists(db, input.leadId);

  const existing = await getLatestWebsiteAudit(db, input.leadId);
  if (existing && !input.refresh) {
    return {
      success: true,
      reused: true,
      externalRequests: { firecrawl: 0, pageSpeed: 0 },
      audit: existing,
    };
  }

  if (!input.websiteUrl) {
    throw new WebsiteAuditError(
      "NO_WEBSITE",
      "Lead nema website kandidat; Firecrawl i PageSpeed nisu pozvani.",
      422,
    );
  }
  if (contentProvider.maximumPagesPerAudit !== AUDIT_MAX_FIRECRAWL_PAGES) {
    throw new WebsiteAuditError(
      "FIRECRAWL_LIMIT_UNSAFE",
      "Content provider ne zadovoljava limit od pet stranica.",
      500,
    );
  }
  if (performanceProvider.maximumRunsPerAudit !== AUDIT_MAX_PAGESPEED_RUNS) {
    throw new WebsiteAuditError(
      "PAGESPEED_LIMIT_UNSAFE",
      "Performance provider ne zadovoljava limit jednog poziva.",
      500,
    );
  }

  const { auditId } = await createWebsiteAuditRun(db, input.leadId, input.websiteUrl, input.refresh);
  let firecrawlRequests = 0;
  let pageSpeedRequests = 0;

  const scrape = async (url: string, kind: AuditPageKind) => {
    if (firecrawlRequests >= AUDIT_MAX_FIRECRAWL_PAGES) {
      return failedPage(url, kind, "FIRECRAWL_PAGE_LIMIT_REACHED");
    }
    firecrawlRequests += 1;
    try {
      return await contentProvider.scrape(url, kind);
    } catch (error) {
      return failedPage(url, kind, publicErrorCode(error, "firecrawl"));
    }
  };

  const runPageSpeed = async () => {
    if (pageSpeedRequests >= AUDIT_MAX_PAGESPEED_RUNS) {
      return unavailablePageSpeed(input.websiteUrl!, "PAGESPEED_RUN_LIMIT_REACHED");
    }
    pageSpeedRequests += 1;
    try {
      return await performanceProvider.runMobilePerformance(input.websiteUrl!);
    } catch (error) {
      return unavailablePageSpeed(input.websiteUrl!, publicErrorCode(error, "pagespeed"));
    }
  };

  try {
    const [homepage, pageSpeedMobile] = await Promise.all([
      scrape(input.websiteUrl, "homepage"),
      runPageSpeed(),
    ]);
    const secondaryCandidates = selectSecondaryPages(homepage);
    const secondaryPages = await Promise.all(
      secondaryCandidates.map((candidate) => scrape(candidate.url, candidate.kind as Exclude<AuditPageKind, "homepage">)),
    );
    const pages = [homepage, ...secondaryPages].slice(0, AUDIT_MAX_FIRECRAWL_PAGES).map(analyzeFirecrawlPage);
    const signals = aggregateAuditSignals(pages);
    if (pageSpeedMobile.status === "SUCCESS") {
      signals.technicalSignals.availability = {
        status: "PASS",
        evidence: [{
          pageUrl: pageSpeedMobile.finalUrl ?? input.websiteUrl,
          detail: "PageSpeed je uspješno analizirao mobile homepage.",
          value: pageSpeedMobile.performanceScore,
        }],
      };
    }
    const successfulPages = pages.filter((page) => page.status === "SUCCESS").length;
    const allPagesSuccessful = pages.length > 0 && successfulPages === pages.length;
    const pageSpeedSuccessful = pageSpeedMobile.status === "SUCCESS";
    const status = successfulPages > 0 && allPagesSuccessful && pageSpeedSuccessful
      ? "COMPLETE" as const
      : successfulPages > 0 || pageSpeedSuccessful
        ? "PARTIAL" as const
        : "FAILED" as const;
    const errors: AuditErrorDetail[] = [
      ...pages
        .filter((page) => page.status === "FAILED")
        .map((page): AuditErrorDetail => ({
          component: "firecrawl",
          code: page.errorCode ?? "FIRECRAWL_PAGE_FAILED",
          pageUrl: page.requestedUrl,
        })),
      ...(pageSpeedMobile.status === "UNAVAILABLE" ? [{
        component: "pagespeed" as const,
        code: pageSpeedMobile.errorCode ?? "PAGESPEED_UNAVAILABLE",
        pageUrl: input.websiteUrl,
      }] : []),
    ];

    const detail = await completeWebsiteAudit(db, {
      auditId,
      leadId: input.leadId,
      websiteUrl: homepage.status === "SUCCESS" ? homepage.requestedUrl : input.websiteUrl,
      finalUrl: homepage.finalUrl ?? pageSpeedMobile.finalUrl,
      urlSource: homepage.status === "SUCCESS" ? "firecrawl" : "operator_selected",
      status,
      pages,
      firecrawlAttemptCount: firecrawlRequests,
      pageSpeedAttemptCount: pageSpeedRequests,
      ...signals,
      pageSpeedMobile,
      errorDetails: errors,
    });

    return {
      success: true,
      reused: false,
      externalRequests: { firecrawl: firecrawlRequests, pageSpeed: pageSpeedRequests },
      audit: detail,
    };
  } catch {
    await failWebsiteAuditRun(db, auditId, input.leadId, "AUDIT_INTERNAL_ERROR").catch(() => undefined);
    throw new WebsiteAuditError(
      "AUDIT_FAILED",
      "Website audit nije moguće dovršiti.",
      500,
    );
  }
}
