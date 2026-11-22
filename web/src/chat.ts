// The candidate's phone: a chat with FirstRound, voice notes, CV upload and the interview call.
import { timeUpdate } from "../../src/lib/time";
import { $, api, ApiError, clock, esc, paintLogos, readCvText } from "./common";
import { type VoiceCall, connectVoice } from "./voice";

type Action =
  | { type: "join" }
  | { type: "ask_cv" }
  | { type: "start_interview"; role_id: string; interview_id: string; role_title: string; company: string }
  | { type: "roles"; roles: { id: string; title: string; company: string; location: string; salary: string; summary: string }[] }
  | { type: "feedback"; url: string };
interface Msg { from: "user" | "bot"; text: string; kind?: string; action?: Action | null }

const query = new URLSearchParams(location.search);
/** A demo invitation code, or a company's shared job description: both are an invitation to interview for one role. */
const jd = query.get("jd") ?? "";
const invite = query.get("invite") ?? "";
const invited = !!(jd || invite);
const storeKey = `firstround-chat-${jd || invite || "self"}`;
const msgs = $("#msgs");
const input = $("#text") as HTMLInputElement;
const sendBtn = $("#send") as HTMLButtonElement;
/** Calls shorter than this are treated as dropped, matching the server's minimum for scoring. */
const MIN_CALL_SECS = 45;
const RING_DELAY_MS = 4000;

let chatId = "";
/** Resolves once the chat has been opened, so a message typed early is not lost. */
let ready: Promise<unknown> = Promise.resolve();
let applied: string[] = [];
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
const scroll = () => requestAnimationFrame(() => (msgs.scrollTop = msgs.scrollHeight));

function chip(html: string, cls = "") {
  const el = document.createElement("div");
  el.className = `chip ${cls}`;
  el.innerHTML = html;
  msgs.append(el);
  scroll();
  return el;
}

function bubble(dir: "in" | "out", html: string) {
  const row = document.createElement("div");
  row.className = `row ${dir}`;
  row.innerHTML = `<div class="bubble">${html}<div class="meta">${now()}${dir === "out" ? ICON.ticks : ""}</div></div>`;
  msgs.append(row);
  scroll();
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
    scroll();
  } else if (!waiting && dots) dots.remove();
  else if (dots) msgs.append(dots); // keep the dots last
}

// ---------- sending

async function send(text: string, kind: "text" | "voice" | "event" = "text", extra: Record<string, unknown> = {}) {
  setPresence(true);
  try {
    await ready;
    const { reply } = await api<{ reply: Msg }>(`/chat/${chatId}/message`, "POST", { text, kind, ...extra });
    setPresence(false);
    renderBot(reply, true);
  } catch (e) {
    setPresence(false);
    chip(`${esc((e as Error).message)} <button type="button" data-retry>Try again</button>`).querySelector("button")!.addEventListener(
      "click",
      (ev) => {
        (ev.currentTarget as HTMLElement).closest(".chip")!.remove();
        void send(text, kind, extra);
      },
    );
  }
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
  if (a.type === "join") {
    add('<button type="button" class="act">Join the FirstRound network</button>');
    const b = el.querySelector(".act") as HTMLButtonElement;
    if (!live) return done(b, "Joined ✓");
    b.addEventListener("click", () => {
      done(b, "Joined ✓");
      chip("You joined the FirstRound network");
      void send("[joined network]", "event");
    });
  } else if (a.type === "ask_cv") {
    add('<button type="button" class="act ghost">Upload CV (PDF)</button>');
    const b = el.querySelector(".act") as HTMLButtonElement;
    if (!live) return done(b, "CV requested");
    $("#attach").classList.add("pulse");
    b.addEventListener("click", () => ($("#cvfile") as HTMLInputElement).click());
  } else if (a.type === "start_interview") {
    add(`<div class="prep"><span class="spin"></span><span>Setting up your interviewer for ${esc(a.role_title)}…</span></div>`);
    const prep = el.querySelector(".prep") as HTMLElement;
    if (live) void prepareCall(a, prep);
    else prep.innerHTML = `<span>Interview for ${esc(a.role_title)}</span>`;
  } else if (a.type === "roles") {
    add(
      `<div class="cards">${a.roles
        .map(
          (r) => `<div class="card"><div class="co">${esc(r.company)}</div><div class="ti">${esc(r.title)}</div><div class="su">${esc(r.summary)}</div>
          <div class="tags"><span>${esc(r.location)}</span><span>${esc(r.salary)}</span></div>
          <a href="/role?id=${encodeURIComponent(r.id)}&chat=${encodeURIComponent(chatId)}" target="_blank" rel="noopener" data-role="${esc(r.id)}">View details and apply</a></div>`,
        )
        .join("")}</div>`,
    );
    markApplied();
  } else if (a.type === "feedback") {
    add(
      `<a class="file" href="${esc(a.url)}" target="_blank" rel="noopener"><span class="ic doc">DOC</span><span><div class="t">Your interview feedback</div><div class="s">5 pointers · opens in a new tab</div></span></a>`,
    );
  }
  scroll();
}

