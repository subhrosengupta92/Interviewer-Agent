import type { Eleven } from "../lib/eleven";
import { extractJson } from "../lib/json";
import { interviewerBrief, plannerMessage, scorerMessage } from "../lib/prompts";
import { enforceEvidence } from "../lib/quotes";
import { finaliseScore } from "../lib/scoring";
import type { Store } from "../lib/store";
import type { Interview } from "../lib/types";
import { ValidationError, validateInput, validatePlan, validateReport } from "../lib/validate";

export interface Deps {
  store: Store;
  eleven: Eleven;
  agents: { planner: string; interviewer: string; scorer: string };
  toolSecret: string;
  now: () => number;
  newId: () => string;
}

export const MIN_CALL_SECS = 120;
const MAX_JOB_ATTEMPTS = 2;
const JOB_TIMEOUT_MS = 6 * 60_000;
/** How long after Start before the report page checks whether the call ended without the browser saying so. */
const ORPHAN_CHECK_MS = 60_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const fail = (status: number, error: string) => json({ error }, status);

async function startPlanning(d: Deps, iv: Interview) {
  iv.job_conversation_id = await d.eleven.startText(d.agents.planner, plannerMessage(iv.input));
  iv.job_started_at = d.now();
  iv.job_attempts += 1;
  iv.status = "planning";
  iv.error = null;
}

/** Moves to "scoring" with no transcript yet; advance() collects it once ElevenLabs has finished the call. */
function beginScoring(iv: Interview) {
  iv.status = "scoring";
  iv.turns = null;
  iv.report = null;
  iv.job_conversation_id = null;
  iv.job_started_at = null;
  iv.job_attempts = 0;
  iv.error = null;
}

async function startScorer(d: Deps, iv: Interview) {
  iv.job_conversation_id = await d.eleven.startText(d.agents.scorer, scorerMessage(iv.input, iv.plan!, iv.turns!));
  iv.job_started_at = d.now();
  iv.job_attempts += 1;
}

/** Reads the background job's reply. Returns null while it is still running. */
async function readJob(d: Deps, iv: Interview): Promise<{ text: string } | { failed: string } | null> {
  const snap = await d.eleven.getConversation(iv.job_conversation_id!);
  const reply = snap.turns.filter((t) => t.role === "agent").at(-1);
  if (reply) return { text: reply.text };
  if (snap.status === "failed") return { failed: "The model run failed." };
  if (d.now() - (iv.job_started_at ?? 0) > JOB_TIMEOUT_MS) return { failed: "The model run timed out." };
  return null;
}

/** Picks the most recent finished call that is long enough to score. */
async function collectTranscript(d: Deps, iv: Interview): Promise<"wait" | "too_short" | "ok"> {
  for (const id of [...iv.conversation_ids].reverse()) {
    const snap = await d.eleven.getConversation(id).catch(() => null);
    if (!snap) continue; // a session that was issued a token but never connected
    if (snap.status !== "done" && snap.status !== "failed") return "wait";
    if (snap.duration_secs >= MIN_CALL_SECS && snap.turns.some((t) => t.role === "candidate")) {
      iv.turns = snap.turns;
      iv.duration_secs = snap.duration_secs;
      return "ok";
    }
  }
  return "too_short";
}

/** Pushes an interview one step along if its background work has finished. */
export async function advance(d: Deps, iv: Interview): Promise<boolean> {
  if (iv.status === "planning") {
    const job = await readJob(d, iv);
    if (!job) return false;
    try {
      if ("failed" in job) throw new Error(job.failed);
      iv.plan = validatePlan(extractJson(job.text), iv.input);
      iv.status = "ready";
      iv.job_conversation_id = null;
    } catch (e) {
      if (iv.job_attempts < MAX_JOB_ATTEMPTS) await startPlanning(d, iv);
      else {
        iv.status = "plan_failed";
        iv.error = `Could not build the interview plan: ${(e as Error).message}`;
      }
    }
    return true;
  }
  if (iv.status === "in_progress") {
    if (!iv.conversation_ids.length || d.now() - (iv.started_at ?? 0) < ORPHAN_CHECK_MS) return false;
    const latest = await d.eleven.getConversation(iv.conversation_ids.at(-1)!).catch(() => null);
    if (!latest || latest.status !== "done") return false;
    beginScoring(iv);
    // fall through to collect the transcript in the same request
  }
  if (iv.status === "scoring") {
    if (!iv.turns) {
      const got = await collectTranscript(d, iv);
      if (got === "wait") return true;
      if (got === "too_short") {
        iv.status = "too_short";
        return true;
      }
      await startScorer(d, iv);
      return true;
    }
    const job = await readJob(d, iv);
    if (!job) return false;
    try {
      if ("failed" in job) throw new Error(job.failed);
      const report = validateReport(extractJson(job.text), iv.input);
      iv.report = finaliseScore(enforceEvidence(report, iv.turns));
      iv.status = "done";
      iv.job_conversation_id = null;
    } catch (e) {
      if (iv.job_attempts < MAX_JOB_ATTEMPTS) await startScorer(d, iv);
      else {
        iv.status = "score_failed";
        iv.error = `Could not write the report: ${(e as Error).message}`;
      }
    }
    return true;
  }
  return false;
}

