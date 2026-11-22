// The recruiter chat: brief → job description → five candidates → feedback loop → connect.
import { type PoolCandidate, candidateById } from "../data/candidates";
import { type Role, ROLES } from "../data/roles";
import type { Competency, Interview } from "../lib/types";
import { DISCOVERY_VOICE } from "../../agents/discovery";
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
  /** What the first-round interviewer tests for this role. Written with the job description. */
  competencies?: Competency[];
}

/** A public link to one job description. Candidates open it; it never reveals the recruiter's chat. */
export interface JdLink {
  id: string;
  kind: "jdlink";
  recruit: string;
}

export interface RoomCandidate {
  id: string;
  name: string;
  headline: string;
  /** "link": did their first round from the shared job description. "network": already on FirstRound. */
  source: "link" | "network";
  status: "interviewing" | "scoring" | "done" | "incomplete";
  score: number | null;
  strong: string[];
  check: string[];
  location: string;
  notice: string;
  /** The fit page (network) or the full report (link), once there is one. */
  url: string | null;
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
  /** Discovery calls: the voice conversations started from this chat, and the ones already written up. */
  calls?: string[];
  calls_done?: string[];
  /** The public link to this chat's job description. */
  share_id?: string;
  /** Interviews started from that link, newest last. */
  applicants?: string[];
  /** The "ask the notes" conversation on the role screen. */
  room?: { conversation_id: string; told: string; messages: { from: "user" | "bot"; text: string }[] };
}

/** A discovery call needs at least this much said by the recruiter to be worth writing up. */
const MIN_DISCOVERY_SECS = 20;

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
  // Only interviews for network roles; the setup-page demo runs and company-specific roles are left out.
  return ROLES.some((x) => x.title === iv.input.role_title) ? fromReport(iv) : null;
}