function done(b: HTMLButtonElement, label: string) {
  b.disabled = true;
  b.textContent = label;
}

function markApplied() {
  document.querySelectorAll<HTMLAnchorElement>("a[data-role]").forEach((a) => {
    if (applied.includes(a.dataset.role!)) {
      a.classList.add("done");
      a.textContent = "Applied ✓";
    }
  });
}

// ---------- text + voice notes

function syncSendIcon() {
  const recording = !!recorder;
  sendBtn.classList.toggle("rec", recording);
  sendBtn.innerHTML = recording || input.value.trim() ? ICON.send : ICON.mic;
  sendBtn.setAttribute("aria-label", recording ? "Send voice note" : input.value.trim() ? "Send" : "Record a voice note");
}

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let recStart = 0;
let recTick = 0;
let cancelled = false;

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    chip("Voice notes are not supported in this browser. Please type instead.");
    return;
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    chip("Microphone access is blocked. Allow the microphone for this site in your browser's address bar, then try again.");
    return;
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
  // A stable pseudo-waveform per note, so each bubble looks different.
  const bars = Array.from({ length: 28 }, (_, i) => 22 + Math.round(70 * Math.abs(Math.sin(i * 1.7 + blob.size % 13) * Math.cos(i * 0.6))));
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
  audio.addEventListener("timeupdate", () => {
    const p = audio.currentTime / (secs || 1);
    wave.forEach((b, i) => b.classList.toggle("on", i / wave.length < p));
  });
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

// ---------- CV

async function uploadCv(file: File) {
  $("#attach").classList.remove("pulse");
  const el = bubble(
    "out",
    `<div class="file"><span class="ic">PDF</span><span><div class="t">${esc(file.name)}</div><div class="s">${Math.max(1, Math.round(file.size / 1024))} KB · reading…</div></span></div>`,
  );
  const sub = el.querySelector(".s") as HTMLElement;
  let text = "";
  try {
    text = await readCvText(file);
  } catch {
    /* handled below */
  }
  if (text.length < 80) {
    sub.textContent = "Could not read this file";
    chip("I couldn't read any text in that file. It may be a scanned image. Please upload a PDF with selectable text.");
    $("#attach").classList.add("pulse");
    return;
  }
  sub.textContent = `${Math.max(1, Math.round(file.size / 1024))} KB · PDF`;
  document.querySelectorAll<HTMLButtonElement>(".act.ghost:not(:disabled)").forEach((b) => done(b, "CV received ✓"));
  await send("cv", "event", { cv_text: text });
}

// ---------- the interview call

interface CallInfo { interview_id: string; role_title: string; company: string }
let call: VoiceCall | null = null;
let callInfo: CallInfo | null = null;
let callStart = 0;
let callTick = 0;
let callMinutes = 10;
let lastMinute = 0;
let callOver = true;
let muted = false;

