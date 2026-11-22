/** Talks to the candidate chat agent in text, start to finish, to check the flow. Needs ELEVENLABS_API_KEY. */
import ids from "../agents/ids.json";
import { ElevenClient } from "../src/lib/eleven";
import { MemoryStore } from "../src/lib/store";
import { handleApi } from "../src/server/app";

const invite = process.argv[2];
const deps = {
  store: new MemoryStore(),
  eleven: new ElevenClient(process.env.ELEVENLABS_API_KEY ?? ""),
  agents: ids,
  toolSecret: "",
  now: () => Date.now(),
  newId: () => crypto.randomUUID().replace(/-/g, ""),
};
const call = async (method: string, path: string, body?: unknown) =>
  (await (await handleApi(new Request(`https://local/api${path}`, { method, body: body ? JSON.stringify(body) : undefined }), deps)).json()) as any;

const cv = `MEERA KRISHNAN
Bengaluru · meera@example.com
SDE-II, PaySwift (payments gateway), 2021–present
- Designed and built the refund retry flow in Java with idempotency keys; duplicate refunds went to zero
- On-call for settlement; led the fix for a reconciliation break affecting 40,000 transactions
- Mentor to two SDE-Is
Software Engineer, Cartly, 2019–2021: order service in Spring Boot and PostgreSQL
B.Tech Computer Science, NIT Trichy, 2019`;

const chat = await call("POST", "/chat", invite ? { invite } : {});
console.log("chat", chat.mode, chat.invite?.role?.title ?? "");
const steps: [string, Record<string, unknown>][] = [
  ["Hi", {}],
  ["sure, it's linkedin.com/in/meera-krishnan", {}],
  ["[joined network]", { kind: "event" }],
  ["cv", { cv_text: cv }],
  ["quick q before the call, what's the notice period policy at this company? and is this salary negotiable?", {}],
  ["[call ended after 9 minutes]", { kind: "event" }],
  ["[feedback ready]", { kind: "event" }],
  ["can I see some other roles?", {}],
  ["[applied to SDE-II, Backend (Payments) at Northwind Pay]", { kind: "event" }],
  ["how was I scored? and am I talking to a bot?", {}],
];
for (const [text, extra] of steps) {
  const t = Date.now();
  const r = await call("POST", `/chat/${chat.id}/message`, { text, ...extra });
  const a = r.reply?.action;
  console.log(`\n> ${text.slice(0, 70)}\n  (${((Date.now() - t) / 1000).toFixed(1)}s) ${r.reply?.text ?? JSON.stringify(r)}`);
  if (a) console.log("  ACTION:", a.type, a.type === "roles" ? a.roles.map((x: any) => x.title).join(" | ") : a.role_title ?? a.url ?? "");
}
