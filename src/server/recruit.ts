// The recruiter chat: brief → job description → five candidates → feedback loop → connect.
import { type PoolCandidate, candidateById } from "../data/candidates";
import { extractJson } from "../lib/json";
import type { Deps } from "./app";
import { parseReply } from "./chat";

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
    chat.conversation_id = await d.eleven.openChat(d.agents.recruiter, { recruiter: chat.recruiter });
    const history = chat.messages
      .slice(-30)
      .map((m) => `${m.from === "bot" ? "YOU" : "RECRUITER"}: ${m.text.slice(0, 600)}`)
      .join("\n");
    raw = await d.eleven.chat(chat.conversation_id, `[conversation so far, for your memory]\n${history}\n[end]\n\n${text}`);
  }
  return parseReply(raw);
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
      const c = candidateById(p.id);
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
    const c = candidateById(action.candidate_id);
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
    const chat: RecruitChat = {
      id: `recruit_${d.newId()}`,
      kind: "recruit",
      created_at: d.now(),
      recruiter,
      conversation_id: await d.eleven.openChat(d.agents.recruiter, { recruiter }),
      messages: [],
      jd: null,
      fits: {},
      shown: {},
      learned: [],
      rounds: 0,
    };
    await d.store.putDoc(chat.id, chat);
    return json({ id: chat.id }, 201);
  }

  const chat = await d.store.getDoc<RecruitChat>(parts[1] ?? "");
  if (!chat || chat.kind !== "recruit") return json({ error: "Chat not found" }, 404);

  if (parts.length === 2 && method === "GET") return json({ id: chat.id, recruiter: chat.recruiter, messages: chat.messages });

  // Documents that open in a new tab
  if (parts[2] === "jd" && method === "GET") return chat.jd ? json(chat.jd) : json({ error: "No job description yet" }, 404);
  if (parts[2] === "fit" && method === "GET") {
    const c = candidateById(parts[3]);
    if (!c || !(c.id in chat.shown)) return json({ error: "Candidate not found" }, 404);
    chat.notes ??= {};
    if (!chat.fits[c.id] || !chat.notes[c.id]) {
      // Both documents are written at the same time, so the page opens in one wait.
      const [pointers, notes] = await Promise.all([
        chat.fits[c.id] ?? fitPointers(d, chat, c),
        chat.notes[c.id] ?? interviewNotes(d, c),
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
    const reply = await say(d, chat, text);
    const message: RecruitMessage = { from: "bot", text: reply.say, action: realise(chat, reply.action) };
    chat.messages.push(message);
    await d.store.putDoc(chat.id, chat);
    return json({ reply: message });
  }

  return json({ error: "Not found" }, 404);
}
