import { ensureLeadFinderSchema } from "./repository";
import {
  type AnalyzedAuditPage,
  type AuditErrorDetail,
  type AuditSignalCollection,
  type AuditStatus,
  type PageSpeedMobileResult,
  type WebsiteAuditDetail,
  type WebsiteAuditRecord,
  type WebsiteAuditSummary,
  WebsiteAuditError,
} from "./audit-types";

const auditSchemaNames = [
  "lead_finder_website_audits",
  "lead_finder_audit_pages",
  "idx_lead_finder_audits_lead",
  "idx_lead_finder_audit_pages_audit",
  "idx_lead_finder_audits_one_active",
] as const;

const auditTableStatements = [
  `CREATE TABLE IF NOT EXISTS lead_finder_website_audits (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    website_url TEXT NOT NULL,
    final_url TEXT,
    url_source TEXT NOT NULL DEFAULT 'operator_selected'
      CHECK (url_source IN ('operator_selected', 'firecrawl')),
    audit_status TEXT NOT NULL
      CHECK (audit_status IN ('PENDING', 'RUNNING', 'COMPLETE', 'PARTIAL', 'FAILED')),
    refresh_requested INTEGER NOT NULL DEFAULT 0 CHECK (refresh_requested IN (0, 1)),
    started_at TEXT NOT NULL,
    audited_at TEXT,
    firecrawl_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (firecrawl_attempt_count BETWEEN 0 AND 5),
    firecrawl_pages_used INTEGER NOT NULL DEFAULT 0 CHECK (firecrawl_pages_used BETWEEN 0 AND 5),
    pages_checked INTEGER NOT NULL DEFAULT 0 CHECK (pages_checked BETWEEN 0 AND 5),
    pagespeed_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (pagespeed_attempt_count BETWEEN 0 AND 1),
    technical_signals_json TEXT NOT NULL DEFAULT '{}',
    conversion_signals_json TEXT NOT NULL DEFAULT '{}',
    seo_signals_json TEXT NOT NULL DEFAULT '{}',
    content_signals_json TEXT NOT NULL DEFAULT '{}',
    pagespeed_mobile_json TEXT,
    error_details_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (lead_id) REFERENCES lead_finder_leads(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS lead_finder_audit_pages (
    id TEXT PRIMARY KEY,
    audit_id TEXT NOT NULL,
    result_position INTEGER NOT NULL CHECK (result_position BETWEEN 0 AND 4),
    page_kind TEXT NOT NULL CHECK (page_kind IN ('homepage', 'contact', 'services', 'about', 'commercial')),
    requested_url TEXT NOT NULL,
    final_url TEXT,
    page_status TEXT NOT NULL CHECK (page_status IN ('SUCCESS', 'FAILED')),
    http_status INTEGER,
    title TEXT,
    meta_description TEXT,
    language TEXT,
    content_type TEXT,
    headings_json TEXT NOT NULL DEFAULT '[]',
    relevant_links_json TEXT NOT NULL DEFAULT '[]',
    markdown TEXT,
    cleaned_text TEXT,
    technical_signals_json TEXT NOT NULL DEFAULT '{}',
    conversion_signals_json TEXT NOT NULL DEFAULT '{}',
    seo_signals_json TEXT NOT NULL DEFAULT '{}',
    error_code TEXT,
    checked_at TEXT NOT NULL,
    FOREIGN KEY (audit_id) REFERENCES lead_finder_website_audits(id) ON DELETE CASCADE,
    UNIQUE (audit_id, result_position)
  ) STRICT`,
] as const;

