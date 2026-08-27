CREATE TABLE IF NOT EXISTS lead_finder_leads (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_place_id TEXT NOT NULL,
  business_type_hint TEXT NOT NULL,
  email TEXT,
  website_quality_score INTEGER CHECK (website_quality_score BETWEEN 0 AND 100),
  opportunity_score INTEGER CHECK (opportunity_score BETWEEN 0 AND 100),
  audit_status TEXT,
  email_status TEXT,
  lead_status TEXT NOT NULL DEFAULT 'NEW',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (provider, provider_place_id)
) STRICT;

CREATE TABLE IF NOT EXISTS lead_finder_searches (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  location_query TEXT NOT NULL,
  business_type_query TEXT NOT NULL,
  requested_limit INTEGER NOT NULL CHECK (requested_limit BETWEEN 1 AND 20),
  returned_count INTEGER NOT NULL CHECK (returned_count >= 0),
  provider_request_count INTEGER NOT NULL CHECK (provider_request_count >= 0),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS lead_finder_search_leads (
  search_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  result_position INTEGER NOT NULL CHECK (result_position >= 0),
  PRIMARY KEY (search_id, lead_id),
  FOREIGN KEY (search_id) REFERENCES lead_finder_searches(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id) REFERENCES lead_finder_leads(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_lead_finder_leads_last_seen
  ON lead_finder_leads(last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_finder_searches_created
  ON lead_finder_searches(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_finder_search_leads_lead
  ON lead_finder_search_leads(lead_id);
