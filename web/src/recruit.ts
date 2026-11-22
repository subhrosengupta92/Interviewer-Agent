// The recruiter's phone: brief FirstRound by text, voice note or a discovery call, get a job description and candidates, connect.
import { $, api, ApiError, clock, esc, paintLogos, readCvText } from "./common";
import { type VoiceCall, connectVoice } from "./voice";

interface Cand { id: string; name: string; headline: string; location: string; notice: string; score: number; top: string }
type Action =
  | { type: "jd"; url: string; title: string; company: string }
  | { type: "candidates"; candidates: Cand[]; learned: string[]; round: number }
  | { type: "connect"; candidate: Cand; intro: string };
interface Msg { from: "user" | "bot"; text: string; kind?: string; action?: Action | null }

const storeKey = "firstround-recruit";
const msgs = $("#msgs");
const input = $("#text") as HTMLInputElement;
const sendBtn = $("#send") as HTMLButtonElement;
let chatId = "";
/** Resolves once the chat has been opened, so a message typed early is not lost. */
let ready: Promise<unknown> = Promise.resolve();
let recruiter = { name: "", company: "" };
let waiting = 0;

const ICON = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3 10l12 2-12 2z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z"/></svg>',
  ticks: '<svg viewBox="0 0 18 12" fill="none" stroke="#2f6bff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m1 6.5 3.2 3.2L10.5 2M7.5 9.7 14 2"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.2c1.100.4 2.300.6 3.600.6a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.300.2 2.500.6 3.6a1 1 0 0 1-.2 1z"/></svg>',
};
const now = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const scrollTo = (el: HTMLElement) => requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));

function chip(html: string, into: HTMLElement = msgs) {
  const el = document.createElement("div");
  el.className = "chip";
  el.innerHTML = html;
  into.append(el);
  scrollTo(into);
  return el;
}

function bubble(dir: "in" | "out", html: string, into: HTMLElement = msgs) {
  const row = document.createElement("div");
  row.className = `row ${dir}`;
  row.innerHTML = `<div class="bubble">${html}<div class="meta">${now()}${dir === "out" ? ICON.ticks : ""}</div></div>`;
  into.append(row);
  scrollTo(into);
  return row.firstElementChild as HTMLElement;
}

function setPresence(typing: boolean) {
  waiting = Math.max(0, waiting + (typing ? 1 : -1));
  $("#presence").textContent = waiting ? "typing…" : "online";
  let dots = $("#typing-row");
  if (waiting && !dots) {
    dots = document.createElement("div");
    dots.id = "typing-row";
    dots.className = "row in";
    dots.innerHTML = '<div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>';
    msgs.append(dots);
    scrollTo(msgs);
  } else if (!waiting && dots) dots.remove();
  else if (dots) msgs.append(dots);
}

async function send(text: string, kind: "text" | "voice" | "event" = "text", extra: Record<string, unknown> = {}) {
  setPresence(true);
  try {
    await ready;
    const { reply } = await api<{ reply: Msg }>(`/recruit/${chatId}/message`, "POST", { text, kind, ...extra });
    setPresence(false);
    renderBot(reply, true);
  } catch (e) {
    setPresence(false);
    chip(`${esc((e as Error).message)} <button type="button">Try again</button>`).querySelector("button")!.addEventListener("click", (ev) => {
      (ev.currentTarget as HTMLElement).closest(".chip")!.remove();
      void send(text, kind, extra);
    });
  }
}

function say(text: string) {
  bubble("out", `<div class="txt">${esc(text)}</div>`);
  void send(text);
}

