# AI First-Round Interviewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed web app where a manager sets up an interview, a candidate talks to an ElevenLabs voice agent, and the manager reads a scored, quote-backed report.

**Architecture:** Cloudflare Pages serves three static pages and a handful of server functions. The functions hold the ElevenLabs key, store interviews in a D1 database, and call three ElevenLabs agents: two text-only (Planner, Scorer) over the text-conversation REST API, one voice (Interviewer) joined from the browser with a short-lived token. Agents are defined in `agents/*.ts` and pushed by a sync script.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, D1, esbuild (bundles the browser code with `@elevenlabs/client`), vitest, wrangler.

**Spec:** `docs/superpowers/specs/2026-11-21-ai-first-round-interviewer-design.md`

## Global Constraints

- The ElevenLabs key is the only AI credential; it lives in the Pages secret `ELEVENLABS_API_KEY` and never reaches the browser.
- Interviewer model `claude-sonnet-5-5`; Planner and Scorer `claude-opus-5-5`.
- Interview length 30 minutes by default, 10 minutes for demos.
- Competency scores 1 to 5; overall out of 10, capped at 4 if a hard bar is not met; green ≥ 7.5, amber 5 to 7.4, red < 5.
- Claim verdicts: `substantiated`, `partly_substantiated`, `not_substantiated`. Never the word "lied".
- The compensation budget is never sent to the Interviewer or the browser.
- English only. No logins; IDs are 128-bit random.

## Facts verified by spike (2026-11-21)

- `POST /v1/convai/conversations` with `{"agent":{"type":"persisted","agent_id":…},"dynamic_variables":{…}}` then `POST /v1/convai/conversations/{id}/messages` with `{"input":[{"type":"user_message","content":[{"type":"text","text":…}]}]}` returns `{status:"completed", output:[{text}]}`. `background:true` returns early; `GET /v1/convai/conversations/{id}` then carries the transcript.
- `GET /v1/convai/conversation/token?agent_id=` returns `{token, conversation_id}` for a WebRTC session.
- `turn.turn_eagerness` accepts `patient | normal | eager`.
- The Cloudflare token can manage Pages and D1 but not KV, so storage is D1.

## Review Focus

