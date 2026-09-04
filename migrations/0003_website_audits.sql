CREATE TABLE IF NOT EXISTS lead_finder_website_audits (
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
) STRICT;

CREATE TABLE IF NOT EXISTS lead_finder_audit_pages (
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
) STRICT;

CREATE INDEX IF NOT EXISTS idx_lead_finder_audits_lead
  ON lead_finder_website_audits(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_finder_audit_pages_audit
  ON lead_finder_audit_pages(audit_id, result_position);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_finder_audits_one_active
  ON lead_finder_website_audits(lead_id)
  WHERE audit_status IN ('PENDING', 'RUNNING');
