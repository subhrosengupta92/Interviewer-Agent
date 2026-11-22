// The candidate chat: a live agent decides what to say and which piece of UI the phone shows next.
import { type Role, inviteByCode, roleById, roleJobDescription } from "../data/roles";
import type { Interview, InterviewInput } from "../lib/types";
import type { Deps } from "./app";

export interface ChatMessage {
  from: "user" | "bot";
  text: string;
  kind?: "text" | "voice" | "event";
  action?: ChatAction | null;
}

export type ChatAction =
  | { type: "join" }
  | { type: "ask_cv" }
  | { type: "start_interview"; role_id: string; interview_id: string; role_title: string; company: string }
  | { type: "roles"; roles: RoleCard[] }
  | { type: "feedback"; url: string };

export interface RoleCard {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  summary: string;
}

export interface Chat {
  id: string;
  kind: "chat";
  created_at: number;
  mode: "self" | "invite";
  invite_code?: string;
  conversation_id: string;
  messages: ChatMessage[];
  cv_text?: string;
  candidate_name?: string;
  role_id?: string;
  interview_id?: string;
  shown_roles: string[];
  applied: string[];
}

const MAX_ROLES_SHOWN = 3;
const CV_FOR_AGENT = 7000;

export const roleCard = (r: Role): RoleCard => ({
  id: r.id,
  title: r.title,
  company: r.company,
  location: r.location,
  salary: r.salary,
  summary: r.summary,
});

/** What candidates may see of a role: everything except the company's budget. */
export const publicRole = ({ budget: _budget, competencies: _c, ...rest }: Role) => rest;

function entryLine(chat: Pick<Chat, "mode" | "invite_code">): string {
  const invite = inviteByCode(chat.invite_code);
  const role = roleById(invite?.role_id);
  if (chat.mode === "invite" && invite && role)
    return `The candidate was invited by ${invite.invited_by} to interview for ${role.title} at ${role.company} (role_id ${role.id}). Greet them with that in mind. Their interview is for that role only.`;
  return "The candidate found FirstRound on their own (self-discovery). They have not been invited for any particular role.";
}

