import { LANGUAGES, VOICES } from "../../src/lib/voices";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as any).error ?? `Request failed (${res.status}).`, res.status);
  return data as T;
}

export const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const idFromUrl = () => new URLSearchParams(location.search).get("id") ?? "";

export function clock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

let playing: HTMLAudioElement | null = null;

/** Plays a short sample of a voice; a second click on the same button stops it. */
export function previewVoice(voiceId: string, button: HTMLButtonElement) {
  if (playing) {
    playing.pause();
    playing = null;
    button.textContent = "Listen";
    return;
  }
  const audio = new Audio(`/api/voices/${voiceId}/preview`);
  playing = audio;
  button.textContent = "Stop";
  const done = () => {
    if (playing === audio) playing = null;
    button.textContent = "Listen";
  };
  audio.addEventListener("ended", done);
  audio.addEventListener("error", done);
  void audio.play().catch(done);
}

export function fillVoices(select: HTMLSelectElement, selected?: string) {
  select.innerHTML = VOICES.map((v) => `<option value="${esc(v.id)}">${esc(v.label)}</option>`).join("");
  select.value = VOICES.some((v) => v.id === selected) ? selected! : VOICES[0].id;
}

export function fillLanguages(select: HTMLSelectElement, selected?: string) {
  select.innerHTML = LANGUAGES.map((l) => `<option value="${l.code}">${esc(l.label)}</option>`).join("");
  select.value = LANGUAGES.some((l) => l.code === selected) ? selected! : LANGUAGES[0].code;
}

/** Reads the text out of a PDF (or a plain-text file) in the browser. Returns "" for a scan with no text. */
export async function readCvText(file: File): Promise<string> {
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return (await file.text()).trim();
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/assets/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    let text = "";
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) text += (item.str ?? "") + (item.hasEOL ? "\n" : " ");
    pages.push(text.replace(/[ \t]+/g, " ").trim());
  }
  return pages.join("\n\n").trim();
}

export const LOGO = (color: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M10 9.7 12.7 7.9v8.3"/></svg>`;

export function paintLogos() {
  document.querySelectorAll<HTMLElement>("[data-logo]").forEach((el) => (el.innerHTML = LOGO(el.dataset.logo === "lime" ? "#c8f04a" : "#101828")));
}
