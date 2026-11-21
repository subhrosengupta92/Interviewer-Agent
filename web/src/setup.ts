import { demoScenario } from "../../demo/scenario";
import type { Competency, InterviewInput, Plan } from "../../src/lib/types";
import { $, api, esc, fillLanguages, fillVoices, idFromUrl, previewVoice } from "./common";

const comps = $("#comps");

function addCompetency(c: Partial<Competency> = {}) {
  const row = document.createElement("div");
  row.className = "comp";
  row.innerHTML = `
    <input type="text" class="name" placeholder="Competency" aria-label="Competency name" value="${esc(c.name)}">
    <select class="kind" aria-label="Type">
      <option value="functional">Functional</option><option value="behavioural">Behavioural</option>
    </select>
    <input type="text" class="def" placeholder="What good looks like (optional)" aria-label="Definition" value="${esc(c.definition)}">
    <button type="button" class="quiet" aria-label="Remove competency">Remove</button>`;
  (row.querySelector(".kind") as HTMLSelectElement).value = c.kind ?? "functional";
  row.querySelector("button")!.addEventListener("click", () => row.remove());
  comps.append(row);
}

function fill(s: InterviewInput) {
  ($("#candidate_name") as HTMLInputElement).value = s.candidate_name;
  ($("#role_title") as HTMLInputElement).value = s.role_title;
  ($("#cv_text") as HTMLTextAreaElement).value = s.cv_text;
  ($("#job_description") as HTMLTextAreaElement).value = s.job_description;
  ($("#hb_comp") as HTMLInputElement).value = s.hard_bars.compensation_budget ?? "";
  ($("#hb_loc") as HTMLInputElement).value = s.hard_bars.location ?? "";
  ($("#hb_other") as HTMLInputElement).value = s.hard_bars.other ?? "";
  ($("#minutes") as HTMLSelectElement).value = String(s.minutes);
  if (s.voice_id) ($("#voice_id") as HTMLSelectElement).value = s.voice_id;
  comps.innerHTML = "";
  s.competencies.forEach(addCompetency);
}

function read(): unknown {
  const val = (id: string) => ($(id) as HTMLInputElement).value;
  return {
    candidate_name: val("#candidate_name"),
    role_title: val("#role_title"),
    cv_text: val("#cv_text"),
    job_description: val("#job_description"),
    minutes: Number(val("#minutes")),
    voice_id: val("#voice_id"),
    language: val("#language"),
    hard_bars: { compensation_budget: val("#hb_comp"), location: val("#hb_loc"), other: val("#hb_other") },
    competencies: [...comps.querySelectorAll(".comp")].map((r) => ({
      name: (r.querySelector(".name") as HTMLInputElement).value,
      kind: (r.querySelector(".kind") as HTMLSelectElement).value,
      definition: (r.querySelector(".def") as HTMLInputElement).value,
    })),
  };
}

async function readCvFile(file: File) {
  const note = $("#cv-note");
  note.hidden = false;
  const area = $("#cv_text") as HTMLTextAreaElement;
  try {
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
      area.value = await file.text();
      note.textContent = `Read ${file.name}.`;
      return;
    }
    note.textContent = "Reading the PDF…";
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/assets/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      let text = "";
      for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
        text += (item.str ?? "") + (item.hasEOL ? "\n" : " ");
      }
      pages.push(text.replace(/[ \t]+/g, " ").trim());
    }
    const text = pages.join("\n\n").trim();
    if (text.length < 50) {
      note.textContent = "No text could be read from this PDF (it may be a scan). Please paste the CV text below.";
      return;
    }
    area.value = text;
    note.textContent = `Read ${doc.numPages} page${doc.numPages === 1 ? "" : "s"} from ${file.name}. Check the text below.`;
  } catch {
    note.textContent = "That file could not be read. Please paste the CV text below.";
  }
}

