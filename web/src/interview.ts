import { Conversation } from "@elevenlabs/client";
import { timeUpdate } from "../../src/lib/time";
import { $, api, ApiError, clock, idFromUrl } from "./common";

const id = idFromUrl();
const sections = ["loading", "unavailable", "lobby", "call", "done"];
const show = (name: string) => sections.forEach((s) => ($("#" + s).hidden = s !== name));

/** Calls shorter than this are not scored, so the candidate is offered another go. */
const MIN_CALL_SECS = 120;
/** The agent closes the call itself; this is a backstop if it runs well over. */
const OVERRUN_MINUTES = 4;

let minutes = 30;
let conversation: Awaited<ReturnType<typeof Conversation.startSession>> | null = null;
let startedAt = 0;
let ticker: number | undefined;
let micStream: MediaStream | null = null;
let micRaf = 0;
let ended = false;
let lastMinuteSent = 0;

function unavailable(title: string, text: string) {
  $("#unavailable-title").textContent = title;
  $("#unavailable-text").textContent = text;
  show("unavailable");
}

async function load() {
  if (!id) return unavailable("This link is incomplete", "Please use the full link you were sent.");
  try {
    const c = await api(`/interviews/${id}/candidate`);
    minutes = c.minutes;
    if (c.status === "planning")
      return unavailable("Almost ready", "Your interview is still being prepared. Please refresh this page in a minute.");
    if (!["ready", "in_progress", "too_short"].includes(c.status))
      return unavailable("This interview is complete", "Thank you. The hiring team will be in touch about next steps.");
    $("#hello").textContent = `Hello ${c.first_name}`;
    $("#intro").textContent = `This is your first-round interview for the ${c.role_title} role. It takes about ${c.minutes} minutes.`;
    $("#total").textContent = String(c.minutes);
    show("lobby");
  } catch (e) {
    unavailable(
      (e as ApiError).status === 404 ? "This interview was not found" : "Something went wrong",
      (e as ApiError).status === 404 ? "Please check the link you were sent." : (e as Error).message,
    );
  }
}

const MIC_HELP =
  "Microphone access is blocked. Click the lock or camera icon in your browser's address bar, allow the microphone for this site, then try again.";

function stopMicTest() {
  cancelAnimationFrame(micRaf);
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
}

async function testMic() {
  const err = $("#lobby-error");
  err.hidden = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    err.hidden = false;
    err.textContent = "This browser cannot use the microphone. Please open the link in a recent version of Chrome, Edge, Safari or Firefox.";
    return;
  }
  try {
    stopMicTest();
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(micStream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let heard = false;
    const loop = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
      $("#mic-level").style.width = `${Math.min(100, peak * 220)}%`;
      if (peak > 0.08 && !heard) {
        heard = true;
        $("#mic-ok").textContent = "We can hear you.";
      }
      if (micStream) micRaf = requestAnimationFrame(loop);
      else void ctx.close();
    };
    $("#mic-ok").textContent = "Listening… say a few words.";
    loop();
  } catch {
    err.hidden = false;
    err.textContent = MIC_HELP;
  }
}

function setMode(mode: "speaking" | "listening" | "connecting") {
  const orb = $("#orb");
  orb.classList.toggle("speaking", mode === "speaking");
  orb.classList.toggle("listening", mode === "listening");
  $("#who").textContent = mode === "speaking" ? "Maya is speaking" : mode === "listening" ? "Listening to you" : "Connecting…";
}

async function finish(reason: string) {
  // A connection attempt that never got through is handled by start(), not here.
  if (ended || !startedAt) return;
  ended = true;
  clearInterval(ticker);
  const secs = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const convId = conversation?.getId?.();
  conversation = null;
  if (secs < MIN_CALL_SECS) {
    // Too short to assess, so leave the interview open and offer another go.
    $("#done-title").textContent = reason === "error" ? "The call dropped" : "The interview ended early";
    $("#done-text").textContent =
      "That was too short to be reviewed. You can start again whenever you are ready; the earlier attempt will not count.";
    $("#again").hidden = false;
    show("done");
    return;
  }
  show("done");
  await api(`/interviews/${id}/complete`, "POST", { conversation_id: convId }).catch(() => {});
}

async function start() {
  const btn = $("#start") as HTMLButtonElement;
  const err = $("#lobby-error");
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = "Connecting…";
  stopMicTest();
  ended = false;
  startedAt = 0;
  lastMinuteSent = 0;
  try {
    // Ask for the microphone first, so a refusal is explained before a session is opened.
    (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
  } catch {
    err.hidden = false;
    err.textContent = MIC_HELP;
    btn.disabled = false;
    btn.textContent = "Start the interview";
    return;
  }
  try {
    show("call");
    setMode("connecting");
    const callbacks = {
      onConnect: () => {
        startedAt = Date.now();
        ticker = window.setInterval(() => {
          const secs = (Date.now() - startedAt) / 1000;
          $("#elapsed").textContent = clock(secs);
          $("#orb").style.setProperty("--level", String(Math.min(1, (conversation?.getInputVolume?.() ?? 0) * 3)));
          // Tell the interviewer the time once a minute. It is context, not speech, so it costs no delay.
          const minute = Math.floor(secs / 60);
          if (minute > lastMinuteSent) {
            lastMinuteSent = minute;
            conversation?.sendContextualUpdate(timeUpdate(minute, minutes));
          }
          if (secs > (minutes + OVERRUN_MINUTES) * 60) void conversation?.endSession();
        }, 250);
      },
      onModeChange: ({ mode }: { mode: string }) => setMode(mode === "speaking" ? "speaking" : "listening"),
      onDisconnect: (details: { reason: string }) => void finish(details.reason),
      onError: (message: string) => {
        const box = $("#call-error");
        box.hidden = false;
        box.textContent = `There is a connection problem (${message}). If the call does not recover, end it and start again.`;
      },
    };
    try {
      const session = await api(`/interviews/${id}/session`, "POST", { transport: "webrtc" });
      conversation = await Conversation.startSession({
        conversationToken: session.token,
        connectionType: "webrtc",
        dynamicVariables: session.variables,
        ...callbacks,
      });
    } catch (first) {
      if (first instanceof ApiError) throw first;
      // Some office networks block WebRTC media. A WebSocket session works wherever the page itself loads.
      const session = await api(`/interviews/${id}/session`, "POST", { transport: "websocket" });
      conversation = await Conversation.startSession({
        signedUrl: session.signed_url,
        connectionType: "websocket",
        dynamicVariables: session.variables,
        ...callbacks,
      });
    }
  } catch (e) {
    show("lobby");
    err.hidden = false;
    err.textContent =
      e instanceof ApiError ? e.message : "The call could not be connected. Check your connection and microphone, then try again.";
    btn.disabled = false;
    btn.textContent = "Start the interview";
  }
}

$("#mic-test").addEventListener("click", () => void testMic());
$("#consent").addEventListener("change", (e) => {
  ($("#start") as HTMLButtonElement).disabled = !(e.target as HTMLInputElement).checked;
});
$("#start").addEventListener("click", () => void start());
$("#end").addEventListener("click", () => {
  if (confirm("End the interview now?")) void conversation?.endSession();
});
$("#again").addEventListener("click", () => location.reload());
window.addEventListener("beforeunload", (e) => {
  if (conversation && !ended) e.preventDefault();
});

void load();