function renderBot(m: Msg, live: boolean) {
  const el = bubble("in", `<div class="txt">${esc(m.text)}</div>`);
  const a = m.action;
  if (!a) return;
  const meta = el.querySelector(".meta")!;
  const add = (html: string) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    meta.before(...wrap.childNodes);
  };
  if (a.type === "jd") {
    add(`<a class="file" href="${esc(a.url)}" target="_blank" rel="noopener"><span class="ic doc">JD</span><span><div class="t">${esc(a.title)}</div><div class="s">Job description${a.company ? ` · ${esc(a.company)}` : ""} · share it so candidates can interview</div></span></a>`);
    if (live) {
      add('<button type="button" class="act">Looks good, show me candidates</button>');
      const b = el.querySelector(".act") as HTMLButtonElement;
      b.addEventListener("click", () => {
        b.disabled = true;
        say("Looks good. Go ahead and show me candidates.");
      });
    }
  } else if (a.type === "candidates") {
    const learned = a.round > 1 && a.learned.length ? `<div class="learned"><b>What I've learned</b>${a.learned.map((l) => `<span>${esc(l)}</span>`).join("")}</div>` : "";
    add(
      `${learned}<div class="cards">${a.candidates
        .map(
          (c) => `<div class="card cand"><div class="top"><span class="pic">${esc(initials(c.name))}</span><div><div class="ti" style="margin:0">${esc(c.name)}</div><div class="su">${esc(c.headline)}</div></div>
            <div class="score">${c.score.toFixed(1)}<small>first round</small></div></div>
          <div class="why">${esc(c.top)}</div>
          <div class="tags">${c.id.startsWith("live-") ? "<span>Interviewed today</span>" : ""}${c.location ? `<span>${esc(c.location)}</span>` : ""}${c.notice ? `<span>Notice ${esc(c.notice)}</span>` : ""}</div>
          <div class="two"><a class="light" href="/fit?chat=${encodeURIComponent(chatId)}&c=${encodeURIComponent(c.id)}" target="_blank" rel="noopener">Why they fit</a>
          <button type="button" data-connect="${esc(c.name)}">Connect</button></div></div>`,
        )
        .join("")}</div>`,
    );
    add(`<a class="file room" href="/room?chat=${encodeURIComponent(chatId)}" target="_blank" rel="noopener"><span class="ic doc">ALL</span><span><div class="t">Everyone interviewed for this role</div><div class="s">Compare them and ask the notes · opens in a new tab</div></span></a>`);
    el.querySelectorAll<HTMLButtonElement>("[data-connect]").forEach((b) => b.addEventListener("click", () => say(`Connect me with ${b.dataset.connect}.`)));
    // Write each candidate's one-page document now, so it opens instantly when clicked.
    if (live) void (async () => { for (const c of a.candidates) await api(`/recruit/${chatId}/fit/${c.id}`).catch(() => {}); })();
  } else if (a.type === "connect") {
    add('<button type="button" class="act">Open the group chat</button>');
    el.querySelector(".act")!.addEventListener("click", () => openGroup(a.candidate, a.intro));
    if (live) setTimeout(() => openGroup(a.candidate, a.intro), 900);
  }
  scrollTo(msgs);
}

// ---------- group chat (a mock-up: no real person is messaged)

const groups = new Set<string>();
function openGroup(c: Cand, intro: string) {
  const box = $("#group-msgs");
  $("#group-name").textContent = `${c.name.split(" ")[0]} × ${recruiter.company || "Hiring team"}`;
  $("#group-members").textContent = `${c.name}, ${recruiter.name || "You"}, FirstRound`;
  $("#group-avatar").textContent = initials(c.name);
  $("#group").hidden = false;
  if (groups.has(c.id)) return;
  groups.add(c.id);
  box.innerHTML = "";
  chip("Today", box);
  chip(`FirstRound created this group and added ${esc(c.name)} and ${esc(recruiter.name || "you")}`, box);
  bubble("in", `<div class="sender" style="color:#5b7a00">FirstRound</div><div class="txt">${esc(intro)}</div>`, box);
  setTimeout(() => {
    bubble("in", `<div class="sender" style="color:#2f6bff">${esc(c.name)}</div><div class="txt">Hi ${esc((recruiter.name || "there").split(" ")[0])}, thanks for reaching out! Happy to talk. I'm free tomorrow after 4 pm or Thursday morning.</div>`, box);
  }, 2600);
}