const auditIndexStatements = [
  "CREATE INDEX IF NOT EXISTS idx_lead_finder_audits_lead ON lead_finder_website_audits(lead_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_lead_finder_audit_pages_audit ON lead_finder_audit_pages(audit_id, result_position)",
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_finder_audits_one_active
    ON lead_finder_website_audits(lead_id)
    WHERE audit_status IN ('PENDING', 'RUNNING')`,
] as const;

export const websiteAuditSchemaStatements = [
  ...auditTableStatements,
  ...auditIndexStatements,
] as const;

type CountRow = { total: number };
type LeadRow = { id: string; audit_status: string | null };

type AuditRow = {
  id: string;
  lead_id: string;
  website_url: string;
  final_url: string | null;
  audit_status: AuditStatus;
  refresh_requested: number;
  started_at: string;
  audited_at: string | null;
  firecrawl_attempt_count: number;
  firecrawl_pages_used: number;
  pages_checked: number;
  pagespeed_attempt_count: number;
  technical_signals_json: string;
  conversion_signals_json: string;
  seo_signals_json: string;
  content_signals_json: string;
  pagespeed_mobile_json: string | null;
  error_details_json: string;
  created_at: string;
  updated_at: string;
};

type AuditPageRow = {
  id: string;
  audit_id: string;
  result_position: number;
  page_kind: AnalyzedAuditPage["pageKind"];
  requested_url: string;
  final_url: string | null;
  page_status: AnalyzedAuditPage["status"];
  http_status: number | null;
  title: string | null;
  meta_description: string | null;
  language: string | null;
  content_type: string | null;
  headings_json: string;
  relevant_links_json: string;
  markdown: string | null;
  cleaned_text: string | null;
  technical_signals_json: string;
  conversion_signals_json: string;
  seo_signals_json: string;
  error_code: string | null;
  checked_at: string;
};

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapAudit(row: AuditRow): WebsiteAuditRecord {
  return {
    id: row.id,
    leadId: row.lead_id,
    websiteUrl: row.website_url,
    finalUrl: row.final_url,
    auditStatus: row.audit_status,
    refreshRequested: row.refresh_requested === 1,
    startedAt: row.started_at,
    auditedAt: row.audited_at,
    firecrawlAttemptCount: row.firecrawl_attempt_count,
    firecrawlPagesUsed: row.firecrawl_pages_used,
    pagesChecked: row.pages_checked,
    pageSpeedAttemptCount: row.pagespeed_attempt_count,
    technicalSignals: parseJson<AuditSignalCollection>(row.technical_signals_json, {}),
    conversionSignals: parseJson<AuditSignalCollection>(row.conversion_signals_json, {}),
    seoSignals: parseJson<AuditSignalCollection>(row.seo_signals_json, {}),
    contentSignals: parseJson<Record<string, unknown>>(row.content_signals_json, {}),
    pageSpeedMobile: parseJson<PageSpeedMobileResult | null>(row.pagespeed_mobile_json, null),
    errorDetails: parseJson<AuditErrorDetail[]>(row.error_details_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPage(row: AuditPageRow) {
  return {
    id: row.id,
    auditId: row.audit_id,
    position: row.result_position,
    pageKind: row.page_kind,
    requestedUrl: row.requested_url,
    finalUrl: row.final_url,
    status: row.page_status,
    httpStatus: row.http_status,
    title: row.title,
    metaDescription: row.meta_description,
    language: row.language,
    contentType: row.content_type,
    headings: parseJson(row.headings_json, []),
    relevantLinks: parseJson(row.relevant_links_json, []),
    markdown: row.markdown,
    cleanedText: row.cleaned_text,
    technicalSignals: parseJson<AuditSignalCollection>(row.technical_signals_json, {}),
    conversionSignals: parseJson<AuditSignalCollection>(row.conversion_signals_json, {}),
    seoSignals: parseJson<AuditSignalCollection>(row.seo_signals_json, {}),
    errorCode: row.error_code,
    checkedAt: row.checked_at,
  };
}

export async function ensureWebsiteAuditSchema(db: D1Database) {
  await ensureLeadFinderSchema(db);
  const placeholders = auditSchemaNames.map(() => "?").join(", ");
  const row = await db.prepare(
    `SELECT COUNT(*) AS total FROM sqlite_master WHERE name IN (${placeholders})`,
  ).bind(...auditSchemaNames).first<CountRow>();
  if (row?.total === auditSchemaNames.length) return;
  await db.batch(auditTableStatements.map((statement) => db.prepare(statement)));
  await db.batch(auditIndexStatements.map((statement) => db.prepare(statement)));
}

export async function assertLeadExists(db: D1Database, leadId: string) {
  await ensureWebsiteAuditSchema(db);
  const lead = await db.prepare(
    "SELECT id, audit_status FROM lead_finder_leads WHERE id = ?",
  ).bind(leadId).first<LeadRow>();
  if (!lead) throw new WebsiteAuditError("LEAD_NOT_FOUND", "Lead nije pronađen u D1 arhivi.", 404);
  return lead;
}

export async function getLatestWebsiteAudit(db: D1Database, leadId: string): Promise<WebsiteAuditDetail | null> {
  await ensureWebsiteAuditSchema(db);
  const row = await db.prepare(
    `SELECT * FROM lead_finder_website_audits
     WHERE lead_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
  ).bind(leadId).first<AuditRow>();
  if (!row) return null;
  const pages = await db.prepare(
    `SELECT * FROM lead_finder_audit_pages
     WHERE audit_id = ?
     ORDER BY result_position ASC`,
  ).bind(row.id).all<AuditPageRow>();
  return { ...mapAudit(row), pages: pages.results.map(mapPage) };
}

