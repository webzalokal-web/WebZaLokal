CREATE TABLE IF NOT EXISTS lead_finder_ai_usage (
  period_key TEXT PRIMARY KEY, request_count INTEGER NOT NULL CHECK(request_count BETWEEN 0 AND 150)
) STRICT;
CREATE TABLE IF NOT EXISTS lead_finder_ai_analyses (
  id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES lead_finder_leads(id),
  audit_id TEXT REFERENCES lead_finder_website_audits(id),
  source_key TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
  prompt_version TEXT NOT NULL, analysis_version TEXT NOT NULL,
  source_audit_status TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('RUNNING','COMPLETE','FAILED')),
  period_key TEXT NOT NULL, request_reserved INTEGER NOT NULL CHECK(request_reserved IN (0,1)),
  result_json TEXT, opportunity_json TEXT, evidence_json TEXT NOT NULL DEFAULT '[]',
  input_tokens INTEGER, output_tokens INTEGER, error_code TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_one_active ON lead_finder_ai_analyses(lead_id) WHERE status = 'RUNNING';
CREATE INDEX IF NOT EXISTS idx_ai_cached ON lead_finder_ai_analyses(lead_id,source_key,analysis_version,status,created_at);
CREATE TRIGGER IF NOT EXISTS ai_reserve_monthly AFTER INSERT ON lead_finder_ai_analyses
WHEN NEW.request_reserved = 1
BEGIN
  INSERT INTO lead_finder_ai_usage(period_key,request_count) VALUES(NEW.period_key,1)
  ON CONFLICT(period_key) DO UPDATE SET request_count = request_count + 1 WHERE request_count < 150;
  SELECT CASE WHEN changes() = 0 THEN RAISE(ABORT,'AI_MONTHLY_LIMIT') END;
END;