// ---------- text, voice notes, files

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let recStart = 0;
let recTick = 0;
let cancelled = false;

function syncSendIcon() {
  const recording = !!recorder;
  sendBtn.classList.toggle("rec", recording);
  sendBtn.innerHTML = recording || input.value.trim() ? ICON.send : ICON.mic;
  sendBtn.setAttribute("aria-label", recording ? "Send voice note" : input.value.trim() ? "Send" : "Record a voice note");
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return void chip("Voice notes are not supported in this browser. Please type instead.");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return void chip("Microphone access is blocked. Allow the microphone for this site in your browser's address bar, then try again.");
  }
  chunks = [];
  cancelled = false;
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const secs = (Date.now() - recStart) / 1000;
    const type = recorder?.mimeType || "audio/webm";
    recorder = null;
    clearInterval(recTick);
    $("#recbar").hidden = true;
    $("#field").hidden = false;
    syncSendIcon();
    if (!cancelled && secs >= 0.6) void sendVoice(new Blob(chunks, { type }), secs);
  };
  recStart = Date.now();
  recorder.start();
  $("#field").hidden = true;
  $("#recbar").hidden = false;
  $("#rectime").textContent = "0:00";
  recTick = window.setInterval(() => {
    const s = (Date.now() - recStart) / 1000;
    $("#rectime").textContent = clock(s);
    if (s > 90) recorder?.stop();
  }, 250);
  syncSendIcon();
}

async function sendVoice(blob: Blob, secs: number) {
  const url = URL.createObjectURL(blob);
  const bars = Array.from({ length: 28 }, (_, i) => 22 + Math.round(70 * Math.abs(Math.sin(i * 1.7 + (blob.size % 13)) * Math.cos(i * 0.6))));
  const el = bubble(
    "out",
    `<div class="vn"><button type="button" class="play" aria-label="Play voice note">${ICON.play}</button>
     <div class="wave">${bars.map((h) => `<i style="height:${h}%"></i>`).join("")}</div><span class="dur">${clock(secs)}</span></div>
     <div class="transcript">Transcribing…</div>`,
  );
  const audio = new Audio(url);
  const play = el.querySelector(".play") as HTMLButtonElement;
  const wave = [...el.querySelectorAll<HTMLElement>(".wave i")];
  play.addEventListener("click", () => (audio.paused ? void audio.play() : audio.pause()));
  audio.addEventListener("play", () => (play.innerHTML = ICON.pause));
  audio.addEventListener("pause", () => (play.innerHTML = ICON.play));
  audio.addEventListener("timeupdate", () => wave.forEach((b, i) => b.classList.toggle("on", i / wave.length < audio.currentTime / (secs || 1))));
  audio.addEventListener("ended", () => wave.forEach((b) => b.classList.remove("on")));
  const tr = el.querySelector(".transcript") as HTMLElement;
  setPresence(true);
  try {
    const res = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": blob.type || "audio/webm" }, body: blob });
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok || !data.text) throw new Error(data.error ?? "I couldn't make that out. Try again, or type it.");
    tr.textContent = data.text;
    setPresence(false);
    await send(data.text, "voice");
  } catch (e) {
    setPresence(false);
    tr.textContent = (e as Error).message;
  }
}

async function uploadJd(file: File) {
  const el = bubble("out", `<div class="file"><span class="ic">PDF</span><span><div class="t">${esc(file.name)}</div><div class="s">reading…</div></span></div>`);
  const sub = el.querySelector(".s") as HTMLElement;
  const text = await readCvText(file).catch(() => "");
  if (text.length < 60) {
    sub.textContent = "Could not read this file";
    return void chip("I couldn't read any text in that file. Paste the job description as a message instead.");
  }
  sub.textContent = `${Math.max(1, Math.round(file.size / 1024))} KB`;
  await send("jd", "event", { file_text: text });
}

// ---------- the discovery call: talk through who they want to hire instead of typing it