function renderPlan(plan: Plan) {
  const list = (items: string[]) => `<ul class="tight">${items.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>`;
  const sc = plan.scorecard;
  const scorecard = sc
    ? `<h2>What good looks like</h2>
    <p class="hint">Written before the interview, from the role and its level. The interviewer probes for these signals and the report scores against them.</p>
    <div class="card"><h3>The bar</h3><p>${esc(sc.bar)}</p>
      ${sc.principles.length ? `<h3 style="margin-top:14px">How answers are read</h3>${list(sc.principles)}` : ""}</div>
    ${sc.competencies
      .map(
        (c) => `<div class="card"><h3>${esc(c.name)}</h3>
        <div class="kv" style="margin-top:8px"><strong>Strong</strong></div>${list(c.strong)}
        ${c.weak.length ? `<div class="kv" style="margin-top:10px"><strong>Weak</strong></div>${list(c.weak)}` : ""}</div>`,
      )
      .join("")}`
    : "";
  $("#plan").innerHTML = `
    ${scorecard}
    <h2>Interview plan</h2>
    <div class="card"><h3>Claims the interviewer will probe</h3>
      ${plan.claims_to_probe
        .map((c) => `<p style="margin-top:10px"><strong>${esc(c.claim)}</strong><br><span class="muted small">${esc(c.why_probe)}</span></p>`)
        .join("") || '<p class="muted">None identified.</p>'}
    </div>
    <div class="card"><h3>Hard bars</h3>${list(plan.hard_bar_checks.map((h) => `${h.label}: ${h.question}`))}</div>
    ${plan.competencies
      .map((c) => `<div class="card"><h3>${esc(c.name)}</h3><div class="kv">Anchored to: ${esc(c.cv_anchor)}</div>${list(c.questions)}</div>`)
      .join("")}
    <div class="card"><h3>Background and motivation</h3>${list([...plan.background_questions, ...plan.motivation_questions])}</div>`;
}

let pollTimer: number | undefined;

async function showResult(id: string) {
  $("#form-view").hidden = true;
  $("#result-view").hidden = false;
  const origin = location.origin;
  ($("#candidate-link") as HTMLInputElement).value = `${origin}/interview?id=${id}`;
  ($("#report-link") as HTMLInputElement).value = `${origin}/report?id=${id}`;
  ($("#candidate-open") as HTMLAnchorElement).href = `/interview?id=${id}`;
  ($("#report-open") as HTMLAnchorElement).href = `/report?id=${id}`;
  const status = $("#result-status");
  const error = $("#result-error");
  const tick = async () => {
    try {
      const iv = await api(`/interviews/${id}`);
      error.hidden = true;
      $("#retry-plan").hidden = true;
      $("#result-lede").textContent = `${iv.input.candidate_name} · ${iv.input.role_title} · ${iv.input.minutes} minutes`;
      if (iv.status === "planning") {
        $("#result-title").textContent = "Preparing the interview";
        status.innerHTML = '<span class="spinner"></span>Reading the CV and writing the interview plan. This usually takes under a minute.';
        pollTimer = window.setTimeout(tick, 3000);
        return;
      }
      if (iv.status === "plan_failed") {
        $("#result-title").textContent = "The plan could not be written";
        status.hidden = true;
        error.hidden = false;
        error.textContent = iv.error ?? "Something went wrong.";
        $("#retry-plan").hidden = false;
        return;
      }
      $("#result-title").textContent = "The interview is ready";
      status.hidden = false;
      status.textContent =
        iv.status === "ready"
          ? "Send the candidate link. Keep the report link for yourself."
          : "This interview has started or finished. Open the report link to see where it stands.";
      $("#links").hidden = false;
      if (iv.plan) renderPlan(iv.plan);
    } catch (e) {
      error.hidden = false;
      error.textContent = (e as Error).message;
      pollTimer = window.setTimeout(tick, 5000);
    }
  };
  await tick();
}

fillVoices($("#voice_id") as HTMLSelectElement);
fillLanguages($("#language") as HTMLSelectElement);
$("#voice-preview").addEventListener("click", (e) =>
  previewVoice(($("#voice_id") as HTMLSelectElement).value, e.currentTarget as HTMLButtonElement),
);
$("#load-demo").addEventListener("click", () => fill(demoScenario));
$("#add-comp").addEventListener("click", () => addCompetency());
$("#cv_file").addEventListener("change", (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void readCvFile(f);
});
$("#retry-plan").addEventListener("click", async () => {
  await api(`/interviews/${idFromUrl()}/retry`, "POST").catch(() => {});
  $("#result-status").hidden = false;
  void showResult(idFromUrl());
});
document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((b) =>
  b.addEventListener("click", async () => {
    const input = $("#" + b.dataset.copy) as HTMLInputElement;
    try {
      await navigator.clipboard.writeText(input.value);
      b.textContent = "Copied";
    } catch {
      input.select();
      b.textContent = "Press Ctrl+C";
    }
    setTimeout(() => (b.textContent = "Copy"), 1500);
  }),
);

$("#setup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#submit") as HTMLButtonElement;
  const err = $("#form-error");
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = "Starting…";
  try {
    const { id } = await api<{ id: string }>("/interviews", "POST", read());
    history.pushState(null, "", `/?id=${id}`);
    await showResult(id);
  } catch (ex) {
    err.hidden = false;
    err.textContent = (ex as Error).message;
    err.scrollIntoView({ block: "center" });
  } finally {
    btn.disabled = false;
    btn.textContent = "Plan the interview";
  }
});

window.addEventListener("popstate", () => location.reload());

if (idFromUrl()) void showResult(idFromUrl());
else [0, 1, 2].forEach(() => addCompetency());
