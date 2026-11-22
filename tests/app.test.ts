import { beforeEach, describe, expect, it } from "vitest";
import type { ConversationSnapshot, Eleven } from "../src/lib/eleven";
import { interviewerBrief, plannerMessage, scorerMessage } from "../src/lib/prompts";
import { MemoryStore } from "../src/lib/store";
import type { Plan } from "../src/lib/types";
import { type Deps, handleApi } from "../src/server/app";
import { parseReply } from "../src/server/chat";
import { timeGuidance, timeUpdate } from "../src/lib/time";
import { input, report, turns } from "./fixtures";

const plan: Plan = {
  scorecard: {
    bar: "Ships small backend features end to end within six months.",
    competencies: [
      { name: "System design", strong: ["Explains why a design choice was made"], weak: ["Names tools without trade-offs"] },
      { name: "Ownership", strong: ["Precise about their own part"], weak: ["Says we throughout"] },
    ],
    principles: ["Using AI coding tools is fine; what matters is understanding what was shipped."],
  },
  opening: "Thanks for your time.",
  background_questions: ["Tell me about your path so far."],
  hard_bar_checks: [{ id: "hb1", label: "Compensation", question: "What are your expectations?" }],
  competencies: [
    { name: "System design", cv_anchor: "retry service", questions: ["How did the retry service work?"] },
    { name: "Ownership", cv_anchor: "retry service", questions: ["Which part was yours?"] },
  ],
  claims_to_probe: [{ id: "c1", claim: "Built the payments retry service", why_probe: "sole ownership", specifics_needed: ["what they wrote"] }],
  motivation_questions: ["Why this role?"],
  time_budget_minutes: { competencies_and_claims: 18 },
};

class FakeEleven implements Eleven {
  convs = new Map<string, ConversationSnapshot>();
  started: { agent: string; message: string; id: string }[] = [];
  n = 0;
  async startText(agent: string, message: string) {
    const id = `job${++this.n}`;
    this.started.push({ agent, message, id });
    this.convs.set(id, { status: "in-progress", turns: [], duration_secs: 0 });
    return id;
  }
  async getConversation(id: string) {
    const c = this.convs.get(id);
    if (!c) throw new Error("not found");
    return c;
  }
  async getSession(_agent: string, transport: string) {
    const conversation_id = `conv_${++this.n}`;
    return transport === "websocket" ? { signed_url: "wss://x", conversation_id } : { token: "tok", conversation_id };
  }
  chats: { id: string; said: string[] }[] = [];
  nextReply = '{"say":"Hi! Share your LinkedIn?","action":null}';
  async openChat() {
    const id = `chat${++this.n}`;
    this.chats.push({ id, said: [] });
    return id;
  }
  async chat(id: string, text: string) {
    this.chats.find((c) => c.id === id)!.said.push(text);
    return this.nextReply;
  }
  async transcribe() {
    return "hello there";
  }
  async speak(voiceId: string, text: string) {
    return new TextEncoder().encode(`${voiceId}:${text}`).buffer as ArrayBuffer;
  }
  reply(id: string, text: string) {
    this.convs.set(id, { status: "done", turns: [{ role: "agent", text }], duration_secs: 0 });
  }
  lastJob() {
    return this.started.at(-1)!;
  }
}

let eleven: FakeEleven;
let d: Deps;
let clock: number;

const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await handleApi(
    new Request(`https://x.test/api${path}`, { method, body: body ? JSON.stringify(body) : undefined, headers }),
    d,
  );
  return { status: res.status, body: (await res.json()) as any };
};

async function toReady() {
  const { body } = await call("POST", "/interviews", input);
  eleven.reply(eleven.lastJob().id, "```json\n" + JSON.stringify(plan) + "\n```");
  await call("GET", `/interviews/${body.id}`);
  return body.id as string;
}

async function toScoring(id: string, secs = 600) {
  await call("POST", `/interviews/${id}/session`);
  const conv = (await d.store.get(id))!.conversation_ids.at(-1)!;
  eleven.convs.set(conv, { status: "done", turns, duration_secs: secs });
  await call("POST", `/interviews/${id}/complete`);
  return call("GET", `/interviews/${id}`);
}

