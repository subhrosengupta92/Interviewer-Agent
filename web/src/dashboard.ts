// The dashboard: choose several first-round transcripts, compare the scores, read any one, and ask questions across them.
import { $, api, esc, paintLogos } from "./common";

interface Iv {
  id: string;
  name: string;
  headline: string;
  score: number;
  minutes: number;
  location: string;
  notice: string;
  expects: string;
  areas: (number | null)[];
  summary: string;
}
interface Role { id: string; title: string; company: string; location: string; salary: string; experience: string; areas: string[]; sample: boolean; interviews: Iv[] }
interface Board { roles: Role[]; messages: { from: "user" | "bot"; text: string }[]; max_selected: number }
interface Transcript { id: string; name: string; role: string; score: number; minutes: number; summary: string; turns: { role: "agent" | "candidate"; text: string }[]; report_url: string | null }

const SESSION_KEY = "firstround-recruiter-dash";
const INTRO_KEY = "firstround-recruiter-dash-intro";
const thread = $("#thread");
const input = $("#q") as HTMLInputElement;
const sendBtn = $("#ask-send") as HTMLButtonElement;
let roles: Role[] = [];
let max = 8;
let busy = false;
let reading = "";
const chosen = new Set<string>();

/** The hiring team's own chat, if they have one in this browser: its real interviews are listed too. */
const ownChat = (() => {
  try {
    return (JSON.parse(localStorage.getItem("firstround-recruit") ?? "null") as { id?: string } | null)?.id ?? "";
  } catch {
    return "";
  }
})();
let session = "";
try {
  session = localStorage.getItem(SESSION_KEY) ?? "";
} catch {
  /* private window */
}
const withChat = (path: string) => (ownChat ? `${path}${path.includes("?") ? "&" : "?"}chat=${encodeURIComponent(ownChat)}` : path);
const roleOf = (id: string) => roles.find((r) => r.interviews.some((i) => i.id === id))!;
const picked = () => roles.flatMap((r) => r.interviews.filter((i) => chosen.has(i.id)));

/** The introduction shows until it is dismissed, and again whenever "What this does" is pressed. */
function intro(show: boolean) {
  $("#intro").hidden = !show;
  if (show) thread.scrollTop = 0;
  else {
    try {
      localStorage.setItem(INTRO_KEY, "seen");
    } catch {
      /* private window */
    }
  }
}

/** Starts again: no questions, no answers, and the agent forgets the earlier conversation. */
function clearTalk() {
  if (busy) return;
  thread.querySelectorAll(".q, .a").forEach((el) => el.remove());
  $(".talk").classList.remove("started");
  session = "";
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private window */
  }
  thread.scrollTop = 0;
}

function line(kind: "q" | "a", text: string) {
  $(".talk").classList.add("started");
  const el = document.createElement("div");
  el.className = kind;
  el.textContent = text;
  thread.append(el);
  thread.scrollTop = thread.scrollHeight;
  return el;
}

function drawRoles() {
  const filter = ($("#find") as HTMLInputElement).value.trim().toLowerCase();
  const html = roles
    .map((r) => {
      const list = r.interviews.filter((i) => !filter || `${i.name} ${i.headline}`.toLowerCase().includes(filter));
      if (!list.length) return "";
      const all = r.interviews.every((i) => chosen.has(i.id));
      return `<section class="role"><div class="role-head"><b>${esc(r.title)}</b><button type="button" data-all="${esc(r.id)}">${all ? "Clear" : "Select all"}</button>
        <small>${esc([r.company, `${r.interviews.length} interviewed`].filter(Boolean).join(" · "))}</small><span class="tag ${r.sample ? "" : "mine"}">${r.sample ? "Sample role" : "Your role"}</span></div>
        ${list
          .map(
            (i) => `<div class="iv ${chosen.has(i.id) ? "on" : ""} ${reading === i.id ? "open" : ""}"><input type="checkbox" data-pick="${esc(i.id)}" ${chosen.has(i.id) ? "checked" : ""} aria-label="Include ${esc(i.name)}">
            <button type="button" class="who" data-read="${esc(i.id)}" title="Read the transcript"><b>${esc(i.name)}</b><span>${esc(i.headline)}</span></button><span class="sc">${i.score.toFixed(1)}</span></div>`,
          )
          .join("")}</section>`;
    })
    .join("");
  $("#roles").innerHTML = html || '<p class="none">No candidate matches that.</p>';
}

