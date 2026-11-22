/** Talks to the recruiter chat agent in text, start to finish. Needs ELEVENLABS_API_KEY. */
import ids from "../agents/ids.json";
import { ElevenClient } from "../src/lib/eleven";
import { MemoryStore } from "../src/lib/store";
import { handleApi } from "../src/server/app";

const deps = { store: new MemoryStore(), eleven: new ElevenClient(process.env.ELEVENLABS_API_KEY ?? ""), agents: ids, toolSecret: "", now: () => Date.now(), newId: () => crypto.randomUUID().replace(/-/g, "") };
if (process.env.DEBUG) {
  const chat = deps.eleven.chat.bind(deps.eleven);
  deps.eleven.chat = async (id, text) => {
    const raw = await chat(id, text);
    console.log(`    RAW (${raw.length}): ${raw.slice(0, 160)} … ${raw.slice(-260)}`);
    return raw;
  };
}
const call = async (method: string, path: string, body?: unknown) =>
  (await (await handleApi(new Request(`https://local/api${path}`, { method, body: body ? JSON.stringify(body) : undefined }), deps)).json()) as any;

const chat = await call("POST", "/recruit", { recruiter: "Ananya Rao, Engineering Manager at Northwind Pay" });
const steps = [
  "Hi, I'm hiring an SDE-II for our payments backend team",
  "No JD yet, can you write one?",
  "32 to 42 lakhs",
  "Bengaluru, hybrid 3 days a week",
  "3 to 6 years. Must haves are Java or Go, strong on distributed systems, and they should have debugged production issues themselves",
  "We need someone within 45 days ideally. Team is 8 engineers owning refunds and reconciliation",
  "go",
  "Not quite. I really need people who have worked on payments or money movement before, and I can't wait more than 30 days notice.",
  "Better. Connect me with the first one",
];
for (const text of steps) {
  const t = Date.now();
  const r = await call("POST", `/recruit/${chat.id}/message`, { text });
  const a = r.reply?.action;
  console.log(`\n> ${text.slice(0, 80)}\n  (${((Date.now() - t) / 1000).toFixed(1)}s) ${r.reply?.text ?? JSON.stringify(r)}`);
  if (a?.type === "jd") console.log("  ACTION jd:", a.title, "|", a.company);
  if (a?.type === "candidates") console.log(`  ACTION candidates (round ${a.round}):`, a.candidates.map((c: any) => `${c.name} [${c.notice}]`).join(" | "), "\n  learned:", a.learned);
  if (a?.type === "connect") console.log("  ACTION connect:", a.candidate.name, "|", a.intro);
}
const t1 = Date.now(); const fit = await call("GET", `/recruit/${chat.id}/fit/c-meera`); console.log(`fit doc written in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
console.log("\nFIT DOC for Meera:", fit.role, "\n -", (fit.pointers ?? []).join("\n - "));