/** Longest a discovery call runs before the phone ends it; the agent aims for about five minutes. */
const MAX_CALL_SECS = 11 * 60;
let call: VoiceCall | null = null;
let callStart = 0;
let callTick = 0;
let callOver = true;
let dialling = false;
let muted = false;

function callMode(mode: "connecting" | "speaking" | "listening") {
  const el = $("#call");
  el.classList.remove("speaking", "listening");
  if (mode !== "connecting") el.classList.add(mode);
}

/** Leaves the call screen with a line in the chat saying why, and how to try again. */
function callFailed(message: string) {
  callOver = true;
  clearInterval(callTick);
  $("#call").hidden = true;
  chip(`${esc(message)} Tap the call button to try again.`);
}

async function startCall() {
  if ((call && !callOver) || dialling) return;
  if (!chatId) return; // still on the sign-in screen
  dialling = true;
  callOver = false;
  callStart = 0;
  muted = false;
  $("#call-mute").classList.remove("on");
  $("#call-mute").setAttribute("aria-pressed", "false");
  $("#call-name").textContent = "FirstRound";
  $("#call-sub").textContent = "Calling…";
  $("#call-err").hidden = true;
  $("#call-note").hidden = false;
  $("#call-active").hidden = false;
  callMode("connecting");
  $("#call").hidden = false;
  try {
    try {
      (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
    } catch {
      return void callFailed("Microphone access is blocked. Allow the microphone for this site in the address bar.");
    }
    call = await connectVoice(
      async (transport) => {
        const s = await api(`/recruit/${chatId}/call`, "POST", { transport });
        $("#call-name").textContent = s.agent_name;
        return s;
      },
      {
        onConnect: () => {
          callStart = Date.now();
          $("#call-note").hidden = true;
          callTick = window.setInterval(() => {
            const secs = (Date.now() - callStart) / 1000;
            $("#call-sub").textContent = clock(secs);
            $("#call").style.setProperty("--level", String(Math.min(1, (call?.getInputVolume?.() ?? 0) * 3)));
            if (secs > MAX_CALL_SECS) void call?.endSession();
          }, 250);
        },
        onModeChange: ({ mode }) => callMode(mode === "speaking" ? "speaking" : "listening"),
        onDisconnect: () => void finishCall(),
        onError: (message) => {
          $("#call-err").hidden = false;
          $("#call-err").textContent = `Connection problem: ${message}`;
        },
      },
    );
    // They hung up while it was still connecting.
    if (callOver) void call.endSession();
  } catch (e) {
    callFailed(e instanceof ApiError ? e.message : "The call could not connect. Check your connection.");
  } finally {
    dialling = false;
  }
}

async function finishCall() {
  if (callOver) return;
  callOver = true;
  clearInterval(callTick);
  const secs = callStart ? (Date.now() - callStart) / 1000 : 0;
  const id = call?.getId?.();
  call = null;
  $("#call").hidden = true;
  if (!callStart) return void chip("The call did not connect. Tap the call button to try again.");
  bubble("out", `<div class="callb"><span class="ic">${ICON.phone}</span><span><div class="t" style="font-weight:600">Discovery call</div><div class="s" style="font-size:12px;color:var(--ink-2)">${clock(secs)}</div></span></div>`);
  // The transcript takes a few seconds to be ready; FirstRound then writes up the call in the chat.
  setPresence(true);
  try {
    for (let i = 0; i < 40; i++) {
      const r = await api<{ status: "wait" | "too_short" | "done"; reply?: Msg }>(`/recruit/${chatId}/call/complete`, "POST", { conversation_id: id });
      if (r.status === "done" && r.reply) {
        setPresence(false);
        return void renderBot(r.reply, true);
      }
      if (r.status === "too_short") {
        setPresence(false);
        return void chip("That call was too short to work from. Tap the call button to try again, or tell me the role here.");
      }
      await new Promise((res) => setTimeout(res, 2500));
    }
    throw new Error("The call notes are taking longer than expected.");
  } catch (e) {
    setPresence(false);
    chip(`${esc((e as Error).message)} <button type="button">Try again</button>`).querySelector("button")!.addEventListener("click", (ev) => {
      (ev.currentTarget as HTMLElement).closest(".chip")!.remove();
      callOver = false;
      callStart = Date.now() - secs * 1000;
      void finishCall();
    });
  }
}

// ---------- start-up

async function open(saved?: string) {
  $("#signin").hidden = true;
  chip("Today");
  const restored = saved ? await api<{ messages: Msg[] }>(`/recruit/${saved}`).catch(() => null) : null;
  if (restored && saved) {
    chatId = saved;
    restored.messages.forEach((m, i) => {
      if (m.from === "bot") renderBot(m, i === restored.messages.length - 1);
      else if (m.kind !== "event") bubble("out", `<div class="txt">${esc(m.text)}</div>`);
    });
    return;
  }
  try {
    const who = [recruiter.name, recruiter.company].filter(Boolean).join(" at ");
    const opened = await api<{ id: string; greeting?: string }>("/recruit", "POST", { recruiter: who });
    chatId = opened.id;
    try {
      localStorage.setItem(storeKey, JSON.stringify({ id: chatId, ...recruiter }));
    } catch {
      /* private window */
    }
    if (opened.greeting) bubble("in", `<div class="txt">${esc(opened.greeting)}</div>`);
    else chip("Tell FirstRound who you're hiring. You can type or send a voice note.");
  } catch (e) {
    chip(esc((e as Error).message));
  }
}

paintLogos();
syncSendIcon();
$("#group-send").innerHTML = ICON.send;
$("#mode-recruit").classList.add("on");
{
  const tick = () => ($("#clock").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, ""));
  tick();
  setInterval(tick, 20_000);
}
try {
  const saved = JSON.parse(localStorage.getItem(storeKey) ?? "null") as { id: string; name: string; company: string } | null;
  if (saved?.id) {
    recruiter = { name: saved.name, company: saved.company };
    ready = open(saved.id);
  }
} catch {
  /* private window */
}

