// The role screen: everyone who has interviewed for one role, and a place to ask questions over their notes.
import { $, api, esc, paintLogos } from "./common";

interface Person {
  id: string;
  name: string;
  headline: string;
  source: "link" | "network";
  status: "interviewing" | "scoring" | "done" | "incomplete";
  score: number | null;
  strong: string[];
  check: string[];
  location: string;
  notice: string;
  url: string | null;
}
interface Room {
  role: { title: string; company: string; location: string; salary: string; experience: string };
  jd_url: string;
  candidates: Person[];
  messages: { from: "user" | "bot"; text: string }[];
}

const chat = new URLSearchParams(location.search).get("chat") ?? "";
const thread = $("#thread");
const input = $("#q") as HTMLInputElement;
const sendBtn = $("#ask-send") as HTMLButtonElement;
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
let people: Person[] = [];
let busy = false;

function line(kind: "q" | "a", text: string) {
  const el = document.createElement("div");
  el.className = kind;
  el.textContent = text;
  thread.append(el);
  thread.scrollTop = thread.scrollHeight;
  return el;
}

function personCard(p: Person) {
  const score =
    p.status === "done" && p.score !== null
      ? `<div class="score"><b>${p.score.toFixed(1)}</b><small>first round</small></div>`
      : `<div class="score busy">${p.status === "incomplete" ? "" : '<span class="spin"></span>'}<span>${esc(p.status === "interviewing" ? "On the call now" : p.status === "scoring" ? "Writing up the notes" : "Call ended early")}</span></div>`;
  const first = p.name.split(/\s+/)[0];
  return `<article class="person">
    <span class="pic">${esc(initials(p.name))}</span>
    <div><div class="name">${esc(p.name)}</div><div class="head">${esc([p.headline, p.location, p.notice ? `notice ${p.notice}` : ""].filter(Boolean).join(" · "))}</div>
      <span class="tag ${p.source}">${p.source === "link" ? "Interviewed from your job description" : "From the FirstRound network"}</span></div>
    ${score}
    ${p.strong.length || p.check.length ? `<div class="detail">
      ${p.strong.length ? `<div class="row"><b>Strong on</b>${p.strong.map((s) => `<span>${esc(s)}</span>`).join("")}</div>` : ""}
      ${p.check.length ? `<div class="row check"><b>To check</b><span>${p.check.map(esc).join("<br>")}</span></div>` : ""}
    </div>` : ""}
    ${p.status === "done" ? `<div class="acts"><button type="button" data-ask="Tell me about ${esc(p.name)}: where they were strong, and where they were thin.">Ask about ${esc(first)}</button>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${p.source === "link" ? "Full report" : "Interview notes"}</a>` : ""}</div>` : ""}
  </article>`;
}

function showPeople(list: Person[]) {
  people = list;
  const done = list.filter((p) => p.status === "done").length;
  $("#count").textContent = list.length ? `${list.length} interviewed${done < list.length ? `, ${list.length - done} still in progress` : ""}` : "";
  $("#list").innerHTML = list.length
    ? list.map(personCard).join("")
    : `<div class="empty">No one has interviewed for this role yet. Share the job description: candidates can do their first round straight from it, and they appear here when they have.<br><a href="/jd?chat=${encodeURIComponent(chat)}" target="_blank" rel="noopener">Open the job description</a></div>`;
  ideas();
}

function ideas() {
  const names = people.filter((p) => p.status === "done").map((p) => p.name.split(/\s+/)[0]);
  const qs = names.length
    ? ["Who was strongest, and on what?", "Compare everyone on the must-haves.", names.length > 1 ? `${names[0]} or ${names[1]}: who goes deeper?` : `Where was ${names[0]} thin?`, "What should I probe in the next round?"]
    : [];
  $("#ideas").innerHTML = qs.map((q) => `<button type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join("");
}

async function ask(text: string) {
  if (busy || !text.trim()) return;
  busy = true;
  sendBtn.disabled = true;
  line("q", text);
  const wait = line("a", "");
  wait.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  try {
    const r = await api<{ answer: string; candidates: Person[] }>(`/recruit/${chat}/room/ask`, "POST", { text });
    wait.textContent = r.answer;
    showPeople(r.candidates);
  } catch (e) {
    wait.classList.add("err");
    wait.textContent = `${(e as Error).message} Ask again.`;
  }
  thread.scrollTop = thread.scrollHeight;
  busy = false;
  sendBtn.disabled = false;
}

async function load(first: boolean) {
  const r = await api<Room>(`/recruit/${chat}/room`);
  if (first) {
    document.title = `${r.role.title} · Candidates`;
    $("#role-title").textContent = r.role.title;
    $("#role-company").textContent = r.role.company ? `${r.role.company} · everyone interviewed for` : "Everyone interviewed for";
    $("#role-pills").innerHTML = [r.role.location, r.role.salary, r.role.experience].filter(Boolean).map((p) => `<span>${esc(p)}</span>`).join("");
    ($("#jd-link") as HTMLAnchorElement).href = r.jd_url;
    for (const m of r.messages) line(m.from === "user" ? "q" : "a", m.text);
  }
  showPeople(r.candidates);
  // Keep checking while someone is still on a call or being written up; otherwise look for new people now and then.
  const waiting = r.candidates.some((p) => p.status === "interviewing" || p.status === "scoring");
  setTimeout(() => void load(false).catch(() => {}), waiting ? 6000 : 30_000);
}

paintLogos();
document.addEventListener("click", (e) => {
  const q = (e.target as HTMLElement).closest<HTMLElement>("[data-ask]")?.dataset.ask;
  if (q) void ask(q);
});
$("#ask-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = "";
  void ask(text);
});
load(true).catch((e) => {
  $("#role-title").textContent = "No role here yet";
  $("#list").innerHTML = `<div class="empty">${esc((e as Error).message)}<br><a href="/recruit">Open the recruiter chat</a></div>`;
});
