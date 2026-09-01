ALTER TABLE lead_finder_leads ADD COLUMN location_hint TEXT;
ALTER TABLE lead_finder_leads ADD COLUMN discovered_at TEXT;
ALTER TABLE lead_finder_leads ADD COLUMN last_checked_at TEXT;
ALTER TABLE lead_finder_leads ADD COLUMN priority TEXT NOT NULL DEFAULT 'UNCLASSIFIED'
  CHECK (priority IN ('UNCLASSIFIED', 'HIGH', 'GOOD', 'MEDIUM', 'LOW', 'REJECT'));
ALTER TABLE lead_finder_leads ADD COLUMN priority_reason TEXT;
ALTER TABLE lead_finder_leads ADD COLUMN contact_status TEXT NOT NULL DEFAULT 'NOT_STARTED';

UPDATE lead_finder_leads
SET location_hint = COALESCE(
      location_hint,
      (
        SELECT searches.location_query
        FROM lead_finder_search_leads AS search_leads
        INNER JOIN lead_finder_searches AS searches
          ON searches.id = search_leads.search_id
        WHERE search_leads.lead_id = lead_finder_leads.id
        ORDER BY searches.created_at ASC
        LIMIT 1
      ),
      'unknown'
    ),
    discovered_at = COALESCE(discovered_at, created_at),
    last_checked_at = COALESCE(last_checked_at, last_seen_at),
    audit_status = COALESCE(audit_status, 'NOT_STARTED');

CREATE TABLE IF NOT EXISTS lead_finder_provider_usage (
  provider TEXT NOT NULL,
  period_key TEXT NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, period_key)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_lead_finder_leads_last_checked
  ON lead_finder_leads(last_checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_finder_leads_priority
  ON lead_finder_leads(priority, discovered_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_finder_searches_lookup
  ON lead_finder_searches(
    provider,
    location_query,
    business_type_query,
    requested_limit,
    created_at DESC
  );
