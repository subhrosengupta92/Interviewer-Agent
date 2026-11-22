// The recruiter chat: brief → job description → five candidates → feedback loop → connect.
import { type PoolCandidate, candidateById } from "../data/candidates";
import { ROLES } from "../data/roles";
import type { Interview } from "../lib/types";
import { extractJson } from "../lib/json";
import type { Deps } from "./app";
import { resendIfCutOff } from "./chat";

export interface JobDescription {
  title: string;
  company: string;
  location: string;
  salary: string;
  experience: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
}

export interface NoteSection {
  section: string;
  points: string[];
}

export interface CandidateCard {
  id: string;
  name: string;
  headline: string;
  location: string;
  notice: string;
  score: number;
  top: string;
}

export type RecruitAction =
  | { type: "jd"; url: string; title: string; company: string }
  | { type: "candidates"; candidates: CandidateCard[]; learned: string[]; round: number }
  | { type: "connect"; candidate: CandidateCard; intro: string };

export interface RecruitMessage {
  from: "user" | "bot";
  text: string;
  kind?: "text" | "voice" | "event";
  action?: RecruitAction | null;
}

export interface RecruitChat {
  id: string;
  kind: "recruit";
  created_at: number;
  recruiter: string;
  conversation_id: string;
  messages: RecruitMessage[];
  jd: JobDescription | null;
  /** Seven pointers on why each candidate fits, written on demand and kept. */
  fits: Record<string, string[]>;
  /** Candidates shown so far, with the one-line reason given in the chat. */
  shown: Record<string, string>;
  /** People who did a real FirstRound interview recently, as pool candidates. Refreshed on every message. */
  live?: PoolCandidate[];
  /** Detailed first-round interview notes per candidate, written on demand and kept. */
  notes?: Record<string, NoteSection[]>;
  learned: string[];
  rounds: number;
}

const POINTERS = 7;
const MAX_CANDIDATES = 5;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

const card = (c: PoolCandidate, pointers: string[]): CandidateCard => ({
  id: c.id,
  name: c.name,
  headline: c.headline,
  location: c.location,
  notice: c.notice,
  score: c.score,
  top: pointers[0] ?? c.strengths[0],
});

const LIVE_PREFIX = "live-";
const firstSentence = (text: string, max = 170) => {
  const one = text.split(/(?<=[.!?])\s/)[0].trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
};

