/**
 * Runs the whole product in text mode against the deployed app's database:
 * plan → interview (a simulated bluffer candidate) → report, then checks the report.
 *
 * Needs: ELEVENLABS_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID.
 * Optional: SIM_OUT (file to write the transcript and report to), MAX_EXCHANGES.
 */
import { writeFileSync } from "node:fs";
import ids from "../agents/ids.json";
import { BLUFFER_PERSONA } from "../demo/bluffer-persona";
import { demoScenario } from "../demo/scenario";
import { ElevenClient } from "../src/lib/eleven";
import { quoteInTranscript } from "../src/lib/quotes";
import { timeUpdate } from "../src/lib/time";
import type { Interview, Turn } from "../src/lib/types";
import { type Deps, handleApi } from "../src/server/app";
import { el } from "./eleven-admin";
import { remoteStore } from "./remote-store";

const need = (k: string) => process.env[k] ?? (() => { throw new Error(`Set ${k}`); })();
const store = remoteStore();
const MAX_EXCHANGES = Number(process.env.MAX_EXCHANGES ?? 45);
/** Pretend each question-and-answer takes this long, so the time checks follow a realistic clock. */
const SECS_PER_EXCHANGE = 28;

const deps: Deps = {
  store,
  eleven: new ElevenClient(need("ELEVENLABS_API_KEY")),
  agents: ids,
  toolSecret: "unused-here",
  now: () => Date.now(),
  newId: () => crypto.randomUUID().replace(/-/g, ""),
};