$("#signin-go").addEventListener("click", () => {
  recruiter = { name: ($("#rname") as HTMLInputElement).value.trim(), company: ($("#rco") as HTMLInputElement).value.trim() };
  ready = open();
});
$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  if (recorder) return recorder.stop();
  const text = input.value.trim();
  if (!text) return void startRecording();
  input.value = "";
  syncSendIcon();
  say(text);
});
input.addEventListener("input", syncSendIcon);
$("#reccancel").addEventListener("click", () => {
  cancelled = true;
  recorder?.stop();
});
$("#attach").addEventListener("click", () => ($("#cvfile") as HTMLInputElement).click());
$("#cvfile").addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  const f = el.files?.[0];
  el.value = "";
  if (f) void uploadJd(f);
});
$("#head-call").addEventListener("click", () => void startCall());
$("#call-end").addEventListener("click", () => {
  // Before the call connects there is no session to end; just leave the screen.
  if (call) void call.endSession();
  else callFailed("Call cancelled.");
});
$("#call-mute").addEventListener("click", () => {
  muted = !muted;
  call?.setMicMuted(muted);
  $("#call-mute").classList.toggle("on", muted);
  $("#call-mute").setAttribute("aria-pressed", String(muted));
});
window.addEventListener("beforeunload", (e) => {
  if (call && !callOver) e.preventDefault();
});
$("#group-back").addEventListener("click", () => ($("#group").hidden = true));
const groupSend = () => {
  const box = $("#group-text") as HTMLInputElement;
  if (!box.value.trim()) return;
  bubble("out", `<div class="txt">${esc(box.value.trim())}</div>`, $("#group-msgs"));
  box.value = "";
};
$("#group-send").addEventListener("click", groupSend);
$("#group-text").addEventListener("keydown", (e) => (e as KeyboardEvent).key === "Enter" && groupSend());
$("#reset").addEventListener("click", () => {
  try {
    localStorage.removeItem(storeKey);
  } catch {
    /* private window */
  }
  location.reload();
});
