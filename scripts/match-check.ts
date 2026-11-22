/** Scores the open roles against sample CVs with the live matcher. Needs ELEVENLABS_API_KEY. */
import ids from "../agents/ids.json";
import { roleById } from "../src/data/roles";
import { ElevenClient } from "../src/lib/eleven";
import { MemoryStore } from "../src/lib/store";
import { matchRoles } from "../src/server/chat";

const d = { store: new MemoryStore(), eleven: new ElevenClient(process.env.ELEVENLABS_API_KEY ?? ""), agents: ids, toolSecret: "", now: () => Date.now(), newId: () => "x" };
const cvs: Record<string, string> = {
  "venture investor": `SUBHRO SENGUPTA\nPrincipal, Avataar Venture Partners (2019–2025): led and co-led growth-stage investments in B2B SaaS including ElasticRun; board observer on four companies; built the fund's SaaS thesis; ran diligence, valuation and investment committee memos. Co-created new SaaS verticals with portfolio founders.\nAssociate, investment banking, Kotak (2014–2017): M&A and private placements in technology.\nMBA, IIM Calcutta. CFA Level 3.`,
  "backend engineer": `MEERA KRISHNAN\nSDE-II, PaySwift payments gateway (2021–present): designed the refund retry flow in Java with idempotency keys; on-call for settlement.\nSoftware Engineer, Cartly (2019–2021): order service in Spring Boot and PostgreSQL.\nB.Tech Computer Science, NIT Trichy, 2019.`,
  "performance marketer": `TANVI DESHPANDE\nPerformance Marketing Lead, Glow D2C (2020–present): ran ₹2 crore a month on Meta and Google; built creative testing; measured incrementality with geo holdouts.\nB.Com, Mumbai University.`,
};
for (const [label, cv] of Object.entries(cvs)) {
  const t = Date.now();
  const m = await matchRoles(d, cv);
  console.log(`\n${label} (${((Date.now() - t) / 1000).toFixed(1)}s) — ${m.profile}`);
  for (const r of m.ranking) console.log(`  ${String(r.score).padStart(3)}  ${roleById(r.role_id)!.title.padEnd(44)} ${r.why}`);
}