export async function getWebsiteAuditSummaries(db: D1Database): Promise<WebsiteAuditSummary[]> {
  await ensureWebsiteAuditSchema(db);
  const rows = await db.prepare(
    `SELECT audit.*
     FROM lead_finder_website_audits AS audit
     WHERE NOT EXISTS (
       SELECT 1 FROM lead_finder_website_audits AS newer
       WHERE newer.lead_id = audit.lead_id
         AND (newer.created_at > audit.created_at OR (newer.created_at = audit.created_at AND newer.id > audit.id))
     )
     ORDER BY audit.created_at DESC
     LIMIT 200`,
  ).all<AuditRow>();
  return rows.results.map((row) => {
    const audit = mapAudit(row);
    return {
      id: audit.id,
      leadId: audit.leadId,
      websiteUrl: audit.websiteUrl,
      finalUrl: audit.finalUrl,
      auditStatus: audit.auditStatus,
      auditedAt: audit.auditedAt,
      firecrawlPagesUsed: audit.firecrawlPagesUsed,
      pagesChecked: audit.pagesChecked,
      pageSpeedMobile: audit.pageSpeedMobile,
      errorDetails: audit.errorDetails,
    };
  });
}

export async function createWebsiteAuditRun(
  db: D1Database,
  leadId: string,
  websiteUrl: string,
  refreshRequested: boolean,
) {
  await assertLeadExists(db, leadId);
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO lead_finder_website_audits (
          id, lead_id, website_url, audit_status, refresh_requested,
          started_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
      ).bind(auditId, leadId, websiteUrl, refreshRequested ? 1 : 0, now, now, now),
      db.prepare(
        `UPDATE lead_finder_leads SET audit_status = 'PENDING', updated_at = ? WHERE id = ?`,
      ).bind(now, leadId),
    ]);
    await db.batch([
      db.prepare(
        `UPDATE lead_finder_website_audits SET audit_status = 'RUNNING', updated_at = ? WHERE id = ?`,
      ).bind(now, auditId),
      db.prepare(
        `UPDATE lead_finder_leads SET audit_status = 'RUNNING', updated_at = ? WHERE id = ?`,
      ).bind(now, leadId),
    ]);
  } catch {
    const active = await db.prepare(
      `SELECT id FROM lead_finder_website_audits
       WHERE lead_id = ? AND audit_status IN ('PENDING', 'RUNNING')
       LIMIT 1`,
    ).bind(leadId).first<{ id: string }>().catch(() => null);
    if (active) {
      throw new WebsiteAuditError("AUDIT_ALREADY_RUNNING", "Audit za ovaj lead već traje.", 409);
    }
    throw new WebsiteAuditError("AUDIT_PERSISTENCE_FAILED", "Novi audit nije moguće spremiti u D1.", 500);
  }
  return { auditId, startedAt: now };
}

