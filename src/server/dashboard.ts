// The dashboard: pick several first-round transcripts and ask questions across them.
import { SAMPLE_ROLES, sampleInterview } from "../data/samples";
import type { Interview, Turn } from "../lib/types";
import type { Deps } from "./app";
import type { RecruitChat } from "./recruit";

interface DashInterview {
  id: string;
  name: string;
  headline: string;
  score: number;
  minutes: number;
  location: string;
  notice: string;
  expects: string;
  /** Score out of 5 per area, in the role's order; null where there was not enough evidence. */
  areas: (number | null)[];
  summary: string;
}

interface DashRole {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  experience: string;
  areas: string[];
  /** Sample roles ship with the app; the other kind is the hiring team's own role, with real interviews. */
  sample: boolean;
  interviews: DashInterview[];
}

/** One conversation with the answering agent, kept so a refresh does not lose it. */
interface DashSession {
  id: string;
  kind: "dash";
  conversation_id: string;
  /** Which transcripts the agent was last given. */
  told: string;
  messages: { from: "user" | "bot"; text: string }[];
}

const MAX_SELECTED = 8;
const TRANSCRIPT_CHARS = 14_000;
const LIVE = "live-";
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** A finished real interview with a transcript, from this hiring team's own job description. */
const usable = (iv: Interview | null): iv is Interview => !!iv && iv.status === "done" && !!iv.report && !!iv.turns?.length;

async function ownChat(d: Deps, chatId: unknown): Promise<RecruitChat | null> {
  const id = str(chatId);
  if (!/^recruit_[a-z0-9]+$/i.test(id)) return null;
  const chat = await d.store.getDoc<RecruitChat>(id);
  return chat?.kind === "recruit" && chat.jd ? chat : null;
}

/** The hiring team's own role, if anyone has finished a first round from its job description. */
async function ownRole(d: Deps, chat: RecruitChat | null): Promise<{ role: DashRole; interviews: Interview[] } | null> {
  if (!chat?.jd || !chat.applicants?.length) return null;
  const interviews = (await Promise.all([...chat.applicants].reverse().map((id) => d.store.get(id)))).filter(usable);
  if (!interviews.length) return null;
  const areas = interviews[0].input.competencies.map((c) => c.name);
  return {
    interviews,
    role: {
      id: "mine",
      title: chat.jd.title,
      company: chat.jd.company,
      location: chat.jd.location,
      salary: chat.jd.salary,
      experience: chat.jd.experience,
      areas,
      sample: false,
      interviews: interviews.map((iv) => ({
        id: `${LIVE}${iv.id}`,
        name: iv.input.candidate_name === "Candidate" ? "Candidate (no name given)" : iv.input.candidate_name,
        headline: "Interviewed from your job description",
        score: iv.report!.overall_score,
        minutes: Math.max(1, Math.round((iv.duration_secs ?? 0) / 60)),
        location: "",
        notice: "",
        expects: "",
        areas: areas.map((a) => iv.report!.competencies.find((c) => c.name === a)?.score ?? null),
        summary: iv.report!.summary,
      })),
    },
  };
}

interface Loaded {
  id: string;
  name: string;
  role: string;
  turns: Turn[];
  /** What the answering agent is told about this interview, transcript included. */
  brief: string;
  card: DashInterview;
  report_url: string | null;
}

const script = (turns: Turn[]) => turns.map((t) => `${t.role === "agent" ? "INTERVIEWER" : "CANDIDATE"}: ${t.text}`).join("\n").slice(0, TRANSCRIPT_CHARS);