- A scanned PDF with no text layer: the setup form says the CV text is empty and asks for pasted text.
- The Planner or Scorer returns prose or fenced JSON: `extractJson` strips fences; one retry; then a visible error with Retry.
- The candidate denies microphone access: the page explains how to allow it and offers Start again.
- A quote that differs from the transcript only by case, punctuation or spacing still counts as found.
- A call shorter than two minutes: the report page says the interview was too short to score and the candidate link still works.

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/lib/types.ts` | `InterviewInput`, `Competency`, `Plan`, `Report`, `Turn` types |
| `src/lib/json.ts` | `extractJson(text)` |
| `src/lib/validate.ts` | `validateInput`, `validatePlan`, `validateReport` |
| `src/lib/quotes.ts` | `normalise`, `quoteInTranscript`, `enforceEvidence(report, turns)` |
| `src/lib/scoring.ts` | `flagFor(score)`, `applyHardBarCap(report)` |
| `src/lib/prompts.ts` | `plannerMessage(input)`, `scorerMessage(input, plan, turns)`, `interviewerBrief(input, plan)` |
| `src/lib/eleven.ts` | `ElevenClient`: `startText`, `getConversation`, `getToken` |
| `src/lib/store.ts` | D1 reads and writes for interviews |
| `agents/{planner,interviewer,scorer}.ts` | agent configs incl. system prompts |
| `scripts/sync-agents.ts` | create or update the agents and the lookup tool; writes `agents/ids.json` |
| `scripts/simulate.ts` | text-mode bluffer run end to end |
| `functions/api/**` | HTTP routes (below) |
| `web/*.html`, `web/src/*.ts`, `web/style.css` | setup, interview and report pages |
| `demo/scenario.ts` | the bluffer scenario |
| `migrations/0001_init.sql` | `interviews` table |

Routes: `POST /api/interviews` (create, start planning) · `GET /api/interviews/:id` (manager view: status, plan, report) · `GET /api/interviews/:id/candidate` (first name, role, length only) · `POST /api/interviews/:id/session` (token) · `POST /api/interviews/:id/complete` (conversation ID; start scoring) · `POST /api/interviews/:id/retry` · `GET /api/tool/brief?interview_id=` (Interviewer's lookup, guarded by a shared secret header).

Statuses: `planning → ready → in_progress → scoring → done`, plus `plan_failed`, `score_failed`, `too_short`. Planning and scoring are started in background mode and advanced when `GET /api/interviews/:id` is polled.

---

### Task 1: Pure logic (types, JSON, validation, quotes, scoring)

**Files:** `src/lib/{types,json,validate,quotes,scoring}.ts`, tests in `tests/`, plus `package.json`, `tsconfig.json`, `vitest.config.ts`.

- [ ] Tests first, with these cases: `extractJson` handles bare, fenced and prose-wrapped JSON and throws on none; `quoteInTranscript` matches across case, punctuation and whitespace, only against candidate turns, and rejects quotes under 4 words; `enforceEvidence` drops missing quotes and sets `score: null, insufficient_evidence: true` when none remain; `applyHardBarCap` caps overall at 4 when any hard bar is `not_met`; `flagFor(7.5)="green"`, `flagFor(7.4)="amber"`, `flagFor(4.9)="red"`; `validateInput` rejects empty CV, empty competencies and lengths other than 10 or 30.
- [ ] Implement, run `npx vitest run`, commit.

### Task 2: Prompts, agents, sync script

**Files:** `src/lib/prompts.ts`, `agents/*.ts`, `scripts/sync-agents.ts`, `demo/scenario.ts`, tests for prompt assembly.

- [ ] Tests: `interviewerBrief` output contains no budget figure; `scorerMessage` contains the budget and numbered transcript turns; `plannerMessage` contains every competency name.
- [ ] Write the three system prompts to the behaviour in the spec. Interviewer config: `turn_eagerness: "patient"`, `turn_timeout: 30`, `speculative_turn: false`, `max_duration_seconds: 2100`, built-in `end_call`, webhook tool `get_interview_brief`, auth enabled, dynamic variables `interview_id`, `candidate_first_name`, `role_title`, `minutes`.
- [ ] `npm run sync-agents` creates or patches by name prefix `interviewer-agent/`; run it; commit.

### Task 3: ElevenLabs client, store, routes

**Files:** `src/lib/{eleven,store}.ts`, `functions/api/**`, `migrations/0001_init.sql`, `wrangler.toml`, route tests with a fake client and in-memory store.

- [ ] Tests: status transitions listed above; `/candidate` and `/session` never return plan, CV or budget; `/tool/brief` rejects a wrong secret; a conversation under 120 seconds gives `too_short`; malformed Scorer output retries once then `score_failed`.
- [ ] Implement; `npx vitest run`; commit.

### Task 4: Web pages

**Files:** `web/index.html`, `web/interview.html`, `web/report.html`, `web/src/{setup,interview,report}.ts`, `web/style.css`, `build.mjs`.

- [ ] Setup: form, PDF text extraction with `pdfjs-dist`, Load demo scenario, shows candidate and report links and the plan.
- [ ] Interview: consent, mic check, Start, speaking indicator, timer, End; on end calls `/complete`.
- [ ] Report: polling states, then the report as specified, with Retry on failure.
- [ ] Check each page in headless Chromium at phone and desktop widths; commit.

### Task 5: Scripted bluffer run

**Files:** `scripts/simulate.ts`.

- [ ] Drive the Interviewer over the text API with a scripted bluffer candidate (vague on the padded claim, specific elsewhere), then plan → transcript → Scorer. Pass condition: at least two follow-ups on the padded claim; the report lists it `not_substantiated`; every surviving quote is in the transcript. Tune prompts until it passes; commit.

### Task 6: Deploy

- [ ] Create the D1 database and Pages project, apply the migration, set `TOOL_SECRET`, deploy, point the lookup tool at the deployed URL, re-run sync.
- [ ] Smoke test the deployed API. Hand Subhro the URL and the one step only he can do (add `ELEVENLABS_API_KEY` in the dashboard) if the key cannot be set from the build session.