const call = async (method: string, path: string, body?: unknown) => {
  const res = await handleApi(new Request(`https://local/api${path}`, { method, body: body ? JSON.stringify(body) : undefined }), deps);
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error}`);
  return data;
};

async function waitFor(id: string, done: (s: string) => boolean, label: string) {
  for (let i = 0; i < 120; i++) {
    const iv = await call("GET", `/interviews/${id}`);
    if (done(iv.status)) return iv;
    if (i % 5 === 0) console.log(`  … ${label} (${iv.status})`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function say(conversationId: string, text: string, context?: string): Promise<{ text: string; status: string }> {
  const turn = await el(`/v1/convai/conversations/${conversationId}/messages`, "POST", {
    input: [
      ...(context ? [{ type: "contextual_update", text: context, context_id: "clock", placement: "end" }] : []),
      { type: "user_message", content: [{ type: "text", text }] },
    ],
  });
  return { text: (turn.output ?? []).map((o: any) => o.text).join(" ").trim(), status: turn.status };
}

async function tempAgent(name: string, prompt: string): Promise<string> {
  const { agent_id } = await el("/v1/convai/agents/create", "POST", {
    name,
    conversation_config: {
      conversation: { text_only: true },
      agent: { first_message: "", language: "en", prompt: { prompt, llm: "claude-sonnet-5-5", temperature: 0.7 } },
    },
  });
  return agent_id;
}

console.log("1. Planning");
const { id } = await call("POST", "/interviews", demoScenario);
const planned = await waitFor(id, (s) => s !== "planning", "plan");
if (planned.status !== "ready") throw new Error(`Plan failed: ${planned.error}`);
console.log(`   ${planned.plan.claims_to_probe.length} claims to probe:`);
for (const c of planned.plan.claims_to_probe) console.log(`   - ${c.claim}`);

console.log("2. Interview (text mode, simulated candidate)");
const iv = (await store.get(id))!;
iv.status = "in_progress";
iv.started_at = Date.now();
await store.put(iv);

const candidateAgent = await tempAgent("interviewer-agent/sim-candidate (temporary)", BLUFFER_PERSONA);
const turns: Turn[] = [];
try {
  const interviewer = await el("/v1/convai/conversations", "POST", {
    agent: { type: "persisted", agent_id: ids.interviewer },
    dynamic_variables: {
      interview_id: id,
      interviewer_name: "Maya",
      candidate_first_name: "Rohan",
      role_title: demoScenario.role_title,
      minutes: demoScenario.minutes,
    },
  });
  const candidate = await el("/v1/convai/conversations", "POST", { agent: { type: "persisted", agent_id: candidateAgent } });

  turns.push({ role: "agent", text: "Hi Rohan, it's lovely to meet you! I'm Maya, an AI interviewer… Can you hear me alright?" });
  let candidateLine = "Yes, I can hear you. Nice to meet you too.";
  for (let n = 1; n <= MAX_EXCHANGES; n++) {
    turns.push({ role: "candidate", text: candidateLine, at_secs: n * SECS_PER_EXCHANGE });
    // Tell the interviewer the time the way the browser does in a real call.
    const minute = Math.floor((n * SECS_PER_EXCHANGE) / 60);
    const reply = await say(interviewer.conversation_id, candidateLine, minute ? timeUpdate(minute, demoScenario.minutes) : undefined);
    if (!reply.text) {
      console.log(`   interviewer ended the call after ${n} exchanges (${reply.status})`);
      break;
    }
    turns.push({ role: "agent", text: reply.text, at_secs: n * SECS_PER_EXCHANGE + 10 });
    console.log(`\n   MAYA: ${reply.text}`);
    // In a voice call end_call hangs up; the text API keeps answering, so stop at the goodbye.
    if (/\bgoodbye\b/i.test(reply.text)) {
      console.log(`   interviewer closed the call after ${n} exchanges`);
      break;
    }
    const answer = await say(candidate.conversation_id, reply.text);
    candidateLine = answer.text || "Thanks, goodbye.";
    console.log(`   ROHAN: ${candidateLine}`);
    if (n === MAX_EXCHANGES) console.log("   stopped at the exchange limit");
  }

  const snap = await el(`/v1/convai/conversations/${interviewer.conversation_id}`);
  const toolCalls = (snap.transcript ?? []).flatMap((t: any) => (t.tool_calls ?? []).map((c: any) => c.tool_name));
  console.log(`\n   tools used: ${JSON.stringify(toolCalls)}`);
} finally {
  await el(`/v1/convai/agents/${candidateAgent}`, "DELETE").catch(() => {});
}

console.log("3. Scoring");
// Hand the simulated transcript to the normal scoring path.
const row = (await store.get(id))!;
row.status = "scoring";
row.turns = turns;
row.duration_secs = turns.length * 14;
await store.put(row);
// advance() starts the Scorer when it sees a transcript but no job, so nudge it once.
row.job_conversation_id = await deps.eleven.startText(
  ids.scorer,
  (await import("../src/lib/prompts")).scorerMessage(row.input, row.plan!, turns),
);
row.job_started_at = Date.now();
row.job_attempts = 1;
await store.put(row);
const scored = await waitFor(id, (s) => s !== "scoring", "report");
if (scored.status !== "done") throw new Error(`Scoring failed: ${scored.error}`);
const report = scored.report;

console.log(`\n   Overall ${report.overall_score}/10 (${report.flag})`);
for (const h of report.hard_bars) console.log(`   hard bar · ${h.label}: ${h.status}`);
for (const c of report.competencies) console.log(`   competency · ${c.name}: ${c.score ?? "not enough evidence"} (${c.quotes.length} quotes)`);
for (const c of report.claims) console.log(`   claim · ${c.verdict}: ${c.claim}`);

console.log("\n4. Checks");
// Interviewer turns from the first mention of the fraud service until it moves on to the next CV item.
const agentTurns = turns.filter((t) => t.role === "agent");
const fraudStart = agentTurns.findIndex((t) => /fraud/i.test(t.text));
const movedOn = agentTurns.findIndex((t, i) => i > fraudStart && /reconciliation|refund|idempotency|on-call|incident/i.test(t.text));
const fraudFollowUps = fraudStart < 0 ? 0 : (movedOn < 0 ? agentTurns.length : movedOn) - fraudStart;
const fraudClaim = report.claims.find((c: any) => /fraud/i.test(c.claim));
const allQuotes: string[] = [...report.hard_bars, ...report.competencies, ...report.claims].flatMap((x: any) => x.quotes);
const checks: [string, boolean][] = [
  [`interviewer asked about the fraud service at least 3 times (${fraudFollowUps})`, fraudFollowUps >= 3],
  [`fraud claim verdict is not_substantiated or partly_substantiated (${fraudClaim?.verdict})`, ["not_substantiated", "partly_substantiated"].includes(fraudClaim?.verdict)],
  [`every quote is in the transcript (${allQuotes.length} quotes)`, allQuotes.length > 0 && allQuotes.every((q) => quoteInTranscript(q, turns))],
  [`compensation hard bar is not_met (${report.hard_bars.find((h: any) => /comp/i.test(h.label))?.status})`, report.hard_bars.some((h: any) => /comp/i.test(h.label) && h.status === "not_met")],
  [
    // The reconciliation job was written with an AI assistant and is fully understood; it must not be marked down.
    "work written with an AI assistant but well understood is not marked down",
    !report.claims.some((c: any) => /reconciliation/i.test(c.claim) && c.verdict !== "substantiated") &&
      !/AI (assistant|tool)[^.]{0,80}(concern|weak|negative|red flag)/i.test(JSON.stringify(report)),
  ],
  ["the scorecard says how to read AI-assisted work", /\bAI\b/.test(JSON.stringify(planned.plan.scorecard?.principles ?? []))],
  ["the interviewer never said the budget", !turns.some((t) => t.role === "agent" && /\b18\b/.test(t.text))],
  ["the report never says lied or dishonest", !/\b(lied|lying|liar|dishonest)\b/i.test(JSON.stringify(report))],
];
for (const [label, ok] of checks) console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}`);
if (process.env.SIM_OUT) writeFileSync(process.env.SIM_OUT, JSON.stringify({ id, plan: planned.plan, turns, report }, null, 2));
console.log(`\nReport: /report?id=${id}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