/** Any finished interview with a real call behind it, as a candidate record. */
function fromReport(iv: Interview): PoolCandidate | null {
  const r = iv.report;
  if (iv.status !== "done" || !r || !iv.conversation_ids.length) return null;
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
    const competencies = (Array.isArray(j.competencies) ? j.competencies : [])
      .map((c) => c as Record<string, unknown>)
      .map((c) => ({ name: str(c.name).slice(0, 60), kind: c.kind === "behavioural" ? ("behavioural" as const) : ("functional" as const), definition: str(c.definition).slice(0, 300) }))
      .filter((c, i, all) => c.name && all.findIndex((x) => x.name.toLowerCase() === c.name.toLowerCase()) === i)
      .slice(0, 6);
    if (competencies.length) jd.competencies = competencies;
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

/** What a first round tests when the job description came without its own list. */
const fallbackCompetencies = (jd: JobDescription): Competency[] => [
  { name: "Core skills for the role", kind: "functional", definition: jd.requirements.slice(0, 3).join("; ") || `What a ${jd.title} must be able to do.` },
  { name: "Depth in their own work", kind: "functional", definition: "Explains their main work precisely: how it worked, the decisions they made and why, and the numbers behind it." },
  { name: "Ownership", kind: "behavioural", definition: "Is exact about their own part in team work and follows things through to an outcome." },
  { name: "Communication", kind: "behavioural", definition: "Answers the question asked, clearly and briefly, and stays structured under follow-up." },
];

/** Gives a chat's job description its public link the first time there is one to share. */
async function ensureShare(d: Deps, chat: RecruitChat) {
  if (!chat.jd || chat.share_id) return;
  chat.share_id = `jd_${d.newId()}`;
  const link: JdLink = { id: chat.share_id, kind: "jdlink", recruit: chat.id };
  await d.store.putDoc(link.id, link);
}

const publicJd = ({ competencies: _c, ...jd }: JobDescription) => jd;
const company = (chat: RecruitChat) => chat.jd?.company || chat.recruiter.split(/\s+at\s+/)[1] || "";

/** The role a shared job description stands for, as a candidate chat needs it. Null if the link is unknown. */
export async function roleFromShare(d: Deps, shareId: unknown): Promise<{ role: Role; recruit_id: string; invited_by: string } | null> {
  if (typeof shareId !== "string" || !/^jd_[a-z0-9]+$/i.test(shareId)) return null;
  const link = await d.store.getDoc<JdLink>(shareId);
  const chat = link?.kind === "jdlink" ? await d.store.getDoc<RecruitChat>(link.recruit) : null;
  const jd = chat?.jd;
  if (!chat || !jd) return null;
  return {
    recruit_id: chat.id,
    invited_by: chat.recruiter === "a hiring manager" ? `the hiring team${jd.company ? ` at ${jd.company}` : ""}` : chat.recruiter,
    role: {
      id: shareId,
      title: jd.title,
      company: company(chat) || "the hiring company",
      about: "",
      location: jd.location,
      salary: jd.salary,
      // The range in the job description is the only budget we were given.
      budget: jd.salary,
      experience: jd.experience,
      summary: jd.summary,
      responsibilities: jd.responsibilities,
      requirements: jd.requirements,
      competencies: jd.competencies?.length ? jd.competencies : fallbackCompetencies(jd),
      tags: [],
    },
  };
}

/** Records that an interview was started from a chat's shared job description. */
export async function addApplicant(d: Deps, recruitId: string, interviewId: string) {
  const chat = await d.store.getDoc<RecruitChat>(recruitId);
  if (!chat || chat.kind !== "recruit" || chat.applicants?.includes(interviewId)) return;
  chat.applicants = [...(chat.applicants ?? []), interviewId];
  await d.store.putDoc(chat.id, chat);
}

/** GET /api/jd/:share — the job description as candidates see it. */
export async function handleJd(request: Request, parts: string[], d: Deps): Promise<Response> {
  const found = request.method === "GET" ? await roleFromShare(d, parts[1]) : null;
  const chat = found ? await d.store.getDoc<RecruitChat>(found.recruit_id) : null;
  return chat?.jd ? json({ ...publicJd(chat.jd), share_id: chat.share_id }) : json({ error: "This job description is no longer available." }, 404);
}

// ---------- the role screen: everyone interviewed for this role, and questions over their notes

interface RoomEntry {
  card: RoomCandidate;
  /** Everything known about the candidate, for the agent that answers questions. Empty until their interview is scored. */
  brief: string;
}

const noteLines = (notes: NoteSection[] | undefined) => (notes ?? []).map((n) => `  ${n.section}: ${n.points.join(" | ")}`).join("\n");

async function roomEntries(d: Deps, chat: RecruitChat, advance: (iv: Interview) => Promise<boolean>): Promise<RoomEntry[]> {
  const out: RoomEntry[] = [];
  // People who did their first round from the shared job description, newest first.
  for (const id of [...(chat.applicants ?? [])].reverse()) {
    const iv = await d.store.get(id);
    if (!iv) continue;
    if (await advance(iv).catch(() => false)) await d.store.put(iv);
    const c = fromReport(iv);
    const r = iv.report;
    const waiting = ["planning", "ready", "in_progress"].includes(iv.status);
    // Someone who opened the link but has not been on a call yet is not a candidate.
    if (waiting && !iv.conversation_ids.length) continue;
    const card: RoomCandidate = {
      id: `${LIVE_PREFIX}${iv.id}`,
      name: iv.input.candidate_name === "Candidate" ? "Candidate (no name given)" : iv.input.candidate_name,
      headline: c ? `Interviewed for this role` : waiting ? "On their first-round call" : iv.status === "scoring" ? "Interview finished, notes being written" : "Call ended too early to assess",
      source: "link",
      status: c ? "done" : waiting ? "interviewing" : iv.status === "scoring" ? "scoring" : "incomplete",
      score: c?.score ?? null,
      strong: c ? (c.skills.length ? c.skills : c.strengths.map((x) => x.split(":")[0])).slice(0, 4) : [],
      check: c ? c.watch.map((x) => firstSentence(x, 90)).slice(0, 2) : [],
      location: "",
      notice: "",
      url: c ? `/report?id=${iv.id}` : null,
    };
    const brief =
      c && r
        ? [
            `## ${card.name} (id ${card.id}) | did their first round from the shared job description | overall ${r.overall_score}/10`,
            `Summary: ${r.summary}`,
            `Areas tested (score out of 5):\n${r.competencies.map((x) => `  ${x.name}: ${x.score ?? "not enough evidence"}. ${x.rationale}`).join("\n")}`,
            r.claims.length ? `CV claims checked:\n${r.claims.map((x) => `  ${x.claim}: ${x.verdict.replace(/_/g, " ")}. ${x.note}`).join("\n")}` : "",
            r.hard_bars.length ? `Practical points:\n${r.hard_bars.map((x) => `  ${x.label}: ${x.status.replace(/_/g, " ")}. ${x.note}`).join("\n")}` : "",
            `Interview notes:\n${noteLines(r.notes)}`,
          ]
            .filter(Boolean)
            .join("\n")
        : "";
    out.push({ card, brief });
  }
  // People from the FirstRound network that this chat has shown for the role.
  for (const id of Object.keys(chat.shown)) {
    const c = find(chat, id);
    if (!c || out.some((e) => e.card.id === c.id)) continue;
    const card: RoomCandidate = {
      id: c.id,
      name: c.name,
      headline: c.headline,
      source: "network",
      status: "done",
      score: c.score,
      strong: (c.skills.length ? c.skills : c.strengths.map((x) => x.split(":")[0])).slice(0, 4),
      check: c.watch.map((x) => firstSentence(x, 90)).slice(0, 2),
      location: c.location,
      notice: c.notice,
      url: `/fit?chat=${chat.id}&c=${encodeURIComponent(c.id)}`,
    };
    const brief = [
      `## ${c.name} (id ${c.id}) | from the FirstRound network | overall ${c.score}/10 in a first round for ${c.interviewed_for}`,
      `Profile: ${c.headline}${c.years ? `; ${c.years} years` : ""}${c.location ? `; based in ${c.location}` : ""}${c.notice ? `; notice ${c.notice}` : ""}${c.expects ? `; expects ${c.expects}` : ""}`,
      `Strong on: ${c.skills.join(", ") || "see below"}`,
      `What stood out:\n${c.strengths.map((x) => `  ${x}`).join("\n")}`,
      `To check:\n${c.watch.map((x) => `  ${x}`).join("\n") || "  nothing flagged"}`,
      chat.shown[c.id] ? `Why shown for this role: ${chat.shown[c.id]}` : "",
      chat.notes?.[c.id] ? `Interview notes:\n${noteLines(chat.notes[c.id])}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    out.push({ card, brief });
  }
  return out;
}

const roomContext = (chat: RecruitChat, entries: RoomEntry[]) =>
  [
    `<role>\n${JSON.stringify(chat.jd ?? {})}\n</role>`,
    `<what_the_hiring_manager_has_said_they_want>\n${chat.learned.map((l) => `- ${l}`).join("\n") || "- nothing beyond the job description"}\n</what_the_hiring_manager_has_said_they_want>`,
    `<candidates>\n${entries.filter((e) => e.brief).map((e) => e.brief).join("\n\n") || "(no one has a finished interview yet)"}\n</candidates>`,
    entries.some((e) => !e.brief) ? `<still_in_progress>\n${entries.filter((e) => !e.brief).map((e) => `- ${e.card.name}: ${e.card.headline}`).join("\n")}\n</still_in_progress>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

export async function handleRecruit(request: Request, parts: string[], d: Deps, advance: (iv: Interview) => Promise<boolean> = async () => false): Promise<Response> {
  const method = request.method;

  if (parts.length === 1 && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { recruiter?: string };
    const recruiter = str(body.recruiter).slice(0, 120) || "a hiring manager";
    const live = await livePool(d);
    // FirstRound speaks first, so the screen never opens empty.
    const first = recruiter.split(/\s+/)[0];
    const greeting = `Hi${recruiter === "a hiring manager" ? " there" : ` ${first}`} 👋 Welcome to FirstRound. Who are you hiring? Tell me the role here, or tap the call button and we can talk it through.`;
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
  if (parts[2] === "jd" && method === "GET") {
    if (!chat.jd) return json({ error: "No job description yet" }, 404);
    // Older chats got their job description before links existed.
    if (!chat.share_id) {
      await ensureShare(d, chat);
      await d.store.putDoc(chat.id, chat);
    }
    return json({ ...publicJd(chat.jd), share_id: chat.share_id });
  }

  // GET /api/recruit/:id/room — everyone interviewed for this role
  if (parts[2] === "room" && !parts[3] && method === "GET") {
    if (!chat.jd) return json({ error: "There is no role yet. Brief FirstRound first." }, 404);
    const entries = await roomEntries(d, chat, advance);
    return json({
      role: { title: chat.jd.title, company: company(chat), location: chat.jd.location, salary: chat.jd.salary, experience: chat.jd.experience },
      jd_url: `/jd?chat=${chat.id}`,
      candidates: entries.map((e) => e.card),
      messages: chat.room?.messages ?? [],
    });
  }

  // POST /api/recruit/:id/room/ask — a question over the candidates' interview notes
  if (parts[2] === "room" && parts[3] === "ask" && method === "POST") {
    if (!chat.jd) return json({ error: "There is no role yet. Brief FirstRound first." }, 404);
    const body = (await request.json().catch(() => ({}))) as { text?: string };
    const question = str(body.text).slice(0, 2000);
    if (!question) return json({ error: "Ask a question first." }, 400);
    const entries = await roomEntries(d, chat, advance);
    const context = roomContext(chat, entries);
    // The same people with the same notes: no need to send them again.
    const told = entries.map((e) => `${e.card.id}:${e.brief.length}`).join(",");
    const fresh = (await d.store.getDoc<RecruitChat>(chat.id)) ?? chat;
    const room = fresh.room ?? { conversation_id: "", told: "", messages: [] };
    const ask = async (reopen: boolean) => {
      if (reopen || !room.conversation_id) {
        room.conversation_id = await d.eleven.openChat(d.agents.analyst, {});
        room.told = "";
      }
      const history = room.told ? "" : room.messages.slice(-8).map((m) => `${m.from === "bot" ? "YOU" : "HIRING MANAGER"}: ${m.text.slice(0, 500)}`).join("\n");
      const lead = room.told === told ? "" : `${room.told ? "[The candidates or their notes have changed. Use this version from now on.]\n" : ""}${context}\n\n${history ? `[earlier in this conversation]\n${history}\n[end]\n\n` : ""}`;
      return (await d.eleven.chat(room.conversation_id, `${lead}${question}`)).trim();
    };
    let answer: string;
    try {
      answer = await ask(false);
    } catch {
      // The conversation may have been idle too long; start a new one with the notes again.
      answer = await ask(true);
    }
    room.told = told;
    room.messages = [...room.messages, { from: "user" as const, text: question }, { from: "bot" as const, text: answer }].slice(-60);
    fresh.room = room;
    await d.store.putDoc(fresh.id, fresh);
    return json({ answer, candidates: entries.map((e) => e.card) });
  }
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

  // POST /api/recruit/:id/call — start a discovery call: a voice conversation about who they want to hire
  if (parts[2] === "call" && !parts[3] && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { transport?: string };
    const transport = body.transport === "websocket" ? "websocket" : "webrtc";
    const { token, signed_url, conversation_id } = await d.eleven.getSession(d.agents.discovery, transport);
    if (conversation_id) {
      chat.calls = [...(chat.calls ?? []), conversation_id];
      await d.store.putDoc(chat.id, chat);
    }
    // The opening greeting is ours, not something they told us; everything after it is what the call can build on.
    const known = chat.messages
      .slice(1)
      .filter((m) => m.kind !== "event")
      .slice(-16)
      .map((m) => `${m.from === "bot" ? "FirstRound" : "Them"}: ${m.text.slice(0, 400)}`)
      .join("\n");
    const named = chat.recruiter !== "a hiring manager";
    return json({
      transport,
      token,
      signed_url,
      agent_name: DISCOVERY_VOICE.name,
      variables: {
        agent_name: DISCOVERY_VOICE.name,
        recruiter: chat.recruiter,
        recruiter_first_name: named ? chat.recruiter.split(/\s+/)[0] : "there",
        known: known || "(nothing yet: this call is the first they have told us about the role)",
      },
    });
  }

  // POST /api/recruit/:id/call/complete — the call ended: hand its transcript to the chat agent, which writes it up
  if (parts[2] === "call" && parts[3] === "complete" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { conversation_id?: string };
    // Only trust a browser-supplied ID when the server was not given one with the token.
    const fromBrowser = typeof body.conversation_id === "string" && /^conv_[a-z0-9]+$/i.test(body.conversation_id) ? body.conversation_id : "";
    const id = (chat.calls ?? []).includes(fromBrowser) ? fromBrowser : (chat.calls?.at(-1) ?? fromBrowser);
    if (!id) return json({ status: "too_short" });
    if (chat.calls_done?.includes(id)) return json({ status: "done", reply: chat.messages.at(-1) });
    const snap = await d.eleven.getConversation(id).catch(() => null);
    // ElevenLabs takes a few seconds to finish a call's transcript; the phone asks again.
    if (!snap || (snap.status !== "done" && snap.status !== "failed")) return json({ status: "wait" });
    chat.calls_done = [...(chat.calls_done ?? []), id];
    if (snap.duration_secs < MIN_DISCOVERY_SECS || !snap.turns.some((t) => t.role === "candidate")) {
      await d.store.putDoc(chat.id, chat);
      return json({ status: "too_short" });
    }
    const transcript = snap.turns.map((t) => `${t.role === "agent" ? "FIRSTROUND" : "RECRUITER"}: ${t.text}`).join("\n").slice(0, 14_000);
    const text = [
      `[discovery call] You have just finished a ${Math.max(1, Math.round(snap.duration_secs / 60))}-minute voice call with them about who they want to hire. The transcript is below. Everything said on it counts as told to you: never ask for any of it again.`,
      `If it gives you the role and enough of the rest, write the job description now and send it (action "jd"), filling small gaps sensibly, and say in one line that it is from the call. If something essential is missing, such as what the role is, ask for that one thing instead.`,
      `<transcript>\n${transcript}\n</transcript>`,
    ].join("\n\n");
    chat.messages.push({ from: "user", text: `[discovery call, ${Math.max(1, Math.round(snap.duration_secs / 60))} min]\n${transcript.slice(0, 6000)}`, kind: "event" });
    const reply = await say(d, chat, text);
    const message: RecruitMessage = { from: "bot", text: reply.say, action: realise(chat, reply.action) };
    chat.messages.push(message);
    await ensureShare(d, chat);
    await d.store.putDoc(chat.id, chat);
    return json({ status: "done", reply: message });
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
    await ensureShare(d, chat);
    await d.store.putDoc(chat.id, chat);
    return json({ reply: message });
  }

  return json({ error: "Not found" }, 404);
}