const firstName = (iv: Interview) => iv.input.candidate_name.split(/\s+/)[0];

export function timeGuidance(elapsedMin: number, totalMin: number): string {
  const left = totalMin - elapsedMin;
  if (left <= 0) return "Time is up. Close the interview now: thank the candidate, mention next steps, say goodbye, then call end_call.";
  if (left <= Math.max(2, totalMin * 0.15)) return "Wrap up: invite the candidate's questions briefly, then close.";
  if (left <= totalMin * 0.35) return "Finish competencies and claims now, then move to motivation.";
  return "On track. Continue with the plan.";
}

export async function handleApi(request: Request, d: Deps): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = request.method;
  try {
    if (parts[0] === "tool") {
      if (request.headers.get("x-tool-secret") !== d.toolSecret || !d.toolSecret) return fail(401, "Unauthorised");
      const iv = await d.store.get(url.searchParams.get("interview_id") ?? "");
      if (!iv || !iv.plan) return fail(404, "Interview not found");
      if (parts[1] === "brief" && method === "GET") return json({ brief: interviewerBrief(iv.input, iv.plan) });
      if (parts[1] === "time" && method === "GET") {
        const elapsed = Math.max(0, Math.floor((d.now() - (iv.started_at ?? d.now())) / 60_000));
        return json({
          minutes_elapsed: elapsed,
          minutes_remaining: Math.max(0, iv.input.minutes - elapsed),
          guidance: timeGuidance(elapsed, iv.input.minutes),
        });
      }
      return fail(404, "Not found");
    }

    if (parts[0] !== "interviews") return fail(404, "Not found");

    if (parts.length === 1 && method === "POST") {
      const input = validateInput(await request.json().catch(() => null));
      const iv: Interview = {
        id: d.newId(),
        created_at: d.now(),
        status: "planning",
        input,
        plan: null,
        report: null,
        turns: null,
        job_conversation_id: null,
        job_started_at: null,
        job_attempts: 0,
        started_at: null,
        conversation_ids: [],
        duration_secs: null,
        error: null,
      };
      await startPlanning(d, iv);
      await d.store.put(iv);
      return json({ id: iv.id }, 201);
    }

    const iv = await d.store.get(parts[1] ?? "");
    if (!iv) return fail(404, "Interview not found");
    const action = parts[2];

    if (!action && method === "GET") {
      if (await advance(d, iv)) await d.store.put(iv);
      return json({
        id: iv.id,
        status: iv.status,
        created_at: iv.created_at,
        input: iv.input,
        plan: iv.plan,
        report: iv.report,
        turns: iv.status === "done" ? iv.turns : null,
        duration_secs: iv.duration_secs,
        attempts: iv.conversation_ids.length,
        error: iv.error,
      });
    }

    // Candidate-facing routes below: never return the plan, the CV or the hard bars.
    if (action === "candidate" && method === "GET") {
      return json({ first_name: firstName(iv), role_title: iv.input.role_title, minutes: iv.input.minutes, status: iv.status });
    }

    if (action === "session" && method === "POST") {
      if (!["ready", "in_progress", "too_short"].includes(iv.status))
        return fail(409, iv.status === "planning" ? "This interview is still being prepared." : "This interview has already been completed.");
      const { token, conversation_id } = await d.eleven.getToken(d.agents.interviewer);
      if (conversation_id) iv.conversation_ids.push(conversation_id);
      iv.status = "in_progress";
      iv.started_at = d.now();
      await d.store.put(iv);
      return json({
        token,
        variables: {
          interview_id: iv.id,
          candidate_first_name: firstName(iv),
          role_title: iv.input.role_title,
          minutes: iv.input.minutes,
        },
      });
    }

    if (action === "complete" && method === "POST") {
      if (iv.status !== "in_progress") return json({ status: iv.status });
      const body = (await request.json().catch(() => ({}))) as { conversation_id?: string };
      // Only trust a browser-supplied ID when the server was not given one with the token.
      if (!iv.conversation_ids.length && typeof body.conversation_id === "string" && /^conv_[a-z0-9]+$/.test(body.conversation_id))
        iv.conversation_ids.push(body.conversation_id);
      beginScoring(iv);
      await d.store.put(iv);
      return json({ status: iv.status });
    }

    if (action === "retry" && method === "POST") {
      if (iv.status === "plan_failed") {
        iv.job_attempts = 0;
        await startPlanning(d, iv);
      } else if (iv.status === "score_failed" || iv.status === "done") beginScoring(iv);
      else return fail(409, "Nothing to retry.");
      await d.store.put(iv);
      return json({ status: iv.status });
    }

    return fail(404, "Not found");
  } catch (e) {
    if (e instanceof ValidationError) return fail(400, e.message);
    console.error(e);
    return fail(502, "Something went wrong talking to the interview service. Please try again.");
  }
}
