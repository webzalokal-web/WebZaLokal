import { getLatestWebsiteAudit } from "./audit-repository";
import { buildAnalysisInput, validateAnalysis } from "./analysis-evidence";
import { ensureAnalysisSchema, finishAnalysis, getAnalysis, reserveAnalysis } from "./analysis-repository";
import { ANALYSIS_VERSION, PROMPT_VERSION, AnalysisError, type AIAnalysisProvider, type AnalysisRecord } from "./analysis-types";
import { contactability, opportunityScore } from "./opportunity-scoring";

export type AnalysisRequest = { leadId:string; auditId:string|null; refresh:boolean; noWebsiteConfirmed:boolean };
export function validateAnalysisRequest(value: unknown): AnalysisRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AnalysisError("INVALID_INPUT","Neispravan zahtjev.");
  const v = value as Record<string,unknown>;
  if (typeof v.leadId !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(v.leadId) || (v.auditId !== null && v.auditId !== undefined && (typeof v.auditId !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(v.auditId))) || (v.refresh !== undefined && typeof v.refresh !== "boolean") || (v.noWebsiteConfirmed !== undefined && typeof v.noWebsiteConfirmed !== "boolean")) throw new AnalysisError("INVALID_INPUT","Provjeri lead/audit ID i eksplicitnu refresh akciju.");
  return { leadId:v.leadId,auditId:typeof v.auditId === "string" ? v.auditId : null,refresh:v.refresh === true,noWebsiteConfirmed:v.noWebsiteConfirmed === true };
}
export async function runAnalysis(db:D1Database, provider:AIAnalysisProvider, request:AnalysisRequest) {
  await ensureAnalysisSchema(db);
  const lead = await db.prepare("SELECT id,email FROM lead_finder_leads WHERE id=?").bind(request.leadId).first<{id:string;email:string|null}>();
  if (!lead) throw new AnalysisError("LEAD_NOT_FOUND","Lead nije pronađen.",404);
  const audit = await getLatestWebsiteAudit(db,request.leadId);
  if (audit && request.auditId !== audit.id) throw new AnalysisError("AUDIT_CHANGED","Otvori najnoviji audit prije analize.",409);
  if (!audit && !request.noWebsiteConfirmed) throw new AnalysisError("WEBSITE_UNKNOWN","Nema audita. Nedostupan website nije automatski potvrda da website ne postoji.",409);
  if (audit && request.noWebsiteConfirmed) throw new AnalysisError("WEBSITE_EXISTS","Lead ima website audit; koristi njegov evidence.",409);
  const key = audit?.id ?? "NO_WEBSITE";
  const cached = await getAnalysis(db,request.leadId,key);
  if (cached && !request.refresh) return { success:true,reused:true,externalRequests:{openai:0},analysis:cached };
  const input = audit ? buildAnalysisInput(audit) : null;
  const now = new Date().toISOString();
  const record:AnalysisRecord = {id:crypto.randomUUID(),leadId:lead.id,auditId:audit?.id ?? null,provider:input ? provider.name : "deterministic",model:input ? provider.model : "none",promptVersion:PROMPT_VERSION,analysisVersion:ANALYSIS_VERSION,sourceAuditStatus:audit?.auditStatus ?? "NO_WEBSITE_OPERATOR_CONFIRMED",status:"RUNNING",createdAt:now,updatedAt:now,result:null,opportunity:null,evidence:[],inputTokens:null,outputTokens:null,errorCode:null};
  if (!await reserveAnalysis(db,record,request.refresh,!!input)) {
    const winner = await getAnalysis(db,lead.id,key);
    if (!winner) throw new AnalysisError("AI_ALREADY_RUNNING","Analiza se sprema. Otvori je ponovno.",409);
    return {success:true,reused:true,externalRequests:{openai:0},analysis:winner};
  }
  try {
    if (input) {
      const response = await provider.analyze(input);
      record.result = validateAnalysis(response.output,input);
      record.inputTokens=response.inputTokens;record.outputTokens=response.outputTokens;
      // Persist only cited evidence excerpts, not the complete provider request.
      const cited = new Set(record.result.findings.flatMap(f => f.evidenceRefs));
      record.evidence = input.evidence.filter(e => cited.has(e.id)).map(e => ({...e,data:e.kind === "content" ? record.result!.findings.filter(f => f.evidenceRefs.includes(e.id)).map(f => f.evidence).join("\n") : e.data}));
    }
    // Google rating/reviews are not retained by M1. Their absence stays UNKNOWN;
    // no paid Places refresh and no inferred business reputation.
    record.opportunity = opportunityScore(record.result ? 100-record.result.websiteQualityScore : 100,null,record.result?.fixabilityScore ?? 100,contactability(audit?.conversionSignals ?? null,lead.email));
    const saved = await finishAnalysis(db,record);
    return {success:true,reused:false,externalRequests:{openai:input?1:0},analysis:saved};
  } catch(error) {
    const safe = error instanceof AnalysisError ? error : new AnalysisError("AI_ANALYSIS_FAILED","Analiza nije dovršena; prethodni score ostaje sačuvan.",502);
    await db.prepare("UPDATE lead_finder_ai_analyses SET status='FAILED',error_code=?,updated_at=? WHERE id=?").bind(safe.code,new Date().toISOString(),record.id).run();
    throw safe;
  }
}