beforeEach(() => {
  eleven = new FakeEleven();
  clock = 1_000_000;
  let n = 0;
  d = {
    store: new MemoryStore(),
    eleven,
    agents: { planner: "P", interviewer: "I", scorer: "S", concierge: "C", recruiter: "R", fit: "F", matcher: "M", notes: "N" },
    toolSecret: "s3cret",
    now: () => clock,
    newId: () => `iv${++n}`,
  };
});

describe("prompts", () => {
  it("keeps the budget away from the Planner and the Interviewer", () => {
    expect(plannerMessage(input)).not.toContain("18 LPA");
    expect(interviewerBrief(input, plan)).not.toContain("18 LPA");
  });
  it("gives the Scorer the budget and a numbered transcript", () => {
    const m = scorerMessage(input, plan, turns);
    expect(m).toContain("18 LPA");
    expect(m).toContain("[2] CANDIDATE: I wrote the back-off scheduler");
  });
  it("gives the scorecard to both the Interviewer and the Scorer", () => {
    for (const text of [interviewerBrief(input, plan), scorerMessage(input, plan, turns)]) {
      expect(text).toContain("WHAT GOOD LOOKS LIKE FOR THIS ROLE");
      expect(text).toContain("Strong evidence: Explains why a design choice was made");
      expect(text).toContain("Using AI coding tools is fine");
    }
  });
  it("still works for plans written before scorecards existed", () => {
    const { scorecard: _, ...old } = plan;
    expect(interviewerBrief(input, old)).toContain("CV claims to probe");
    expect(scorerMessage(input, old, turns)).toContain("No scorecard was written");
  });
  it("names every competency for the Planner", () => {
    for (const c of input.competencies) expect(plannerMessage(input)).toContain(c.name);
  });
});

describe("planning", () => {
  it("rejects a bad form with a readable message", async () => {
    const r = await call("POST", "/interviews", { ...input, cv_text: "" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/CV is empty/);
  });
  it("goes planning → ready when the Planner replies", async () => {
    const { body } = await call("POST", "/interviews", input);
    expect((await call("GET", `/interviews/${body.id}`)).body.status).toBe("planning");
    eleven.reply(eleven.lastJob().id, JSON.stringify(plan));
    const r = await call("GET", `/interviews/${body.id}`);
    expect(r.body.status).toBe("ready");
    expect(r.body.plan.competencies).toHaveLength(2);
  });
  it("retries malformed output once, then fails with Retry available", async () => {
    const { body } = await call("POST", "/interviews", input);
    eleven.reply(eleven.lastJob().id, "I cannot help with that.");
    expect((await call("GET", `/interviews/${body.id}`)).body.status).toBe("planning");
    expect(eleven.started).toHaveLength(2);
    eleven.reply(eleven.lastJob().id, "still prose");
    expect((await call("GET", `/interviews/${body.id}`)).body.status).toBe("plan_failed");
    expect((await call("POST", `/interviews/${body.id}/retry`)).body.status).toBe("planning");
  });
  it("fails a job that never answers", async () => {
    const { body } = await call("POST", "/interviews", input);
    clock += 7 * 60_000;
    await call("GET", `/interviews/${body.id}`);
    clock += 7 * 60_000;
    expect((await call("GET", `/interviews/${body.id}`)).body.status).toBe("plan_failed");
  });
});

describe("a deployment without the ElevenLabs key", () => {
  it("still serves finished reports and says plainly what is missing otherwise", async () => {
    const { ElevenClient } = await import("../src/lib/eleven");
    const id = await toReady();
    d.eleven = new ElevenClient("");
    expect((await call("GET", `/interviews/${id}`)).status).toBe(200);
    const r = await call("POST", "/interviews", input);
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/ElevenLabs key has not been added/);
  });
});