type AuditCompletion = {
  auditId: string;
  leadId: string;
  websiteUrl: string;
  finalUrl: string | null;
  urlSource: "operator_selected" | "firecrawl";
  status: AuditStatus;
  pages: AnalyzedAuditPage[];
  firecrawlAttemptCount: number;
  pageSpeedAttemptCount: number;
  technicalSignals: AuditSignalCollection;
  conversionSignals: AuditSignalCollection;
  seoSignals: AuditSignalCollection;
  contentSignals: Record<string, unknown>;
  pageSpeedMobile: PageSpeedMobileResult | null;
  errorDetails: AuditErrorDetail[];
};

export async function completeWebsiteAudit(db: D1Database, completion: AuditCompletion) {
  const now = new Date().toISOString();
  const firecrawlPagesUsed = completion.pages.filter((page) => page.status === "SUCCESS").length;
  const statements: D1PreparedStatement[] = completion.pages.map((page, position) => db.prepare(
    `INSERT INTO lead_finder_audit_pages (
      id, audit_id, result_position, page_kind, requested_url, final_url,
      page_status, http_status, title, meta_description, language, content_type,
      headings_json, relevant_links_json, markdown, cleaned_text,
      technical_signals_json, conversion_signals_json, seo_signals_json,
      error_code, checked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), completion.auditId, position, page.pageKind,
    page.requestedUrl, page.finalUrl, page.status, page.httpStatus, page.title,
    page.metaDescription, page.language, page.contentType,
    JSON.stringify(page.headings), JSON.stringify(page.relevantLinks), page.markdown,
    page.cleanedText, JSON.stringify(page.technicalSignals),
    JSON.stringify(page.conversionSignals), JSON.stringify(page.seoSignals),
    page.errorCode, now,
  ));

  statements.push(
    db.prepare(
      `UPDATE lead_finder_website_audits SET
        website_url = ?, final_url = ?, url_source = ?, audit_status = ?,
        audited_at = ?, firecrawl_attempt_count = ?, firecrawl_pages_used = ?,
        pages_checked = ?, pagespeed_attempt_count = ?, technical_signals_json = ?,
        conversion_signals_json = ?, seo_signals_json = ?, content_signals_json = ?,
        pagespeed_mobile_json = ?, error_details_json = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(
      completion.websiteUrl, completion.finalUrl, completion.urlSource, completion.status, now,
      completion.firecrawlAttemptCount, firecrawlPagesUsed, completion.pages.length,
      completion.pageSpeedAttemptCount, JSON.stringify(completion.technicalSignals),
      JSON.stringify(completion.conversionSignals), JSON.stringify(completion.seoSignals),
      JSON.stringify(completion.contentSignals),
      completion.pageSpeedMobile ? JSON.stringify(completion.pageSpeedMobile) : null,
      JSON.stringify(completion.errorDetails), now, completion.auditId,
    ),
    db.prepare(
      `UPDATE lead_finder_leads SET audit_status = ?, updated_at = ? WHERE id = ?`,
    ).bind(completion.status, now, completion.leadId),
  );

  await db.batch(statements);
  const detail = await getLatestWebsiteAudit(db, completion.leadId);
  if (!detail) throw new WebsiteAuditError("AUDIT_PERSISTENCE_FAILED", "Audit nije moguće učitati iz D1.", 500);
  return detail;
}

export async function failWebsiteAuditRun(
  db: D1Database,
  auditId: string,
  leadId: string,
  errorCode: string,
) {
  const now = new Date().toISOString();
  const details: AuditErrorDetail[] = [{ component: "audit", code: errorCode, pageUrl: null }];
  await db.batch([
    db.prepare(
      `UPDATE lead_finder_website_audits SET audit_status = 'FAILED', audited_at = ?,
       error_details_json = ?, updated_at = ? WHERE id = ?`,
    ).bind(now, JSON.stringify(details), now, auditId),
    db.prepare(
      `UPDATE lead_finder_leads SET audit_status = 'FAILED', updated_at = ? WHERE id = ?`,
    ).bind(now, leadId),
  ]);
}