async function prepareCall(a: CallInfo, prep: HTMLElement) {
  // Ring as soon as the server says the call can start (straight away for chat interviews).
  for (let i = 0; i < 90; i++) {
    try {
      const c = await api(`/interviews/${a.interview_id}/candidate`);
      // The manager view advances the plan; nudging it here keeps the chat self-sufficient.
      if (c.can_call) {
        callMinutes = c.minutes;
        // A short beat so the message above can be read before the call screen covers it.
        await new Promise((r) => setTimeout(r, RING_DELAY_MS));
        prep.innerHTML = `<span>📞 Calling you now…</span>`;
        ring(a, c.interviewer_name);
        return;
      }
      if (c.status === "plan_failed") break;
    } catch {
      /* keep trying */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  prep.innerHTML = `<span>That took too long to set up.</span>`;
  chip('Something went wrong setting up the call. <button type="button">Try again</button>')
    .querySelector("button")!
    .addEventListener("click", () => void send("[the call could not be set up; please try again]", "event"));
}

function callMode(mode: "ringing" | "connecting" | "speaking" | "listening") {
  const el = $("#call");
  el.classList.remove("ringing", "speaking", "listening");
  if (mode !== "connecting") el.classList.add(mode);
}

function ring(a: CallInfo, interviewer: string) {
  callInfo = a;
  $("#call-name").textContent = interviewer;
  $("#call-label").textContent = "FIRSTROUND VOICE CALL";
  $("#call-sub").textContent = `${a.role_title} · ${a.company}`;
  $("#call-err").hidden = true;
  $("#call-incoming").hidden = false;
  $("#call-active").hidden = true;
  $("#call-note").hidden = false;
  callMode("ringing");
  $("#call").hidden = false;
}

/**
 * The candidate calls FirstRound from the header button. Goes straight to the interview: if none has been set up yet,
 * the server sets one up as though the earlier steps were done. No ringing.
 */
let dialling = false;
async function callBack() {
  if ((call && !callOver) || dialling) return; // already on a call
  dialling = true;
  $("#call-label").textContent = "CALLING FIRSTROUND";
  $("#call-sub").textContent = "Calling…";
  $("#call-err").hidden = true;
  $("#call-incoming").hidden = true;
  $("#call-active").hidden = true;
  $("#call-note").hidden = true;
  callMode("connecting");
  $("#call").hidden = false;
  try {
    if (!callInfo) {
      $("#call-name").textContent = "FirstRound";
      await ready;
      const c = await api(`/chat/${chatId}/call`, "POST", {});
      callMinutes = c.minutes;
      callInfo = { interview_id: c.interview_id, role_title: c.role_title, company: c.company };
      $("#call-name").textContent = c.interviewer_name;
      $("#attach").classList.remove("pulse");
    }
  } catch (e) {
    hideCall();
    chip(`${esc((e as Error).message)} Tap the call button to try again.`);
    return;
  } finally {
    dialling = false;
  }
  await acceptCall();
}

function hideCall() {
  $("#call").hidden = true;
}

function callError(message: string) {
  const box = $("#call-err");
  box.hidden = false;
  box.textContent = message;
}

async function acceptCall() {
  if (!callInfo) return;
  const info = callInfo;
  $("#call-incoming").hidden = true;
  $("#call-active").hidden = false;
  $("#call-note").hidden = true;
  $("#call-sub").textContent = "Connecting…";
  callMode("connecting");
  callOver = false;
  callStart = 0;
  lastMinute = 0;
  muted = false;
  $("#call-mute").classList.remove("on");
  try {
    (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
  } catch {
    $("#call-incoming").hidden = false;
    $("#call-active").hidden = true;
    callMode("ringing");
    callError("Microphone access is blocked. Allow the microphone for this site in the address bar, then accept again.");
    return;
  }
  const callbacks = {
    onConnect: () => {
      callStart = Date.now();
      callTick = window.setInterval(() => {
        const secs = (Date.now() - callStart) / 1000;
        $("#call-sub").textContent = clock(secs);
        $("#call").style.setProperty("--level", String(Math.min(1, (call?.getInputVolume?.() ?? 0) * 3)));
        const minute = Math.floor(secs / 60);
        if (minute > lastMinute) {
          lastMinute = minute;
          call?.sendContextualUpdate(timeUpdate(minute, callMinutes));
        }
        if (secs > (callMinutes + 4) * 60) void call?.endSession();
      }, 250);
    },
    onModeChange: ({ mode }: { mode: string }) => callMode(mode === "speaking" ? "speaking" : "listening"),
    onDisconnect: () => void finishCall(info),
    onError: (message: string) => callError(`Connection problem: ${message}`),
  };
  try {
    call = await connectVoice((transport) => api(`/interviews/${info.interview_id}/session`, "POST", { transport }), callbacks);
  } catch (e) {
    callOver = true;
    $("#call-incoming").hidden = false;
    $("#call-active").hidden = true;
    callMode("ringing");
    callError(e instanceof ApiError ? e.message : "The call could not connect. Check your connection and accept again.");
  }
}

async function finishCall(info: CallInfo) {
  if (callOver || !callStart) return;
  callOver = true;
  clearInterval(callTick);
  const secs = (Date.now() - callStart) / 1000;
  const id = call?.getId?.();
  call = null;
  hideCall();
  bubble("in", `<div class="callb"><span class="ic">${ICON.phone}</span><span><div class="t" style="font-weight:600">Voice call</div><div class="s" style="font-size:12px;color:var(--ink-2)">${clock(secs)}</div></span></div>`);
  if (secs < MIN_CALL_SECS) {
    await send(`[call ended after ${Math.round(secs)} seconds: too short, it seems to have dropped]`, "event");
    return;
  }
  await api(`/interviews/${info.interview_id}/complete`, "POST", { conversation_id: id }).catch(() => {});
  await send(`[call ended after ${Math.max(1, Math.round(secs / 60))} minutes]`, "event");
  void waitForFeedback(info.interview_id);
}

async function waitForFeedback(interviewId: string) {
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const f = await api(`/interviews/${interviewId}/feedback`);
      if (f.status === "done") return void send("[feedback ready]", "event");
      if (["score_failed", "too_short"].includes(f.status)) return;
    } catch {
      /* keep waiting */
    }
  }
}

// ---------- start-up

async function start() {
  paintLogos();
  syncSendIcon();
  if (invited) $("#mode-invite")?.classList.add("on");
  const tick = () => ($("#clock").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, ""));
  tick();
  setInterval(tick, 20_000);

  let saved = "";
  try {
    saved = localStorage.getItem(storeKey) ?? "";
  } catch {
    /* private window */
  }
  chip("Today");
  let restored: { messages: Msg[]; applied: string[] } | null = null;
  if (saved) restored = await api(`/chat/${saved}`).catch(() => null);
  if (restored) {
    chatId = saved;
    applied = restored.applied;
    await showInvite();
    for (const m of restored.messages) {
      if (m.from === "bot") renderBot(m, false);
      else if (m.kind !== "event") bubble("out", `<div class="txt">${esc(m.text)}</div>`);
    }
    // After a refresh, the last step's control should work again.
    const last = restored.messages.at(-1);
    if (last?.from === "bot" && last.action) {
      msgs.lastElementChild?.remove();
      renderBot(last, true);
    }
    return;
  }
  try {
    const c = await api<{ id: string; invite: null | { invited_by: string; role: { title: string; company: string } } }>("/chat", "POST", { invite, jd });
    chatId = c.id;
    try {
      localStorage.setItem(storeKey, chatId);
    } catch {
      /* private window */
    }
    await showInvite(c.invite);
  } catch (e) {
    chip(esc((e as Error).message));
  }
}