describe("candidate routes", () => {
  it("never expose the plan, the CV or the budget", async () => {
    const id = await toReady();
    const c = await call("GET", `/interviews/${id}/candidate`);
    const s = await call("POST", `/interviews/${id}/session`);
    const text = JSON.stringify([c.body, s.body]);
    expect(text).not.toMatch(/18 LPA|retry service|Finlo|Mumbai/);
    expect(s.body.variables).toEqual({
      interview_id: id,
      interviewer_name: "Tripti",
      interviewer_gender: "female",
      interview_language: "English",
      candidate_first_name: "Asha",
      role_title: "SDE 1",
      minutes: 30,
    });
    expect(s.body.token).toBe("tok");
  });
  it("issue a WebSocket session on request, and count only the call that happened", async () => {
    const id = await toReady();
    await call("POST", `/interviews/${id}/session`);
    const s = await call("POST", `/interviews/${id}/session`, { transport: "websocket" });
    expect(s.body).toMatchObject({ transport: "websocket", signed_url: "wss://x" });
    const [, second] = (await d.store.get(id))!.conversation_ids;
    eleven.convs.set(second, { status: "done", turns, duration_secs: 600 });
    await call("POST", `/interviews/${id}/complete`);
    expect((await call("GET", `/interviews/${id}`)).body.status).toBe("scoring");
  });
  it("refuse a session before the plan is ready, and allow calling again after a call has been scored", async () => {
    const { body } = await call("POST", "/interviews", input);
    expect((await call("POST", `/interviews/${body.id}/session`)).status).toBe(409);
    const id = await toReady();
    await toScoring(id);
    eleven.reply(eleven.lastJob().id, JSON.stringify(report));
    expect((await call("GET", `/interviews/${id}`)).body.status).toBe("done");
    expect((await call("POST", `/interviews/${id}/session`)).status).toBe(200);
    expect((await call("GET", `/interviews/${id}/candidate`)).body.status).toBe("in_progress");
  });
});

describe("voices", () => {
  it("lists the voices and serves a cached preview only for a listed voice", async () => {
    const list = await call("GET", "/voices");
    expect(list.body.voices.length).toBeGreaterThan(3);
    const ok = await handleApi(new Request(`https://x.test/api/voices/${list.body.voices[0].id}/preview`), d);
    expect(ok.headers.get("content-type")).toBe("audio/mpeg");
    expect(await ok.text()).toContain("I'm Tripti");
    expect((await call("GET", "/voices/not-a-voice/preview")).status).toBe(404);
  });
  it("uses the voice chosen at setup, and lets the test switcher override it for one call", async () => {
    const { body } = await call("POST", "/interviews", { ...input, voice_id: "x3gYeuNB0kLLYxOZsaSh" });
    eleven.reply(eleven.lastJob().id, JSON.stringify(plan));
    await call("GET", `/interviews/${body.id}`);
    expect((await call("GET", `/interviews/${body.id}/candidate`)).body.interviewer_name).toBe("Shrey");
    const a = await call("POST", `/interviews/${body.id}/session`);
    expect(a.body).toMatchObject({ voice_id: "x3gYeuNB0kLLYxOZsaSh", variables: { interviewer_name: "Shrey" } });
    const b = await call("POST", `/interviews/${body.id}/session`, { voice_id: "OUBnvvuqEKdDWtapoJFn" });
    expect(b.body).toMatchObject({ voice_id: "OUBnvvuqEKdDWtapoJFn", variables: { interviewer_name: "Tia" } });
    const c = await call("POST", `/interviews/${body.id}/session`, { voice_id: "someone-elses-voice" });
    expect(c.body.voice_id).toBe("x3gYeuNB0kLLYxOZsaSh");
  });
});

describe("language", () => {
  it("holds the interview in the language chosen at setup, with a per-call override for testing", async () => {
    const { body } = await call("POST", "/interviews", { ...input, language: "hi", voice_id: "x3gYeuNB0kLLYxOZsaSh" });
    eleven.reply(eleven.lastJob().id, JSON.stringify(plan));
    await call("GET", `/interviews/${body.id}`);
    expect((await call("GET", `/interviews/${body.id}/candidate`)).body.language).toBe("hi");
    const a = await call("POST", `/interviews/${body.id}/session`);
    expect(a.body.language).toBe("hi");
    expect(a.body.variables.interview_language).toMatch(/^Hindi/);
    expect(a.body.variables.interviewer_gender).toBe("male");
    const b = await call("POST", `/interviews/${body.id}/session`, { language: "en" });
    expect(b.body).toMatchObject({ language: "en", variables: { interview_language: "English" } });
  });
  it("defaults to English and ignores unknown languages", async () => {
    const { body } = await call("POST", "/interviews", { ...input, language: "fr" });
    expect((await d.store.get(body.id))!.input.language).toBeUndefined();
  });
});

