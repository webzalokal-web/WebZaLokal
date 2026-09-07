import type { AuditCheckStatus } from "./audit-types";

export const ANALYSIS_VERSION = "1";
export const PROMPT_VERSION = "1";
export const ANALYSIS_MODEL = "gpt-5.6-luna";
export const ANALYSIS_MONTHLY_LIMIT = 150;
// UTF-8 bytes are a conservative upper bound for byte-level input tokens.
// Leaves room for the developer prompt, JSON schema and message framing.
export const ANALYSIS_INPUT_BYTES = 32_000;
export const CATEGORY_MAX = { mobileUx: 25, conversion: 25, performanceTechnical: 20, seoDiscoverability: 15, contentPresentation: 15 } as const;
export type Category = keyof typeof CATEGORY_MAX;
export type CategoryScores = Record<Category, number>;
export type EvidenceItem = { id: string; pageId: string | null; url: string | null; kind: "signal" | "content" | "page" | "performance"; status: AuditCheckStatus; data: string };
export type AnalysisInput = { auditId: string; sourceAuditStatus: string; evidence: EvidenceItem[]; truncated: boolean };
export type Finding = {
  problem: string; evidenceRefs: string[]; evidence: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  salesRelevance: "LOW" | "MEDIUM" | "HIGH";
  suggestedFix: string; confidence: "LOW" | "MEDIUM" | "HIGH";
  outreachEligible: boolean;
};
export type ValidatedAnalysis = { categoryScores: CategoryScores; websiteQualityScore: number; fixabilityScore: number; findings: Finding[]; adjustments: string[] };
export interface AIAnalysisProvider {
  readonly name: string;
  readonly model: string;
  analyze(input: AnalysisInput): Promise<{ output: unknown; inputTokens: number | null; outputTokens: number | null }>;
}
export type Opportunity = {
  websiteNeed: number | null; businessQuality: number | null; fixability: number | null; contactability: number | null;
  score: number | null; provisional: boolean; coverage: number;
  priority: "HIGH" | "GOOD" | "MEDIUM" | "LOW" | "REJECT" | "UNCLASSIFIED"; reason: string;
};
export type AnalysisRecord = {
  id: string; leadId: string; auditId: string | null; provider: string; model: string;
  promptVersion: string; analysisVersion: string; sourceAuditStatus: string;
  status: "RUNNING" | "COMPLETE" | "FAILED"; createdAt: string; updatedAt: string;
  result: ValidatedAnalysis | null; opportunity: Opportunity | null;
  evidence: EvidenceItem[]; inputTokens: number | null; outputTokens: number | null; errorCode: string | null;
};
export class AnalysisError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) { super(message); }
}
