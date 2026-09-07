import { ensureWebsiteAuditSchema } from "./audit-repository";
import { ANALYSIS_VERSION, PROMPT_VERSION, AnalysisError, type AnalysisRecord } from "./analysis-types";
import { analysisSchemaSql } from "./analysis-schema";

export async function ensureAnalysisSchema(db: D1Database) {
  await ensureWebsiteAuditSchema(db);
  const row = await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('lead_finder_ai_usage','lead_finder_ai_analyses','idx_ai_one_active','idx_ai_cached','ai_reserve_monthly')").first<{n:number}>();
  if (row?.n === 5) return;
  // Trigger body contains semicolons and must stay a single prepared statement.
  const [tables, trigger] = analysisSchemaSql.split("CREATE TRIGGER");
  await db.batch([...tables.split(";").filter(s => s.trim()).map(s => db.prepare(s)), db.prepare(`CREATE TRIGGER${trigger}`)]);
}
type Row = { id:string; lead_id:string; audit_id:string|null; provider:string; model:string; prompt_version:string; analysis_version:string; source_audit_status:string; status:AnalysisRecord["status"]; created_at:string; updated_at:string; result_json:string|null; opportunity_json:string|null; evidence_json:string; input_tokens:number|null; output_tokens:number|null; error_code:string|null };
function map(row: Row): AnalysisRecord {
  return { id:row.id,leadId:row.lead_id,auditId:row.audit_id,provider:row.provider,model:row.model,promptVersion:row.prompt_version,analysisVersion:row.analysis_version,sourceAuditStatus:row.source_audit_status,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,result:row.result_json ? JSON.parse(row.result_json) : null, opportunity:row.opportunity_json ? JSON.parse(row.opportunity_json) : null,evidence:JSON.parse(row.evidence_json),inputTokens:row.input_tokens,outputTokens:row.output_tokens,errorCode:row.error_code };
}
export async function getAnalysis(db:D1Database, leadId:string, sourceKey?:string) {
  await ensureAnalysisSchema(db);
  const row = await db.prepare(`SELECT * FROM lead_finder_ai_analyses WHERE lead_id = ? ${sourceKey ? "AND source_key = ? AND analysis_version = ? AND status = 'COMPLETE'" : ""} ORDER BY rowid DESC LIMIT 1`).bind(...(sourceKey ? [leadId,sourceKey,ANALYSIS_VERSION] : [leadId])).first<Row>();
  return row ? map(row) : null;
}
export async function analysisUsage(db:D1Database) {
  await ensureAnalysisSchema(db);
  return (await db.prepare("SELECT request_count FROM lead_finder_ai_usage WHERE period_key = ?").bind(new Date().toISOString().slice(0,7)).first<{request_count:number}>())?.request_count ?? 0;
}
export async function reserveAnalysis(db:D1Database, record:AnalysisRecord, refresh:boolean, paid:boolean) {
  const key = record.auditId ?? "NO_WEBSITE";
  try {
    const result = await db.prepare(`INSERT INTO lead_finder_ai_analyses(id,lead_id,audit_id,source_key,provider,model,prompt_version,analysis_version,source_audit_status,status,period_key,request_reserved,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,'RUNNING',?,?,?,? WHERE ? = 1 OR NOT EXISTS(SELECT 1 FROM lead_finder_ai_analyses WHERE lead_id = ? AND source_key = ? AND analysis_version = ? AND status = 'COMPLETE')`).bind(record.id,record.leadId,record.auditId,key,record.provider,record.model,PROMPT_VERSION,ANALYSIS_VERSION,record.sourceAuditStatus,new Date().toISOString().slice(0,7),paid?1:0,record.createdAt,record.createdAt,refresh?1:0,record.leadId,key,ANALYSIS_VERSION).run();
    return result.meta.changes > 0;
  } catch {
    if (await analysisUsage(db) >= 150) throw new AnalysisError("AI_MONTHLY_LIMIT", "Dosegnut je mjesečni limit od 150 AI analiza.",429);
    const active = await db.prepare("SELECT id FROM lead_finder_ai_analyses WHERE lead_id = ? AND status = 'RUNNING'").bind(record.leadId).first();
    if (active) throw new AnalysisError("AI_ALREADY_RUNNING", "Analiza za ovaj lead već traje. Ponovno otvori spremljeni rezultat kasnije.",409);
    throw new AnalysisError("AI_STORAGE_ERROR", "Analizu nije moguće rezervirati u D1.",500);
  }
}
export async function finishAnalysis(db:D1Database, record:AnalysisRecord) {
  const now = new Date().toISOString();
  // Do not let an analysis of an older audit overwrite scores after a new audit.
  const currentSource = record.auditId
    ? "AND ? = (SELECT id FROM lead_finder_website_audits WHERE lead_id = ? ORDER BY created_at DESC,id DESC LIMIT 1)"
    : "AND NOT EXISTS(SELECT 1 FROM lead_finder_website_audits WHERE lead_id = ?)";
  await db.batch([
    db.prepare("UPDATE lead_finder_ai_analyses SET status='COMPLETE',result_json=?,opportunity_json=?,evidence_json=?,input_tokens=?,output_tokens=?,updated_at=? WHERE id=? AND status='RUNNING'").bind(record.result ? JSON.stringify(record.result) : null,JSON.stringify(record.opportunity),JSON.stringify(record.evidence),record.inputTokens,record.outputTokens,now,record.id),
    db.prepare(`UPDATE lead_finder_leads SET website_quality_score=?,opportunity_score=?,priority=?,priority_reason=?,updated_at=? WHERE id=? ${currentSource}`).bind(record.result?.websiteQualityScore ?? null,record.opportunity?.score ?? null,record.opportunity?.priority ?? "UNCLASSIFIED",record.opportunity?.reason ?? null,now,record.leadId,...(record.auditId ? [record.auditId,record.leadId] : [record.leadId])),
  ]);
  return { ...record, status:"COMPLETE" as const, updatedAt:now };
}