async function load(d: Deps, chat: RecruitChat | null, id: string): Promise<Loaded | null> {
  const sample = sampleInterview(id);
  if (sample) {
    const { role, interview: i } = sample;
    const turns: Turn[] = i.turns.flatMap(([q, a]) => [
      { role: "agent" as const, text: q },
      { role: "candidate" as const, text: a },
    ]);
    return {
      id,
      name: i.name,
      role: role.title,
      turns,
      report_url: null,
      card: { id: i.id, name: i.name, headline: i.headline, score: i.score, minutes: i.minutes, location: i.location, notice: i.notice, expects: i.expects, areas: i.areas, summary: i.summary },
      brief: [
        `## ${i.name} | interviewed for ${role.title} at ${role.company} | overall ${i.score}/10 | ${i.minutes}-minute call`,
        `Profile: ${i.headline}; based in ${i.location}; notice ${i.notice}; salary expectation ${i.expects}`,
        `Scores (out of 5): ${role.areas.map((a, n) => `${a} ${i.areas[n]}`).join("; ")}`,
        `Summary: ${i.summary}`,
        `<transcript>\n${script(turns)}\n</transcript>`,
      ].join("\n"),
    };
  }
  // A real interview is only readable through the hiring team's own chat.
  if (!id.startsWith(LIVE) || !chat?.applicants?.includes(id.slice(LIVE.length))) return null;
  const own = await ownRole(d, chat);
  const iv = own?.interviews.find((x) => x.id === id.slice(LIVE.length));
  const card = own?.role.interviews.find((x) => x.id === id);
  if (!own || !iv || !card) return null;
  const r = iv.report!;
  return {
    id,
    name: card.name,
    role: own.role.title,
    turns: iv.turns!,
    card,
    report_url: `/report?id=${iv.id}`,
    brief: [
      `## ${card.name} | interviewed for ${own.role.title}${own.role.company ? ` at ${own.role.company}` : ""} | overall ${r.overall_score}/10 | ${card.minutes}-minute call`,
      `Scores (out of 5): ${r.competencies.map((c) => `${c.name} ${c.score ?? "not enough evidence"}`).join("; ")}`,
      `Summary: ${r.summary}`,
      r.hard_bars.length ? `Practical points: ${r.hard_bars.map((h) => `${h.label}: ${h.status.replace(/_/g, " ")}. ${h.note}`).join(" ")}` : "",
      `<transcript>\n${script(iv.turns!)}\n</transcript>`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export async function handleDashboard(request: Request, parts: string[], url: URL, d: Deps): Promise<Response> {
  const method = request.method;

  // GET /api/dashboard — the roles and the interviews under each
  if (parts.length === 1 && method === "GET") {
    const own = await ownRole(d, await ownChat(d, url.searchParams.get("chat")));
    const samples: DashRole[] = SAMPLE_ROLES.map((r) => ({
      id: r.id,
      title: r.title,
      company: r.company,
      location: r.location,
      salary: r.salary,
      experience: r.experience,
      areas: r.areas,
      sample: true,
      interviews: r.interviews.map((i) => ({ id: i.id, name: i.name, headline: i.headline, score: i.score, minutes: i.minutes, location: i.location, notice: i.notice, expects: i.expects, areas: i.areas, summary: i.summary })),
    }));
    const session = await d.store.getDoc<DashSession>(str(url.searchParams.get("session")));
    return json({ roles: [...(own ? [own.role] : []), ...samples], messages: session?.kind === "dash" ? session.messages : [], max_selected: MAX_SELECTED });
  }

  // GET /api/dashboard/transcript/:id — one transcript to read
  if (parts[1] === "transcript" && method === "GET") {
    const t = await load(d, await ownChat(d, url.searchParams.get("chat")), parts[2] ?? "");
    if (!t) return json({ error: "Transcript not found" }, 404);
    return json({ id: t.id, name: t.name, role: t.role, score: t.card.score, minutes: t.card.minutes, summary: t.card.summary, turns: t.turns.map(({ role, text }) => ({ role, text })), report_url: t.report_url });
  }

  // POST /api/dashboard/ask — a question across the selected transcripts
  if (parts[1] === "ask" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { ids?: unknown; text?: string; session?: string; chat?: string };
    const question = str(body.text).slice(0, 2000);
    if (!question) return json({ error: "Ask a question first." }, 400);
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(str).filter(Boolean))];
    if (!ids.length) return json({ error: "Select at least one transcript to ask about." }, 400);
    if (ids.length > MAX_SELECTED) return json({ error: `Select up to ${MAX_SELECTED} transcripts at a time.` }, 400);
    const chat = await ownChat(d, body.chat);
    const picked = (await Promise.all(ids.map((id) => load(d, chat, id)))).filter((t): t is Loaded => !!t);
    if (!picked.length) return json({ error: "Those transcripts are no longer available." }, 404);

    const found = /^dash_[a-z0-9]+$/i.test(str(body.session)) ? await d.store.getDoc<DashSession>(str(body.session)) : null;
    const session: DashSession = found?.kind === "dash" ? found : { id: `dash_${d.newId()}`, kind: "dash", conversation_id: "", told: "", messages: [] };
    const told = picked.map((t) => t.id).join(",");
    const context = [
      `[You are answering from full first-round interview transcripts, not only notes. Answer only about the ${picked.length} interview${picked.length === 1 ? "" : "s"} below. Where it makes the point, quote a few of the candidate's own words exactly as spoken.]`,
      `<interviews>\n${picked.map((t) => t.brief).join("\n\n")}\n</interviews>`,
    ].join("\n\n");
    const ask = async (reopen: boolean) => {
      if (reopen || !session.conversation_id) {
        session.conversation_id = await d.eleven.openChat(d.agents.analyst, {});
        session.told = "";
      }
      const history = session.told ? "" : session.messages.slice(-8).map((m) => `${m.from === "bot" ? "YOU" : "HIRING MANAGER"}: ${m.text.slice(0, 500)}`).join("\n");
      const lead = session.told === told ? "" : `${session.told ? "[The selection has changed. From now on answer only about these interviews.]\n" : ""}${context}\n\n${history ? `[earlier in this conversation]\n${history}\n[end]\n\n` : ""}`;
      return (await d.eleven.chat(session.conversation_id, `${lead}${question}`)).trim();
    };
    let answer: string;
    try {
      answer = await ask(false);
    } catch {
      // The conversation may have been idle too long; start a new one with the transcripts again.
      answer = await ask(true);
    }
    session.told = told;
    session.messages = [...session.messages, { from: "user" as const, text: question }, { from: "bot" as const, text: answer }].slice(-60);
    await d.store.putDoc(session.id, session);
    return json({ answer, session: session.id });
  }

  return json({ error: "Not found" }, 404);
}
