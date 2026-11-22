import { type Eleven, MissingKeyError } from "../lib/eleven";
import { extractJson } from "../lib/json";
import { interviewerBrief, plannerMessage, scorerMessage } from "../lib/prompts";
import { enforceEvidence } from "../lib/quotes";
import { finaliseScore } from "../lib/scoring";
import type { Store } from "../lib/store";
import type { Interview, InterviewInput } from "../lib/types";
import { LANGUAGES, VOICES, languageByCode, previewLine, voiceById } from "../lib/voices";
import { ROLES, roleById } from "../data/roles";
import { handleChat, publicRole } from "./chat";
import { ValidationError, validateInput, validatePlan, validateReport } from "../lib/validate";

export interface Deps {
  store: Store;
  eleven: Eleven;
  agents: { planner: string; interviewer: string; scorer: string; concierge: string };
  toolSecret: string;
  now: () => number;
  newId: () => string;
}

/** Calls shorter than this are not scored. Kept short so a quick stage demo still gets a report. */
export const MIN_CALL_SECS = 45;
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

/** Stores a new interview and starts planning it. */
export async function createInterview(d: Deps, input: InterviewInput): Promise<Interview> {
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
  return iv;
}

const firstName = (iv: Interview) => iv.input.candidate_name.split(/\s+/)[0];

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
      return fail(404, "Not found");
    }

    if (parts[0] === "voices" && method === "GET") {
      if (!parts[1]) return json({ voices: VOICES.map(({ id, label }) => ({ id, label })) });
      const voice = VOICES.find((v) => v.id === parts[1]);
      if (!voice || parts[2] !== "preview") return fail(404, "Not found");
      // Same line every time, so the response can be cached for a long while.
      return new Response(await d.eleven.speak(voice.id, previewLine(voice)), {
        headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=2592000, immutable" },
      });
    }

    if (parts[0] === "chat") return handleChat(request, parts, d, (input) => createInterview(d, validateInput(input)));

    if (parts[0] === "roles" && method === "GET") {
      if (!parts[1]) return json({ roles: ROLES.map(publicRole) });
      const role = roleById(parts[1]);
      return role ? json(publicRole(role)) : fail(404, "Role not found");
    }

    if (parts[0] === "transcribe" && method === "POST") {
      const audio = await request.arrayBuffer();
      if (audio.byteLength < 1000) return fail(400, "That voice note was empty. Hold the button and speak.");
      if (audio.byteLength > 8_000_000) return fail(400, "That voice note is too long. Keep it under a minute.");
      return json({ text: await d.eleven.transcribe(audio, request.headers.get("content-type") ?? "audio/webm") });
    }

    if (parts[0] !== "interviews") return fail(404, "Not found");

    if (parts.length === 1 && method === "POST") {
      const iv = await createInterview(d, validateInput(await request.json().catch(() => null)));
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
      const voice = voiceById(iv.input.voice_id);
      return json({
        first_name: firstName(iv),
        role_title: iv.input.role_title,
        minutes: iv.input.minutes,
        status: iv.status,
        interviewer_name: voice.name,
        voice_id: voice.id,
        language: languageByCode(iv.input.language).code,
      });
    }

    if (action === "feedback" && method === "GET") {
      // Advance here too, so the candidate's chat can wait on this without the manager's page being open.
      if (await advance(d, iv)) await d.store.put(iv);
      return json({
        status: iv.status,
        first_name: firstName(iv),
        role_title: iv.input.role_title,
        feedback: iv.status === "done" ? (iv.report?.candidate_feedback ?? []) : null,
      });
    }

    if (action === "session" && method === "POST") {
      if (!["ready", "in_progress", "too_short"].includes(iv.status))
        return fail(409, iv.status === "planning" ? "This interview is still being prepared." : "This interview has already been completed.");
      // WebRTC by default; the browser asks for a WebSocket session if WebRTC cannot connect on its network.
      const body = (await request.json().catch(() => ({}))) as { transport?: string; voice_id?: string; language?: string };
      const language = LANGUAGES.find((l) => l.code === body.language) ?? languageByCode(iv.input.language);
      // A voice passed with the request (the test switcher) wins over the one chosen at setup.
      const voice = VOICES.find((v) => v.id === body.voice_id) ?? voiceById(iv.input.voice_id);
      const transport = body.transport === "websocket" ? "websocket" : "webrtc";
      const { token, signed_url, conversation_id } = await d.eleven.getSession(d.agents.interviewer, transport);
      if (conversation_id) iv.conversation_ids.push(conversation_id);
      iv.status = "in_progress";
      iv.started_at = d.now();
      await d.store.put(iv);
      return json({
        transport,
        token,
        signed_url,
        voice_id: voice.id,
        language: language.code,
        variables: {
          interview_id: iv.id,
          interviewer_name: voice.name,
          interviewer_gender: voice.gender,
          interview_language: language.instruction,
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
    if (e instanceof MissingKeyError) return fail(503, e.message);
    console.error(e);
    return fail(502, "Something went wrong talking to the interview service. Please try again.");
  }
}