/** Best guess at the candidate's name: the first short line of the CV that looks like one. */
export function nameFromCv(cv: string): string {
  for (const line of cv.split("\n").slice(0, 8)) {
    const t = line.trim();
    if (/^[\p{L}][\p{L}.' -]{2,40}$/u.test(t) && t.split(/\s+/).length <= 4 && !/curriculum|resume|profile|summary/i.test(t)) {
      return t
        .toLowerCase()
        .replace(/(^|[\s.'-])\p{L}/gu, (m) => m.toUpperCase());
    }
  }
  return "Candidate";
}

function interviewInput(chat: Chat, role: Role): InterviewInput {
  return {
    candidate_name: chat.candidate_name ?? "Candidate",
    role_title: role.title,
    cv_text: chat.cv_text ?? "",
    job_description: roleJobDescription(role),
    competencies: role.competencies,
    hard_bars: { compensation_budget: role.budget, location: role.location },
    minutes: 10,
  };
}

async function say(d: Deps, chat: Chat, text: string): Promise<{ say: string; action: Record<string, unknown> | null }> {
  let raw: string;
  try {
    raw = await d.eleven.chat(chat.conversation_id, text);
  } catch {
    // The chat may have been idle through a whole interview; reopen it and replay what was said.
    chat.conversation_id = await d.eleven.openChat(d.agents.concierge, { entry: entryLine(chat) });
    const history = chat.messages
      .slice(-30)
      .map((m) => `${m.from === "bot" ? "YOU" : "CANDIDATE"}: ${m.text.slice(0, 600)}`)
      .join("\n");
    raw = await d.eleven.chat(chat.conversation_id, `[conversation so far, for your memory]\n${history}\n[end]\n\n${text}`);
  }
  return parseReply(raw);
}

/**
 * Reads the agent's reply. It should be one JSON object, but models sometimes add a line of prose
 * before it or repeat themselves, so take the last complete object that has a "say".
 */
export function parseReply(raw: string): { say: string; action: Record<string, unknown> | null } {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth++ === 0) start = i;
    } else if (ch === "}" && depth > 0 && --depth === 0 && start >= 0) objects.push(raw.slice(start, i + 1));
  }
  for (const text of objects.reverse()) {
    try {
      const o = JSON.parse(text) as { say?: unknown; action?: unknown };
      if (typeof o.say === "string" && o.say.trim())
        return { say: o.say.trim(), action: o.action && typeof o.action === "object" ? (o.action as Record<string, unknown>) : null };
    } catch {
      /* try the one before */
    }
  }
  // No usable JSON: show the prose, without any half-written JSON after it.
  const cut = raw.search(/```|\{\s*"say"/);
  const prose = (cut >= 0 ? raw.slice(0, cut) : raw).trim();
  // Cut off mid-object with nothing before it: rescue whatever of the message was written.
  const partial = /"say"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(raw)?.[1]?.replace(/\\n/g, "\n").replace(/\\(.)/g, "$1").trim();
  return { say: prose || partial || "Sorry, could you say that again?", action: null };
}

/** Turns the agent's requested action into something the phone can show, doing the server work it implies. */
async function realise(
  d: Deps,
  chat: Chat,
  action: Record<string, unknown> | null,
  createInterview: (input: InterviewInput) => Promise<Interview>,
): Promise<ChatAction | null> {
  if (!action) return null;
  switch (action.type) {
    case "join":
      return { type: "join" };
    case "ask_cv":
      return { type: "ask_cv" };
    case "start_interview": {
      if (!chat.cv_text) return { type: "ask_cv" };
      const invited = roleById(inviteByCode(chat.invite_code)?.role_id);
      const role = (chat.mode === "invite" ? invited : undefined) ?? roleById(action.role_id) ?? roleById(chat.role_id) ?? invited;
      if (!role) return null;
      const iv = await createInterview(interviewInput(chat, role));
      chat.role_id = role.id;
      chat.interview_id = iv.id;
      return { type: "start_interview", role_id: role.id, interview_id: iv.id, role_title: role.title, company: role.company };
    }
    case "roles": {
      const ids = Array.isArray(action.role_ids) ? action.role_ids : [];
      const roles = ids
        .map((id) => roleById(id))
        .filter((r): r is Role => !!r)
        .filter((r, i, all) => all.indexOf(r) === i)
        .slice(0, MAX_ROLES_SHOWN);
      for (const r of roles) if (!chat.shown_roles.includes(r.id)) chat.shown_roles.push(r.id);
      return roles.length ? { type: "roles", roles: roles.map(roleCard) } : null;
    }
    case "feedback":
      return chat.interview_id ? { type: "feedback", url: `/feedback?id=${chat.interview_id}` } : null;
    default:
      return null;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function handleChat(
  request: Request,
  parts: string[],
  d: Deps,
  createInterview: (input: InterviewInput) => Promise<Interview>,
): Promise<Response> {
  const method = request.method;

  // POST /api/chat — open a chat
  if (parts.length === 1 && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { invite?: string };
    const invite = inviteByCode(body.invite);
    const role = roleById(invite?.role_id);
    const base = { mode: invite ? ("invite" as const) : ("self" as const), invite_code: invite?.code };
    const chat: Chat = {
      id: `chat_${d.newId()}`,
      kind: "chat",
      created_at: d.now(),
      ...base,
      conversation_id: await d.eleven.openChat(d.agents.concierge, { entry: entryLine(base) }),
      messages: [],
      shown_roles: [],
      applied: [],
    };
    await d.store.putDoc(chat.id, chat);
    return json({ id: chat.id, mode: chat.mode, invite: invite && role ? { invited_by: invite.invited_by, role: roleCard(role) } : null }, 201);
  }

  const chat = await d.store.getDoc<Chat>(parts[1] ?? "");
  if (!chat || chat.kind !== "chat") return json({ error: "Chat not found" }, 404);

  // GET /api/chat/:id — restore after a refresh
  if (parts.length === 2 && method === "GET") {
    return json({ id: chat.id, mode: chat.mode, messages: chat.messages, interview_id: chat.interview_id ?? null, applied: chat.applied });
  }

  // POST /api/chat/:id/message
  if (parts[2] === "message" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { text?: string; kind?: string; cv_text?: string };
    let text = String(body.text ?? "").trim().slice(0, 4000);
    const kind = body.kind === "voice" || body.kind === "event" ? body.kind : "text";
    if (typeof body.cv_text === "string" && body.cv_text.trim()) {
      chat.cv_text = body.cv_text.trim().slice(0, 40_000);
      chat.candidate_name = nameFromCv(chat.cv_text);
      text = `[cv uploaded] The candidate's CV:\n${chat.cv_text.slice(0, CV_FOR_AGENT)}`;
    }
    if (!text) return json({ error: "Say something first." }, 400);
    // The stored copy of a CV event stays short; the agent got the full text above.
    chat.messages.push({ from: "user", text: body.cv_text ? "[cv uploaded]" : text, kind: body.cv_text ? "event" : kind });
    const reply = await say(d, chat, text);
    const action = await realise(d, chat, reply.action, createInterview);
    const message: ChatMessage = { from: "bot", text: reply.say, action };
    chat.messages.push(message);
    await d.store.putDoc(chat.id, chat);
    return json({ reply: message });
  }

  // POST /api/chat/:id/apply — from the role page
  if (parts[2] === "apply" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { role_id?: string };
    const role = roleById(body.role_id);
    if (!role) return json({ error: "Role not found" }, 404);
    if (!chat.applied.includes(role.id)) chat.applied.push(role.id);
    await d.store.putDoc(chat.id, chat);
    return json({ applied: chat.applied, role: roleCard(role) });
  }

  return json({ error: "Not found" }, 404);
}