async function showInvite(inv?: null | { invited_by: string; role: { title: string; company: string } }) {
  if (!invited) return void chip("Say hi to get started, or tap the call button to go straight to your interview.");
  if (inv === undefined) {
    // Restoring: rebuild the invite card from the public role list.
    chip("You were invited to interview through FirstRound.", "invite");
    return;
  }
  if (inv) chip(`<b>${esc(inv.invited_by)}</b> invited you to interview for <b>${esc(inv.role.title)}</b>. Say hi to get started, or tap the call button to interview now.`, "invite");
}

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  if (recorder) return recorder.stop();
  const text = input.value.trim();
  if (!text) return void startRecording();
  input.value = "";
  syncSendIcon();
  bubble("out", `<div class="txt">${esc(text)}</div>`);
  void send(text);
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
  if (f) void uploadCv(f);
});
$("#call-accept").addEventListener("click", () => void acceptCall());
$("#head-call").addEventListener("click", () => void callBack());
$("#call-decline").addEventListener("click", () => {
  hideCall();
  const info = callInfo;
  chip('Missed call from FirstRound. <button type="button">Call back</button>')
    .querySelector("button")!
    .addEventListener("click", async () => {
      if (!info) return;
      const c = await api(`/interviews/${info.interview_id}/candidate`).catch(() => null);
      ring(info, c?.interviewer_name ?? "FirstRound");
    });
});
$("#call-end").addEventListener("click", () => void call?.endSession());
$("#call-mute").addEventListener("click", () => {
  muted = !muted;
  call?.setMicMuted(muted);
  $("#call-mute").classList.toggle("on", muted);
  $("#call-mute").setAttribute("aria-pressed", String(muted));
});
$("#reset").addEventListener("click", () => {
  try {
    localStorage.removeItem(storeKey);
  } catch {
    /* private window */
  }
  location.reload();
});

// The role page (another tab) tells this chat when the candidate applies.
function onApplied(roleId: string, label: string) {
  if (applied.includes(roleId)) return;
  applied.push(roleId);
  markApplied();
  void send(`[applied to ${label}]`, "event");
}
try {
  new BroadcastChannel("firstround").addEventListener("message", (e) => {
    const d = e.data as { type?: string; chat?: string; role_id?: string; label?: string };
    if (d.type === "applied" && d.chat === chatId && d.role_id) onApplied(d.role_id, d.label ?? d.role_id);
  });
} catch {
  /* no BroadcastChannel: applications still show after a refresh */
}
window.addEventListener("beforeunload", (e) => {
  if (call && !callOver) e.preventDefault();
});

ready = start();