describe("parseReply", () => {
  it("reads plain, fenced, prefixed and repeated JSON replies", () => {
    expect(parseReply('{"say":"Hi","action":null}')).toEqual({ say: "Hi", action: null, complete: true });
    expect(parseReply('```json\n{"say":"Hi {there}","action":{"type":"join"}}\n```')).toMatchObject({ say: "Hi {there}", action: { type: "join" } });
    expect(parseReply('Nice start.\n\n{"say":"Nice start. Link?","action":null}').say).toBe("Nice start. Link?");
    expect(parseReply('{"say":"one","action":null}\n{"say":"two","action":{"type":"ask_cv"}}')).toMatchObject({ say: "two", action: { type: "ask_cv" } });
  });
  it("never shows raw JSON to the candidate when the reply is broken", () => {
    expect(parseReply('Nice start.\n\n{"say": "Nice sta').say).toBe("Nice start.");
    expect(parseReply("Just prose.")).toEqual({ say: "Just prose.", action: null, complete: true });
    expect(parseReply('{"say": "cut off').say).not.toContain("{");
  });
});

describe("candidate chat", () => {
  const cv = "Meera Krishnan\nSDE-II at a payments gateway\nBuilt the refund retry flow in Java.";
  it("runs hi → join → CV → interview, creating the interview for the chosen role", async () => {
    const { body: chat } = await call("POST", "/chat", {});
    expect(chat.mode).toBe("self");
    const hi = await call("POST", `/chat/${chat.id}/message`, { text: "Hi" });
    expect(hi.body.reply.text).toMatch(/LinkedIn/);
    eleven.nextReply = '{"say":"Join us?","action":{"type":"join"}}';
    expect((await call("POST", `/chat/${chat.id}/message`, { text: "linkedin.com/in/meera" })).body.reply.action).toEqual({ type: "join" });
    eleven.nextReply = '```json\n{"say":"Setting up your call.","action":{"type":"start_interview","role_id":"sde2-backend-payments"}}\n```';
    const r = await call("POST", `/chat/${chat.id}/message`, { text: "x", cv_text: cv });
    expect(r.body.reply.action).toMatchObject({ type: "start_interview", role_title: "SDE-II, Backend (Payments)", company: "Northwind Pay" });
    const iv = await d.store.get(r.body.reply.action.interview_id);
    expect(iv!.input).toMatchObject({ candidate_name: "Meera Krishnan", minutes: 10, hard_bars: { compensation_budget: "Up to ₹42 lakh per year fixed" } });
    expect(eleven.chats[0].said.at(-1)).toContain("[cv uploaded]");
  });
  it("uses the matcher's ranking of the CV for the interview role and the role cards, over the agent's own picks", async () => {
    const { body: chat } = await call("POST", "/chat", {});
    const ranking = { profile: "Venture investor, 10 years", ranking: [
      { role_id: "growth-equity-vp", score: 78, why: "Growth investing at a fund" },
      { role_id: "vc-principal", score: 91, why: "Led Series A deals" },
      { role_id: "made-up", score: 99, why: "x" },
      { role_id: "head-new-ventures", score: 70, why: "Built ventures" },
      { role_id: "corp-dev-strategy", score: 66, why: "Deal experience" },
    ] };
    const original = eleven.chat.bind(eleven);
    eleven.chat = async (id, text) => (text.startsWith("<cv>") ? JSON.stringify(ranking) : original(id, text));
    eleven.nextReply = '{"say":"Setting up","action":{"type":"start_interview","role_id":"sde2-frontend"}}';
    const r = await call("POST", `/chat/${chat.id}/message`, { text: "x", cv_text: "Subhro Sengupta\nPrincipal at a venture fund. Led six Series A investments." });
    expect(r.body.reply.action.role_id).toBe("vc-principal");
    expect(eleven.chats.at(-2)!.said.at(-1)).toMatch(/\[role match[\s\S]*1\. vc-principal \| Principal, Venture Investments at Meridian Ventures \| fit 91\/100/);
    const state = await call("GET", `/chat/${chat.id}`);
    expect(state.body.match.ranking.map((x: any) => x.role_id)).toEqual(["vc-principal", "growth-equity-vp", "head-new-ventures", "corp-dev-strategy"]);
    eleven.nextReply = '{"say":"Roles","action":{"type":"roles","role_ids":["sre","ml-engineer"]}}';
    const first = await call("POST", `/chat/${chat.id}/message`, { text: "[call ended after 9 minutes]", kind: "event" });
    expect(first.body.reply.action.roles.map((x: any) => x.id)).toEqual(["vc-principal", "growth-equity-vp", "head-new-ventures"]);
    const more = await call("POST", `/chat/${chat.id}/message`, { text: "more roles?" });
    expect(more.body.reply.action.roles.map((x: any) => x.id)).toEqual(["corp-dev-strategy"]);
  });
  it("never shows more than three roles, and only real ones", async () => {
    const { body: chat } = await call("POST", "/chat", {});
    eleven.nextReply = JSON.stringify({ say: "Here you go", action: { type: "roles", role_ids: ["sre", "nope", "ml-engineer", "sde2-frontend", "product-designer", "sre"] } });
    const r = await call("POST", `/chat/${chat.id}/message`, { text: "show me roles" });
    expect(r.body.reply.action.roles.map((x: any) => x.id)).toEqual(["sre", "ml-engineer", "sde2-frontend"]);
    expect(JSON.stringify(r.body)).not.toMatch(/budget|Up to ₹/);
  });
  it("keeps an invited candidate on the invited role", async () => {
    const { body: chat } = await call("POST", "/chat", { invite: "northwind-sde2" });
    expect(chat).toMatchObject({ mode: "invite", invite: { role: { id: "sde2-backend-payments" } } });
    eleven.nextReply = '{"say":"ok","action":{"type":"start_interview","role_id":"product-designer"}}';
    const r = await call("POST", `/chat/${chat.id}/message`, { text: "x", cv_text: cv });
    expect(r.body.reply.action.role_id).toBe("sde2-backend-payments");
  });
  it("falls back to plain text when the agent does not reply in JSON, and reopens a dropped chat", async () => {
    const { body: chat } = await call("POST", "/chat", {});
    eleven.nextReply = "Sure, happy to help!";
    expect((await call("POST", `/chat/${chat.id}/message`, { text: "hello" })).body.reply).toMatchObject({ text: "Sure, happy to help!", action: null });
    const original = eleven.chat.bind(eleven);
    let failed = false;
    eleven.chat = async (id, text) => {
      if (!failed) {
        failed = true;
        throw new Error("conversation closed");
      }
      return original(id, text);
    };
    const r = await call("POST", `/chat/${chat.id}/message`, { text: "still there?" });
    expect(r.status).toBe(200);
    expect(eleven.chats.at(-1)!.said[0]).toContain("[conversation so far");
  });
  it("serves role details without the budget, records applications, and gives candidate-safe feedback", async () => {
    const role = await call("GET", "/roles/sde2-backend-payments");
    expect(role.body.title).toBe("SDE-II, Backend (Payments)");
    expect(JSON.stringify(role.body)).not.toMatch(/budget|competenc/);
    const { body: chat } = await call("POST", "/chat", {});
    expect((await call("POST", `/chat/${chat.id}/apply`, { role_id: "sre" })).body.applied).toEqual(["sre"]);
    const id = await toReady();
    await toScoring(id);
    eleven.reply(eleven.lastJob().id, JSON.stringify({ ...report, candidate_feedback: [{ title: "Lead with your part", advice: "Say I, not we.", resource: "Book X" }] }));
    const f = await call("GET", `/interviews/${id}/feedback`);
    expect(f.body).toMatchObject({ status: "done", first_name: "Asha", feedback: [{ title: "Lead with your part" }] });
    expect(JSON.stringify(f.body)).not.toMatch(/overall_score|hard_bars|18 LPA/);
  });
});

describe("a reply cut off mid-JSON", () => {
  it("is asked for again once, so the candidate cards are not lost", async () => {
    const { body: chat } = await call("POST", "/recruit", { recruiter: "Ananya" });
    const replies = [
      '{"say": "I prioritised deal experience. Subhro interviewed today", "action": {"type": "candidates", "picks": [{"id": "c-rhea", "why": "Closed four acq',
      JSON.stringify({ say: "Here are two.", action: { type: "candidates", picks: [{ id: "c-rhea", why: "Closed four deals" }, { id: "c-dev", why: "Ran two raises" }] } }),
    ];
    eleven.chat = async (id, text) => {
      eleven.chats.find((c) => c.id === id)!.said.push(text);
      return replies.shift()!;
    };
    const r = await call("POST", `/recruit/${chat.id}/message`, { text: "go" });
    expect(r.body.reply.text).toBe("Here are two.");
    expect(r.body.reply.action.candidates.map((c: any) => c.name)).toEqual(["Rhea Kapoor", "Dev Malhotra"]);
    expect(eleven.chats.at(-1)!.said.at(-1)).toMatch(/cut off/);
  });
});

describe("recruiter chat", () => {
  it("stores the job description, shows at most five real candidates with seven pointers each, and connects", async () => {
    const { body: chat } = await call("POST", "/recruit", { recruiter: "Ananya at Northwind Pay" });
    expect(chat.greeting).toMatch(/^Hi Ananya 👋 Welcome to FirstRound/);
    expect((await call("GET", `/recruit/${chat.id}`)).body.messages).toHaveLength(1);
    eleven.nextReply = JSON.stringify({ say: "JD ready", action: { type: "jd", jd: { title: "SDE-II", company: "Northwind Pay", location: "Bengaluru", salary: "₹32–42 LPA", experience: "3–6 years", summary: "s", responsibilities: ["a"], requirements: ["b"] } } });
    const j = await call("POST", `/recruit/${chat.id}/message`, { text: "hiring an SDE-II" });
    expect(j.body.reply.action).toMatchObject({ type: "jd", title: "SDE-II", url: `/jd?chat=${chat.id}` });
    // Only the first message carries the note about the greeting.
    expect(eleven.chats.at(-1)!.said[0]).toMatch(/^\[You have already greeted them with: "Hi Ananya/);
    expect((await call("GET", `/recruit/${chat.id}/jd`)).body.requirements).toEqual(["b"]);

    const picks = ["c-meera", "c-ghost", "c-sneha", "c-fatima", "c-arjun", "c-rahul", "c-divya", "c-meera"].map((id) => ({ id, why: "Built refunds herself" }));
    eleven.nextReply = JSON.stringify({ say: "Here are five", action: { type: "candidates", picks, learned: ["payments is a must"] } });
    const c = await call("POST", `/recruit/${chat.id}/message`, { text: "go" });
    expect(c.body.reply.action.candidates.map((x: any) => x.id)).toEqual(["c-meera", "c-sneha", "c-fatima", "c-arjun", "c-rahul"]);
    expect(c.body.reply.action).toMatchObject({ learned: ["payments is a must"], round: 1 });
    expect(JSON.stringify(c.body)).not.toMatch(/expects|₹38 LPA/);
    // The seven pointers are written on first open, topped up from the interview record, then kept.
    eleven.nextReply = JSON.stringify({ pointers: ["Five years in payments", "Designed refund retries"], notes: [{ section: "Background", points: ["Five years at a payments gateway"] }] });
    const fit = await call("GET", `/recruit/${chat.id}/fit/c-meera`);
    expect(fit.body.notes).toEqual([{ section: "Background", points: ["Five years at a payments gateway"] }]);
    expect(fit.body.pointers).toHaveLength(7);
    expect(fit.body.pointers.slice(0, 3)).toEqual(["Five years in payments", "Designed refund retries", "Built refunds herself"]);
    eleven.nextReply = "not json at all";
    expect((await call("GET", `/recruit/${chat.id}/fit/c-meera`)).body.pointers[0]).toBe("Five years in payments");
    const fallback = await call("GET", `/recruit/${chat.id}/fit/c-sneha`);
    expect(fallback.body.pointers).toHaveLength(7);
    expect(fallback.body.notes.map((n: any) => n.section)).toEqual(["Background", "What stood out", "To check", "Logistics"]);
    expect((await call("GET", `/recruit/${chat.id}/fit/c-tanvi`)).status).toBe(404);

    eleven.nextReply = JSON.stringify({ say: "Connecting you", action: { type: "connect", candidate_id: "c-meera", intro: "Meera, meet Ananya." } });
    const k = await call("POST", `/recruit/${chat.id}/message`, { text: "connect me with Meera" });
    expect(k.body.reply.action).toMatchObject({ type: "connect", candidate: { name: "Meera Krishnan" }, intro: "Meera, meet Ananya." });
  });
});

describe("instant interviews (the chat flow)", () => {
  const h = { "x-tool-secret": "s3cret" };
  it("can be called before the plan is written, with a quick brief that has no budget", async () => {
    const { body } = await call("POST", "/interviews", { ...input, instant: true });
    expect((await call("GET", `/interviews/${body.id}/candidate`)).body).toMatchObject({ status: "planning", can_call: true });
    const brief = (await call("GET", `/tool/brief?interview_id=${body.id}`, undefined, h)).body.brief;
    expect(brief).toContain("There is no prepared question list");
    expect(brief).toContain("Built the payments retry service at Finlo");
    expect(brief).not.toContain("18 LPA");
    expect((await call("POST", `/interviews/${body.id}/session`)).status).toBe(200);
  });
  it("picks up the written plan once it arrives, even after the call has started", async () => {
    const { body } = await call("POST", "/interviews", { ...input, instant: true });
    const job = eleven.lastJob().id;
    await call("POST", `/interviews/${body.id}/session`);
    eleven.reply(job, JSON.stringify(plan));
    const brief = (await call("GET", `/tool/brief?interview_id=${body.id}`, undefined, h)).body.brief;
    expect(brief).toContain("CV claims to probe");
    expect((await d.store.get(body.id))!.plan!.competencies).toHaveLength(2);
  });
  it("still scores a call when the plan never arrived", async () => {
    const { body } = await call("POST", "/interviews", { ...input, instant: true });
    await call("POST", `/interviews/${body.id}/session`);
    const conv = (await d.store.get(body.id))!.conversation_ids[0];
    eleven.convs.set(conv, { status: "done", turns, duration_secs: 300 });
    await call("POST", `/interviews/${body.id}/complete`);
    expect((await call("GET", `/interviews/${body.id}/feedback`)).body.status).toBe("scoring");
    expect(eleven.lastJob().agent).toBe("S");
    eleven.reply(eleven.lastJob().id, JSON.stringify(report));
    expect((await call("GET", `/interviews/${body.id}`)).body.status).toBe("done");
  });
  it("leaves manager-created interviews waiting for their plan", async () => {
    const { body } = await call("POST", "/interviews", input);
    expect((await call("GET", `/interviews/${body.id}/candidate`)).body.can_call).toBe(false);
    expect((await call("POST", `/interviews/${body.id}/session`)).status).toBe(409);
  });
});

describe("real interviews in the recruiter's pool", () => {
  it("adds a finished network-role interview as a candidate, with its real notes and a report link", async () => {
    const { body } = await call("POST", "/interviews", { ...input, role_title: "Principal, Venture Investments", candidate_name: "Subhro Sengupta" });
    eleven.reply(eleven.lastJob().id, JSON.stringify(plan));
    await call("GET", `/interviews/${body.id}`);
    await toScoring(body.id);
    eleven.reply(eleven.lastJob().id, JSON.stringify({ ...report, hard_bars: [], notes: [{ section: "Background", points: ["Ten years in venture"] }] }));
    expect((await call("GET", `/interviews/${body.id}`)).body.status).toBe("done");
    // A setup-page demo run (not a network role) must not appear.
    await toReady();

    const { body: chat } = await call("POST", "/recruit", { recruiter: "Ananya" });
    const live = (await d.store.getDoc<any>(chat.id)).live;
    expect(live.map((c: any) => c.name)).toEqual(["Subhro Sengupta"]);
    expect(live[0]).toMatchObject({ id: `live-${body.id}`, score: 8, interviewed_for: "Principal, Venture Investments" });
    eleven.nextReply = JSON.stringify({ say: "Here", action: { type: "candidates", picks: [{ id: `live-${body.id}`, why: "Interviewed today" }, { id: "c-kabir", why: "Growth investor" }] } });
    const c = await call("POST", `/recruit/${chat.id}/message`, { text: "go" });
    expect(c.body.reply.action.candidates.map((x: any) => x.name)).toEqual(["Subhro Sengupta", "Kabir Anand"]);
    eleven.nextReply = JSON.stringify({ pointers: ["Ten years investing"] });
    const fit = await call("GET", `/recruit/${chat.id}/fit/live-${body.id}`);
    expect(fit.body).toMatchObject({ real: true, report_url: `/report?id=${body.id}`, notes: [{ section: "Background", points: ["Ten years in venture"] }] });
  });
  it("tells the agent when someone finishes an interview mid-conversation", async () => {
    const { body: chat } = await call("POST", "/recruit", { recruiter: "Ananya" });
    const { body } = await call("POST", "/interviews", { ...input, role_title: "Vice President, Growth Equity", candidate_name: "New Person" });
    eleven.reply(eleven.lastJob().id, JSON.stringify(plan));
    await call("GET", `/interviews/${body.id}`);
    await toScoring(body.id);
    eleven.reply(eleven.lastJob().id, JSON.stringify(report));
    await call("GET", `/interviews/${body.id}`);
    eleven.nextReply = '{"say":"ok","action":null}';
    await call("POST", `/recruit/${chat.id}/message`, { text: "anyone new?" });
    expect(eleven.chats.at(-1)!.said.at(-1)).toMatch(/\[new candidates just finished[\s\S]*New Person[\s\S]*anyone new\?/);
  });
});

describe("tool routes", () => {
  it("reject a wrong or missing secret", async () => {
    const id = await toReady();
    expect((await call("GET", `/tool/brief?interview_id=${id}`)).status).toBe(401);
    expect((await call("GET", `/tool/brief?interview_id=${id}`, undefined, { "x-tool-secret": "nope" })).status).toBe(401);
  });
  it("return the brief with the right secret", async () => {
    const id = await toReady();
    const b = await call("GET", `/tool/brief?interview_id=${id}`, undefined, { "x-tool-secret": "s3cret" });
    expect(b.body.brief).toContain("CV claims to probe");
  });
  it("gives sensible guidance at each stage", () => {
    expect(timeGuidance(3, 30)).toMatch(/On track/);
    expect(timeGuidance(21, 30)).toMatch(/Finish competencies/);
    expect(timeGuidance(31, 30)).toMatch(/Time is up/);
    expect(timeUpdate(26, 30)).toMatch(/26 of 30 minutes used\. Wrap up/);
  });
});

describe("scoring", () => {
  it("scores the call, checks quotes and applies the hard-bar cap", async () => {
    const id = await toReady();
    expect((await toScoring(id)).body.status).toBe("scoring");
    expect(eleven.lastJob().agent).toBe("S");
    eleven.reply(eleven.lastJob().id, JSON.stringify(report));
    const r = await call("GET", `/interviews/${id}`);
    expect(r.body.status).toBe("done");
    expect(r.body.report.overall_score).toBe(4);
    expect(r.body.report.flag).toBe("red");
    expect(r.body.report.competencies[1]).toMatchObject({ score: null, insufficient_evidence: true });
    expect(r.body.turns).toHaveLength(4);
  });
  it("marks a call under two minutes as too short and lets the candidate start again", async () => {
    const id = await toReady();
    expect((await toScoring(id, 20)).body.status).toBe("too_short");
    expect((await call("POST", `/interviews/${id}/session`)).status).toBe(200);
  });
  it("scores the latest long-enough attempt", async () => {
    const id = await toReady();
    await toScoring(id, 20);
    const r = await toScoring(id, 900);
    expect(r.body.status).toBe("scoring");
    expect(r.body.attempts).toBe(2);
  });
  it("waits while ElevenLabs is still processing the call", async () => {
    const id = await toReady();
    await call("POST", `/interviews/${id}/session`);
    const conv = (await d.store.get(id))!.conversation_ids[0];
    eleven.convs.set(conv, { status: "processing", turns: [], duration_secs: 0 });
    await call("POST", `/interviews/${id}/complete`);
    expect((await call("GET", `/interviews/${id}`)).body.status).toBe("scoring");
    expect(eleven.started.filter((s) => s.agent === "S")).toHaveLength(0);
  });
  it("picks up a finished call even if the browser never reported it", async () => {
    const id = await toReady();
    await call("POST", `/interviews/${id}/session`);
    const conv = (await d.store.get(id))!.conversation_ids[0];
    eleven.convs.set(conv, { status: "done", turns, duration_secs: 700 });
    clock += 5 * 60_000;
    expect((await call("GET", `/interviews/${id}`)).body.status).toBe("scoring");
  });
  it("retries malformed Scorer output once, then fails", async () => {
    const id = await toReady();
    await toScoring(id);
    eleven.reply(eleven.lastJob().id, "no json");
    await call("GET", `/interviews/${id}`);
    eleven.reply(eleven.lastJob().id, "no json again");
    expect((await call("GET", `/interviews/${id}`)).body.status).toBe("score_failed");
  });
});
