export const AUDIT_MAX_FIRECRAWL_PAGES = 5;
export const AUDIT_MAX_SECONDARY_PAGES = AUDIT_MAX_FIRECRAWL_PAGES - 1;
export const AUDIT_MAX_PAGESPEED_RUNS = 1;

export type AuditStatus = "PENDING" | "RUNNING" | "COMPLETE" | "PARTIAL" | "FAILED";
export type AuditCheckStatus = "PASS" | "FAIL" | "UNKNOWN";
export type AuditPageStatus = "SUCCESS" | "FAILED";
export type AuditPageKind =
  | "homepage"
  | "contact"
  | "services"
  | "about"
  | "commercial";

export type AuditEvidence = {
  pageUrl: string | null;
  detail: string;
  value?: string | number | boolean | null;
};

export type AuditSignal = {
  status: AuditCheckStatus;
  evidence: AuditEvidence[];
};

export type AuditSignalCollection = Record<string, AuditSignal>;

export type AuditHeading = {
  level: 1 | 2 | 3;
  text: string;
};

export type AuditLink = {
  url: string;
  text: string | null;
  kind: AuditPageKind | "other";
};

export type FirecrawlPage = {
  requestedUrl: string;
  finalUrl: string | null;
  pageKind: AuditPageKind;
  status: AuditPageStatus;
  httpStatus: number | null;
  title: string | null;
  metaDescription: string | null;
  language: string | null;
  contentType: string | null;
  html: string | null;
  markdown: string | null;
  links: AuditLink[];
  errorCode: string | null;
};

export interface WebsiteContentProvider {
  readonly name: "firecrawl";
  readonly maximumPagesPerAudit: 5;
  scrape(url: string, pageKind: AuditPageKind): Promise<FirecrawlPage>;
}

export type PageSpeedMetric = {
  displayValue: string | null;
  numericValue: number | null;
  numericUnit: string | null;
  score: number | null;
};

export type PageSpeedMobileResult = {
  status: "SUCCESS" | "UNAVAILABLE";
  requestedUrl: string;
  finalUrl: string | null;
  fetchedAt: string | null;
  lighthouseVersion: string | null;
  performanceScore: number | null;
  metrics: Record<string, PageSpeedMetric>;
  errorCode: string | null;
};

export interface WebsitePerformanceProvider {
  readonly name: "pagespeed-insights";
  readonly maximumRunsPerAudit: 1;
  runMobilePerformance(url: string): Promise<PageSpeedMobileResult>;
}

export type AnalyzedAuditPage = Omit<FirecrawlPage, "html" | "links"> & {
  headings: AuditHeading[];
  relevantLinks: AuditLink[];
  markdown: string | null;
  cleanedText: string | null;
  technicalSignals: AuditSignalCollection;
  conversionSignals: AuditSignalCollection;
  seoSignals: AuditSignalCollection;
};

export type WebsiteAuditInput = {
  leadId: string;
  websiteUrl: string | null;
  refresh: boolean;
};

export type AuditErrorDetail = {
  component: "firecrawl" | "pagespeed" | "audit";
  code: string;
  pageUrl: string | null;
};

export type WebsiteAuditRecord = {
  id: string;
  leadId: string;
  websiteUrl: string;
  finalUrl: string | null;
  auditStatus: AuditStatus;
  refreshRequested: boolean;
  startedAt: string;
  auditedAt: string | null;
  firecrawlAttemptCount: number;
  firecrawlPagesUsed: number;
  pagesChecked: number;
  pageSpeedAttemptCount: number;
  technicalSignals: AuditSignalCollection;
  conversionSignals: AuditSignalCollection;
  seoSignals: AuditSignalCollection;
  contentSignals: Record<string, unknown>;
  pageSpeedMobile: PageSpeedMobileResult | null;
  errorDetails: AuditErrorDetail[];
  createdAt: string;
  updatedAt: string;
};

export type WebsiteAuditPageRecord = AnalyzedAuditPage & {
  id: string;
  auditId: string;
  position: number;
  checkedAt: string;
};

export type WebsiteAuditDetail = WebsiteAuditRecord & {
  pages: WebsiteAuditPageRecord[];
};

export type WebsiteAuditSummary = Pick<
  WebsiteAuditRecord,
  | "id"
  | "leadId"
  | "websiteUrl"
  | "finalUrl"
  | "auditStatus"
  | "auditedAt"
  | "firecrawlPagesUsed"
  | "pagesChecked"
  | "pageSpeedMobile"
  | "errorDetails"
>;

export type WebsiteAuditRunResponse = {
  success: true;
  reused: boolean;
  externalRequests: {
    firecrawl: number;
    pageSpeed: number;
  };
  audit: WebsiteAuditDetail;
};

export class WebsiteAuditError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "WebsiteAuditError";
  }
}
