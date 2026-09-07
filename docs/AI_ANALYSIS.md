# Milestone 3: AI analysis and scoring

Feature branch: `feat/lead-finder-scoring-v1`. No main merge before authenticated real E2E and owner approval.

## Provider and limits

`AIAnalysisProvider` isolates provider code from the evidence/scoring/service layers. The OpenAI implementation uses Responses with centrally configured `gpt-5.6-luna`, low reasoning, strict JSON Schema, no tools, `store:false`, 6,000 maximum output tokens and a 90-second timeout. One request, no retries. `OPENAI_API_KEY` is a Worker secret and is never in the UI or logged. OpenAI documentation: https://developers.openai.com/api/docs/models/gpt-5.6-luna and https://developers.openai.com/api/docs/guides/structured-outputs.

Input is existing D1 M2 evidence only, not raw HTML. Deterministic packing prioritizes signals, homepage/page metadata, homepage text and commercial content. Maximum serialized input is 32,000 UTF-8 bytes, conservatively below roughly 40k tokens including instructions/schema. Website content is untrusted user-message data. The model receives no secrets or tools.

## Eligibility, provenance and unknowns

Only COMPLETE/PARTIAL audits with a successfully retrieved homepage and content/title qualify. FAILED and missing evidence produce zero AI requests. No audit does **not** establish no website. An explicit operator confirmation can record a no-website case, with null Website Quality, Website Need 100 and Fixability 100; no AI/Firecrawl/PageSpeed calls.

Every finding must cite supplied IDs and include a verbatim supporting excerpt. Unrecognized refs, invented URLs/emails, invalid ranges, added total fields and negative findings against PASS/UNKNOWN deterministic signals fail validation. Deterministic factual problem text is reconstructed from M2. Text-only qualitative inferences are retained as LOW confidence, ineligible for outreach. Even eligible findings still require human review: reference validation is not a proof of every semantic statement or of complete site coverage. Suggestions are not email copy.

Backend sums five category scores. Known M2 viewport/HTTPS/SEO/conversion evidence constrains category ranges. PageSpeed constrains the performance component; unknown technical checks do not automatically lose points. Findings do not mutate M2 evidence.

## Business Quality limitation inherited from M1

M1's permanent archive intentionally stores provider/place IDs, hints and workflow data, **not Google ratings/review counts/phone/website details**. Therefore current archived leads have `businessQuality:null`. The deterministic rating/review formula exists and is tested, ready for an appropriately sourced stored business-quality input. This milestone does not secretly fetch Google again, infer ratings, or change the approved M1 storage policy. This is a material limitation for real sales ranking.

Opportunity uses 40/30/15/15 weights when all components exist. With missing components, known weights are normalized and `provisional:true` plus weight coverage and a human-readable reason are persisted/displayed. Unknown Website Need yields no opportunity score. Priorities follow the requested thresholds; a HIGH **provisional** score (especially a no-website lead) is not proof of strong business quality. Contactability comes from known M2 public contacts or existing business email; crawler UNKNOWN stays unknown. No separate contact discovery.

## D1 and concurrency

Migration `0004_ai_analyses.sql` adds analysis history, usage and indexes without changing M1/M2 data. It is also applied idempotently by the protected analysis repository, following existing M1/M2 lazy schema setup. The SQL migration and runtime SQL must match.

An insert trigger atomically reserves a monthly slot before an external request. Usage cannot exceed 150 across parallel isolates. Failed/time-out attempts stay counted conservatively. There is one active run per lead. Non-refresh INSERT also checks for an existing successful `source_key + analysis_version` entry, closing the cache-check race. Explicit refresh creates a new history record. Scores are committed with the result in a D1 batch; failures preserve previous lead scores. Completion cannot overwrite scores if a newer M2 audit has appeared.

A Worker interruption could leave a RUNNING row. Do not auto-retry it; inspect the run and usage before manually recovering it. No scheduler or background refresh is introduced.

## Private API and UI

All routes inherit the existing Worker Basic auth gate:
- GET `/api/lead-finder/analyses`: UTC month usage, no external calls.
- GET `/api/lead-finder/analyses/:leadId`: most recent stored run, no external calls.
- POST `/api/lead-finder/analyses`: `{leadId,auditId,refresh,noWebsiteConfirmed}`; same-origin and per-minute limiter; backend validates eligibility and archive cache.

In `/lead-finder/`, open an audit or an archive row's scoring button. Analyze uses at most one AI call. Re-analyze has a confirmation. Saved analysis, category scores, opportunity components, provisional coverage, findings and usage are visible. Ranking sorts the currently displayed archive (up to 200 records), not a full database export.

## Real E2E gate (pending)

On the feature preview, using existing Basic login:
1. Open a COMPLETE audit. Analyze once. Record lead/audit/analysis IDs, model, token counts, score, findings and monthly counter change of exactly 1.
2. Reload and reopen: same analysis ID, no monthly increment, no Firecrawl/PageSpeed calls.
3. Re-analyze and accept confirmation: new analysis ID and exactly one new AI attempt; original audit unchanged.
4. Try a PARTIAL audit with retrieved homepage; source status remains PARTIAL.
5. Confirm no-website case: null Website Quality, no AI usage increment; review provisional score caveat.
6. Verify unauthenticated analysis routes return 401 and public routes still work.

No merge or production deployment of M3 until owner approval after this test.
