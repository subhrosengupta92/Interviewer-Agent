import { beforeEach, describe, expect, it } from "vitest";
import type { ConversationSnapshot, Eleven } from "../src/lib/eleven";
import { interviewerBrief, plannerMessage, scorerMessage } from "../src/lib/prompts";
import { MemoryStore } from "../src/lib/store";
import type { Plan } from "../src/lib/types";
import { type Deps, handleApi } from "../src/server/app";
import { timeGuidance, timeUpdate } from "../src/lib/time";
import { input, report, turns } from "./fixtures";

const plan: Plan = {
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
    agents: { planner: "P", interviewer: "I", scorer: "S" },
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
    expect(s.body.variables).toEqual({ interview_id: id, candidate_first_name: "Asha", role_title: "SDE 1", minutes: 30 });
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
  it("refuse a session before the plan is ready and after the report is done", async () => {
    const { body } = await call("POST", "/interviews", input);
    expect((await call("POST", `/interviews/${body.id}/session`)).status).toBe(409);
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
    expect((await toScoring(id, 45)).body.status).toBe("too_short");
    expect((await call("POST", `/interviews/${id}/session`)).status).toBe(200);
  });
  it("scores the latest long-enough attempt", async () => {
    const id = await toReady();
    await toScoring(id, 45);
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