/** Scores side by side for the chosen interviews, so the strong and weak areas show before any question is asked. */
function drawPicked() {
  const list = picked();
  const sameRole = new Set(list.map((i) => roleOf(i.id).id)).size === 1;
  $("#scope").textContent = list.length
    ? `Asking across ${list.length} transcript${list.length === 1 ? "" : "s"}${sameRole ? ` for ${roleOf(list[0].id).title}` : ", from different roles"}.`
    : "Select interviews on the left, then ask anything across them.";
  $("#picked").innerHTML = list.map((i) => `<span>${esc(i.name)}</span>`).join("");
  const matrix = $("#matrix");
  if (!list.length) matrix.innerHTML = '<p class="hint">Nothing selected yet. Tick the interviews you want to compare.</p>';
  else if (!sameRole) matrix.innerHTML = '<p class="hint">These interviews are for different roles, so their scores are not shown side by side. You can still ask across them.</p>';
  else {
    const role = roleOf(list[0].id);
    matrix.innerHTML = `<table><caption>First-round scores out of 5, by area</caption><thead><tr><th></th>${role.areas.map((a) => `<th scope="col">${esc(a)}</th>`).join("")}<th scope="col">Overall</th></tr></thead>
      <tbody>${list
        .map(
          (i) => `<tr><th scope="row">${esc(i.name)}</th>${role.areas
            .map((_, n) => {
              const v = i.areas[n];
              return `<td><b class="v${v ?? 0}">${v ?? "–"}</b></td>`;
            })
            .join("")}<td class="overall">${i.score.toFixed(1)}</td></tr>`,
        )
        .join("")}</tbody></table>`;
  }
  const first = list[0] ? roleOf(list[0].id) : null;
  const ideas = !list.length
    ? []
    : list.length === 1
      ? [`Where was ${list[0].name.split(" ")[0]} strongest, in their own words?`, `Where did ${list[0].name.split(" ")[0]} run out of depth?`, "What should the next round probe?"]
      : sameRole && first
        ? [`Who was strongest on ${first.areas[0].toLowerCase()}, and what did they say?`, `Compare them on ${first.areas[2].toLowerCase()}.`, "Who was most honest about a weakness?", "Who can join soonest, and who is within the salary range?"]
        : ["What do the strongest candidates have in common?", "Who was most honest about a weakness?"];
  $("#ideas").innerHTML = ideas.map((q) => `<button type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join("");
  const off = !list.length || busy;
  sendBtn.disabled = off;
  input.disabled = !list.length;
}

function toggle(id: string, on: boolean) {
  if (on && chosen.size >= max) return void line("a", `You can ask across up to ${max} transcripts at a time. Untick one first.`).classList.add("err");
  if (on) chosen.add(id);
  else chosen.delete(id);
  drawRoles();
  drawPicked();
}

async function read(id: string) {
  reading = id;
  drawRoles();
  $("#desk").classList.add("reading");
  $("#reader").hidden = false;
  $("#r-name").textContent = "Loading…";
  $("#r-meta").textContent = "";
  $("#r-sum").textContent = "";
  $("#r-turns").innerHTML = "";
  try {
    const t = await api<Transcript>(withChat(`/dashboard/transcript/${encodeURIComponent(id)}`));
    if (reading !== id) return;
    $("#r-name").textContent = t.name;
    $("#r-meta").textContent = `${t.role} · ${t.minutes}-minute call · ${t.score.toFixed(1)} out of 10`;
    $("#r-sum").innerHTML = `${esc(t.summary)}${t.report_url ? ` <a href="${esc(t.report_url)}" target="_blank" rel="noopener">Full report</a>` : ""}`;
    $("#r-turns").innerHTML = t.turns.map((x) => `<div class="turn ${x.role === "candidate" ? "them" : "us"}"><small>${x.role === "candidate" ? esc(t.name.split(" ")[0]) : "Interviewer"}</small><p>${esc(x.text)}</p></div>`).join("");
    $("#r-turns").scrollTop = 0;
  } catch (e) {
    $("#r-name").textContent = "Could not open this transcript";
    $("#r-sum").textContent = (e as Error).message;
  }
}

function closeReader() {
  reading = "";
  $("#reader").hidden = true;
  $("#desk").classList.remove("reading");
  drawRoles();
}

async function ask(text: string) {
  if (busy || !text.trim() || !chosen.size) return;
  busy = true;
  sendBtn.disabled = true;
  line("q", text);
  const wait = line("a", "");
  wait.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  try {
    const r = await api<{ answer: string; session: string }>("/dashboard/ask", "POST", { ids: [...chosen], text, session, chat: ownChat });
    wait.textContent = r.answer;
    session = r.session;
    try {
      localStorage.setItem(SESSION_KEY, session);
    } catch {
      /* private window */
    }
  } catch (e) {
    wait.classList.add("err");
    wait.textContent = `${(e as Error).message} Ask again.`;
  }
  thread.scrollTop = thread.scrollHeight;
  busy = false;
  sendBtn.disabled = !chosen.size;
}

paintLogos();
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const q = t.closest<HTMLElement>("[data-ask]")?.dataset.ask;
  if (q) return void ask(q);
  const readId = t.closest<HTMLElement>("[data-read]")?.dataset.read;
  if (readId) return void read(readId);
  const all = t.closest<HTMLElement>("[data-all]")?.dataset.all;
  if (all) {
    const role = roles.find((r) => r.id === all)!;
    const clear = role.interviews.every((i) => chosen.has(i.id));
    for (const i of role.interviews) {
      if (clear) chosen.delete(i.id);
      else if (chosen.size < max) chosen.add(i.id);
    }
    drawRoles();
    drawPicked();
  }
});
document.addEventListener("change", (e) => {
  const box = e.target as HTMLInputElement;
  if (box.dataset?.pick) toggle(box.dataset.pick, box.checked);
});
$("#find").addEventListener("input", drawRoles);
$("#help").addEventListener("click", () => intro(true));
$("#intro-ok").addEventListener("click", () => intro(false));
$("#clear").addEventListener("click", clearTalk);
$("#r-close").addEventListener("click", closeReader);
document.addEventListener("keydown", (e) => e.key === "Escape" && reading && closeReader());
$("#ask-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = "";
  void ask(text);
});

api<Board>(withChat(`/dashboard${session ? `?session=${encodeURIComponent(session)}` : ""}`))
  .then((b) => {
    roles = b.roles;
    max = b.max_selected;
    // Start with the first role selected, so there is something to ask about straight away.
    for (const i of roles[0]?.interviews.slice(0, max) ?? []) chosen.add(i.id);
    drawRoles();
    drawPicked();
    for (const m of b.messages) line(m.from === "user" ? "q" : "a", m.text);
    let seen = false;
    try {
      seen = localStorage.getItem(INTRO_KEY) === "seen";
    } catch {
      /* private window */
    }
    // Open with what this screen is for, until it has been dismissed once.
    if (!seen) intro(true);
  })
  .catch((e) => ($("#roles").innerHTML = `<p class="none">${esc((e as Error).message)}</p>`));