/** Turns a finished real interview into a pool candidate, using only what its report says. */
export function candidateFromInterview(iv: Interview): PoolCandidate | null {
  const r = iv.report;
  // Only interviews for network roles that involved a real call; the setup-page demo runs are left out.
  if (iv.status !== "done" || !r || !iv.conversation_ids.length || !ROLES.some((x) => x.title === iv.input.role_title)) return null;
  const scored = r.competencies.filter((c) => c.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const strengths = [
    ...scored.filter((c) => (c.score ?? 0) >= 3).map((c) => `${c.name}: ${firstSentence(c.rationale)}`),
    ...r.claims.filter((c) => c.verdict === "substantiated").map((c) => `Backed up in conversation: ${firstSentence(c.claim, 110)}`),
  ].slice(0, 4);
  const watch = [
    ...r.claims.filter((c) => c.verdict === "not_substantiated").map((c) => `Not backed up in conversation: ${firstSentence(c.claim, 110)}`),
    ...scored.filter((c) => (c.score ?? 0) <= 2).map((c) => `${c.name}: ${firstSentence(c.rationale)}`),
    ...r.hard_bars.filter((h) => h.status === "not_met").map((h) => `${h.label}: ${firstSentence(h.note)}`),
  ].slice(0, 3);
  return {
    id: `${LIVE_PREFIX}${iv.id}`,
    name: iv.input.candidate_name,
    headline: `Interviewed today for ${iv.input.role_title}`,
    years: 0,
    location: "",
    notice: "",
    expects: "",
    skills: scored.filter((c) => (c.score ?? 0) >= 4).map((c) => c.name),
    score: r.overall_score,
    interviewed_for: iv.input.role_title,
    strengths: strengths.length ? strengths : [firstSentence(r.summary)],
    watch,
  };
}

/** Recent real interviews as candidates, newest first, one per person. */
async function livePool(d: Deps): Promise<PoolCandidate[]> {
  const seen = new Set<string>();
  const out: PoolCandidate[] = [];
  for (const iv of await d.store.recentInterviews(40).catch(() => [])) {
    const c = candidateFromInterview(iv);
    const key = c?.name.toLowerCase();
    if (!c || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.slice(0, 6);
}

const poolLine = (c: PoolCandidate) =>
  `- ${c.id} | ${c.name} | ${c.headline} | first round ${c.score}/10 for ${c.interviewed_for} | strong on: ${c.skills.join(", ") || "see strengths"}\n  strengths: ${c.strengths.join("; ")}\n  watch: ${c.watch.join("; ") || "nothing flagged"}`;

const find = (chat: RecruitChat, id: unknown) => chat.live?.find((c) => c.id === id) ?? candidateById(id);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function say(d: Deps, chat: RecruitChat, text: string) {
  let raw: string;
  try {
    raw = await d.eleven.chat(chat.conversation_id, text);
  } catch {
    chat.conversation_id = await d.eleven.openChat(d.agents.recruiter, {
      recruiter: chat.recruiter,
      live_pool: (chat.live ?? []).map(poolLine).join("\n") || "(none yet)",
    });
    const history = chat.messages
      .slice(-30)
      .map((m) => `${m.from === "bot" ? "YOU" : "RECRUITER"}: ${m.text.slice(0, 600)}`)
      .join("\n");
    raw = await d.eleven.chat(chat.conversation_id, `[conversation so far, for your memory]\n${history}\n[end]\n\n${text}`);
  }
  return resendIfCutOff(d, chat.conversation_id, raw);
}

function realise(chat: RecruitChat, action: Record<string, unknown> | null): RecruitAction | null {
  if (!action) return null;
  if (action.type === "jd") {
    const j = (action.jd ?? {}) as Record<string, unknown>;
    const jd: JobDescription = {
      title: str(j.title),
      company: str(j.company),
      location: str(j.location),
      salary: str(j.salary),
      experience: str(j.experience),
      summary: str(j.summary),
      responsibilities: strs(j.responsibilities),
      requirements: strs(j.requirements),
    };
    if (!jd.title) return null;
    chat.jd = jd;
    return { type: "jd", url: `/jd?chat=${chat.id}`, title: jd.title, company: jd.company };
  }
  if (action.type === "candidates") {
    const picks = (Array.isArray(action.picks) ? action.picks : []) as Record<string, unknown>[];
    const candidates: CandidateCard[] = [];
    for (const p of picks) {
      const c = find(chat, p.id);
      if (!c || candidates.some((x) => x.id === c.id)) continue;
      // The seven-pointer document is written separately (see fitPointers); a new set of picks resets it.
      const why = str(p.why);
      delete chat.fits[c.id];
      chat.shown[c.id] = why;
      const pointers = why ? [why] : [];
      candidates.push(card(c, pointers));
      if (candidates.length === MAX_CANDIDATES) break;
    }
    if (!candidates.length) return null;
    const learned = strs(action.learned);
    if (learned.length) chat.learned = learned;
    chat.rounds += 1;
    return { type: "candidates", candidates, learned: chat.learned, round: chat.rounds };
  }
  if (action.type === "connect") {
    const c = find(chat, action.candidate_id);
    if (!c) return null;
    return { type: "connect", candidate: card(c, chat.fits[c.id] ?? []), intro: str(action.intro) || `Introducing you both: ${c.name}, meet ${chat.recruiter}.` };
  }
  return null;
}

/** Seven pointers on why this candidate fits this role, written by the fit agent; falls back to the interview record. */
async function fitPointers(d: Deps, chat: RecruitChat, c: PoolCandidate): Promise<string[]> {
  const fallback = [
    ...(chat.shown[c.id] ? [chat.shown[c.id]] : []),
    ...c.strengths,
    ...c.watch.map((w) => `To check: ${w}`),
    `${c.years} years of experience; currently ${c.headline}`,
    `Works with ${c.skills.slice(0, 4).join(", ")}`,
    `Based in ${c.location}; notice period ${c.notice}`,
  ];
  try {
    const conversation = await d.eleven.openChat(d.agents.fit, {});
    const raw = await d.eleven.chat(
      conversation,
      [
        `Job description:\n${JSON.stringify(chat.jd ?? {})}`,
        `What the hiring manager has said they want:\n${chat.learned.map((l) => `- ${l}`).join("\n") || "- nothing beyond the job description"}`,
        `Candidate record:\n${JSON.stringify(c)}`,
      ].join("\n\n"),
    );
    const written = strs(extractJson<{ pointers?: unknown }>(raw).pointers);
    return [...written, ...fallback].slice(0, POINTERS);
  } catch {
    return fallback.slice(0, POINTERS);
  }
}

/** The notes from a real interview's report. */
async function realNotes(d: Deps, c: PoolCandidate): Promise<NoteSection[]> {
  const iv = await d.store.get(c.id.slice(LIVE_PREFIX.length));
  const notes = (iv?.report?.notes ?? []).filter((n) => n.points.length);
  return notes.length ? notes : [{ section: "Summary", points: [iv?.report?.summary ?? "No notes were recorded."] }];
}

/** Detailed notes from the candidate's first round; falls back to the bare record if the writer fails. */
async function interviewNotes(d: Deps, c: PoolCandidate): Promise<NoteSection[]> {
  const fallback: NoteSection[] = [
    { section: "Background", points: [`${c.headline}; ${c.years} years of experience`, `Works with ${c.skills.join(", ")}`] },
    { section: "What stood out", points: c.strengths },
    { section: "To check", points: c.watch },
    { section: "Logistics", points: [`Based in ${c.location}`, `Notice period ${c.notice}`] },
  ];
  try {
    const conversation = await d.eleven.openChat(d.agents.notes, {});
    const raw = await d.eleven.chat(conversation, `Candidate record:\n${JSON.stringify(c)}`);
    const sections = (extractJson<{ notes?: unknown }>(raw).notes as unknown[] | undefined) ?? [];
    const notes = (Array.isArray(sections) ? sections : [])
      .map((n) => n as Record<string, unknown>)
      .map((n) => ({ section: str(n.section), points: strs(n.points) }))
      .filter((n) => n.section && n.points.length);
    return notes.length ? notes : fallback;
  } catch {
    return fallback;
  }
}

export async function handleRecruit(request: Request, parts: string[], d: Deps): Promise<Response> {
  const method = request.method;

  if (parts.length === 1 && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { recruiter?: string };
    const recruiter = str(body.recruiter).slice(0, 120) || "a hiring manager";
    const live = await livePool(d);
    // FirstRound speaks first, so the screen never opens empty.
    const first = recruiter.split(/\s+/)[0];
    const greeting = `Hi${recruiter === "a hiring manager" ? " there" : ` ${first}`} 👋 Welcome to FirstRound. Who are you hiring? Tell me the role, or send a voice note.`;
    const chat: RecruitChat = {
      id: `recruit_${d.newId()}`,
      kind: "recruit",
      created_at: d.now(),
      recruiter,
      live,
      conversation_id: await d.eleven.openChat(d.agents.recruiter, { recruiter, live_pool: live.map(poolLine).join("\n") || "(none yet)" }),
      messages: [{ from: "bot", text: greeting, action: null }],
      jd: null,
      fits: {},
      shown: {},
      learned: [],
      rounds: 0,
    };
    await d.store.putDoc(chat.id, chat);
    return json({ id: chat.id, greeting }, 201);
  }

  const chat = await d.store.getDoc<RecruitChat>(parts[1] ?? "");
  if (!chat || chat.kind !== "recruit") return json({ error: "Chat not found" }, 404);

  if (parts.length === 2 && method === "GET") return json({ id: chat.id, recruiter: chat.recruiter, messages: chat.messages });

  // Documents that open in a new tab
  if (parts[2] === "jd" && method === "GET") return chat.jd ? json(chat.jd) : json({ error: "No job description yet" }, 404);
  if (parts[2] === "fit" && method === "GET") {
    const c = find(chat, parts[3]);
    if (!c || !(c.id in chat.shown)) return json({ error: "Candidate not found" }, 404);
    chat.notes ??= {};
    if (!chat.fits[c.id] || !chat.notes[c.id]) {
      // Both documents are written at the same time, so the page opens in one wait.
      const [pointers, notes] = await Promise.all([
        chat.fits[c.id] ?? fitPointers(d, chat, c),
        chat.notes[c.id] ?? (c.id.startsWith(LIVE_PREFIX) ? realNotes(d, c) : interviewNotes(d, c)),
      ]);
      // Several pages may be written at once; re-read so one save does not undo another.
      const fresh = (await d.store.getDoc<RecruitChat>(chat.id)) ?? chat;
      fresh.fits[c.id] = chat.fits[c.id] = pointers;
      fresh.notes = { ...(fresh.notes ?? {}), [c.id]: notes };
      chat.notes[c.id] = notes;
      await d.store.putDoc(chat.id, fresh);
    }
    return json({
      role: chat.jd ? `${chat.jd.title}${chat.jd.company ? ` · ${chat.jd.company}` : ""}` : "",
      candidate: { name: c.name, headline: c.headline, years: c.years, location: c.location, notice: c.notice, score: c.score, interviewed_for: c.interviewed_for, skills: c.skills },
      pointers: chat.fits[c.id],
      notes: chat.notes[c.id],
      // Real interviews have a full report behind them.
      report_url: c.id.startsWith(LIVE_PREFIX) ? `/report?id=${c.id.slice(LIVE_PREFIX.length)}` : null,
      real: c.id.startsWith(LIVE_PREFIX),
    });
  }

  if (parts[2] === "message" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { text?: string; kind?: string; file_text?: string };
    let text = str(body.text).slice(0, 4000);
    const kind = body.kind === "voice" || body.kind === "event" ? body.kind : "text";
    const file = str(body.file_text).slice(0, 12_000);
    if (file) text = `[job description uploaded]\n${file}`;
    if (!text) return json({ error: "Say something first." }, 400);
    chat.messages.push({ from: "user", text: file ? "[job description uploaded]" : text, kind: file ? "event" : kind });
    // The agent did not write the opening greeting, so tell it once what was already said.
    if (!chat.messages.some((m) => m.from === "user" && m !== chat.messages.at(-1)))
      text = `[You have already greeted them with: "${chat.messages[0]?.text ?? ""}" Do not greet again; respond to what they say.]\n\n${text}`;
    // Anyone who finished a real interview since the last message joins the pool, and the agent is told.
    const known = new Set((chat.live ?? []).map((c) => c.id));
    const arrivals = (await livePool(d)).filter((c) => !known.has(c.id));
    if (arrivals.length) {
      chat.live = [...arrivals, ...(chat.live ?? [])];
      text = `[new candidates just finished a real FirstRound interview and are now in the pool under "Interviewed today"]\n${arrivals.map(poolLine).join("\n")}\n\n${text}`;
    }
    const reply = await say(d, chat, text);
    const message: RecruitMessage = { from: "bot", text: reply.say, action: realise(chat, reply.action) };
    chat.messages.push(message);
    await d.store.putDoc(chat.id, chat);
    return json({ reply: message });
  }

  return json({ error: "Not found" }, 404);
}
