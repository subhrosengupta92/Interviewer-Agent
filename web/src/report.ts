import { normalise } from "../../src/lib/quotes";
import type { ClaimVerdict, HardBarStatus, InterviewInput, Report, Turn } from "../../src/lib/types";
import { $, api, ApiError, clock, esc, idFromUrl } from "./common";

const id = idFromUrl();
const state = $("#state");
let timer: number | undefined;

const VERDICT: Record<ClaimVerdict, [string, string]> = {
  substantiated: ["Substantiated", "flag-green"],
  partly_substantiated: ["Partly substantiated", "flag-amber"],
  not_substantiated: ["Not substantiated", "flag-red"],
  not_probed: ["Not probed", "neutral"],
};
const HARD_BAR: Record<HardBarStatus, [string, string]> = {
  met: ["Met", "flag-green"],
  not_met: ["Not met", "flag-red"],
  unclear: ["Unclear", "flag-amber"],
};
const FLAG = { green: "Green", amber: "Amber", red: "Red" };

function waiting(title: string, text: string, spin = true, retry = false) {
  $("#report").hidden = true;
  state.hidden = false;
  state.innerHTML = `<h1>${esc(title)}</h1><p class="lede">${spin ? '<span class="spinner"></span>' : ""}${esc(text)}</p>${
    retry ? '<div class="actions"><button type="button" id="retry">Try again</button></div>' : ""
  }`;
  $("#retry")?.addEventListener("click", async () => {
    await api(`/interviews/${id}/retry`, "POST").catch(() => {});
    void tick();
  });
}

function quoteBlock(quote: string, turns: Turn[]): string {
  const q = normalise(quote);
  const i = turns.findIndex((t) => t.role === "candidate" && normalise(t.text).includes(q));
  const src = i >= 0 ? `<span class="src">Candidate, turn ${i + 1}${turns[i].at_secs != null ? ` · ${clock(turns[i].at_secs!)}` : ""}</span>` : "";
  return `<blockquote>${i >= 0 ? `<a href="#t-${i + 1}" data-turn="${i + 1}">` : ""}“${esc(quote)}”${src}${i >= 0 ? "</a>" : ""}</blockquote>`;
}

function render(iv: { input: InterviewInput; report: Report; turns: Turn[]; duration_secs: number | null; attempts: number; created_at: number }) {
  const { input, report: r, turns } = iv;
  const quotes = (qs: string[]) => qs.map((q) => quoteBlock(q, turns)).join("");
  const pill = ([label, cls]: [string, string]) => `<span class="pill ${cls}">${label}</span>`;
  const dots = (n: number) => `<span class="dots" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
  const date = new Date(iv.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  $("#report").innerHTML = `
    <div class="report-head">
      <div>
        <h1>${esc(input.candidate_name)}</h1>
        <div class="meta">${esc(input.role_title)} · ${date}${iv.duration_secs ? ` · ${Math.round(iv.duration_secs / 60)} min call` : ""}${
          iv.attempts > 1 ? ` · attempt ${iv.attempts} of ${iv.attempts}` : ""
        }</div>
        <p>${esc(r.summary)}</p>
        ${r.cap_reason ? `<p class="notice small">${esc(r.cap_reason)} The interview on its own scored ${r.score_before_cap}/10.</p>` : ""}
        <p class="small muted">This report informs your decision; it does not make one. Every quote is checked word for word against the transcript.</p>
      </div>
      <div class="scorebox flag-${r.flag}" role="img" aria-label="Overall ${r.overall_score} out of 10, ${FLAG[r.flag]}">
        <div class="num">${r.overall_score}<small>/10</small></div><div class="lab">${FLAG[r.flag]}</div>
      </div>
    </div>

    <h2>Hard bars</h2>
    ${
      r.hard_bars
        .map(
          (h) => `<div class="card"><div class="item-head"><h3>${esc(h.label)}</h3>${pill(HARD_BAR[h.status])}</div>
          <p>${esc(h.note)}</p>${quotes(h.quotes)}</div>`,
        )
        .join("") || '<p class="muted">No hard bars were assessed.</p>'
    }

    <h2>Claims probed</h2>
    ${
      r.claims
        .map(
          (c) => `<div class="card"><div class="item-head"><h3>${esc(c.claim)}</h3>${pill(VERDICT[c.verdict])}</div>
          ${c.what_was_asked ? `<div class="kv"><strong>Asked:</strong> ${esc(c.what_was_asked)}</div>` : ""}
          <p>${esc(c.note)}</p>${quotes(c.quotes)}</div>`,
        )
        .join("") || '<p class="muted">No CV claims were probed.</p>'
    }

    <h2>Competencies</h2>
    ${r.competencies
      .map((c) => {
        const kind = input.competencies.find((i) => i.name === c.name)?.kind;
        const score =
          c.score === null
            ? '<span class="pill neutral">Not enough evidence</span>'
            : `<span class="scoreline">${dots(c.score)}${c.score} / 5</span>`;
        return `<div class="card"><div class="item-head"><div><h3>${esc(c.name)}</h3>${kind ? `<div class="kv">${kind === "behavioural" ? "Behavioural" : "Functional"}</div>` : ""}</div>${score}</div>
          <p>${esc(c.rationale)}</p>${quotes(c.quotes)}</div>`;
      })
      .join("")}

    <h2>Interview notes</h2>
    ${r.notes.map((n) => `<div class="card"><h3>${esc(n.section)}</h3><ul class="tight">${n.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`).join("")}

    <h2>Transcript</h2>
    <details id="transcript"><summary>Show the full transcript (${turns.length} turns)</summary>
      <div style="margin-top:10px">${turns
        .map(
          (t, i) => `<div class="turn ${t.role}" id="t-${i + 1}"><div class="spk">${t.role === "agent" ? "Interviewer" : "Candidate"}${
            t.at_secs != null ? `<br>${clock(t.at_secs)}` : ""
          }</div><div>${esc(t.text)}</div></div>`,
        )
        .join("")}</div>
    </details>
    <div class="actions"><button type="button" class="quiet" id="print">Print or save as PDF</button><button type="button" class="quiet" id="rescore">Score again</button></div>`;

  // Clicking a quote opens the transcript at the turn it came from.
  document.querySelectorAll<HTMLAnchorElement>("a[data-turn]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      ($("#transcript") as HTMLDetailsElement).open = true;
      document.querySelectorAll(".turn.hit").forEach((el) => el.classList.remove("hit"));
      const turn = $("#t-" + a.dataset.turn);
      turn.classList.add("hit");
      turn.scrollIntoView({ behavior: "smooth", block: "center" });
    }),
  );
  $("#print").addEventListener("click", () => {
    ($("#transcript") as HTMLDetailsElement).open = true;
    window.print();
  });
  $("#rescore").addEventListener("click", async () => {
    if (!confirm("Write the report again from the same transcript?")) return;
    await api(`/interviews/${id}/retry`, "POST").catch(() => {});
    void tick();
  });
  state.hidden = true;
  $("#report").hidden = false;
  document.title = `${input.candidate_name} · Interview report`;
}

async function tick() {
  clearTimeout(timer);
  if (!id) return waiting("This link is incomplete", "Please use the full report link.", false);
  try {
    const iv = await api(`/interviews/${id}`);
    const who = `${iv.input.candidate_name}, ${iv.input.role_title}`;
    const again = (ms: number) => (timer = window.setTimeout(tick, ms));
    switch (iv.status) {
      case "done":
        return render(iv);
      case "planning":
        waiting("Preparing the interview", `Writing the interview plan for ${who}.`);
        return again(4000);
      case "ready":
        waiting("Waiting for the interview", `${who} has not started yet. This page updates by itself.`);
        return again(10000);
      case "in_progress":
        waiting("Interview in progress", `${who} is speaking with the interviewer now. The report appears here a minute or two after the call ends.`);
        return again(8000);
      case "scoring":
        waiting("Writing the report", "Reading the transcript and scoring each competency. This usually takes one to two minutes.");
        return again(4000);
      case "too_short":
        waiting("The call was too short to score", `${who} was on the call for under two minutes. They can start again from the same candidate link.`, false);
        return again(15000);
      case "plan_failed":
        return waiting("The plan could not be written", iv.error ?? "Something went wrong.", false, true);
      case "score_failed":
        return waiting("The report could not be written", iv.error ?? "Something went wrong.", false, true);
    }
  } catch (e) {
    if ((e as ApiError).status === 404) return waiting("Report not found", "Please check the link.", false);
    waiting("Trying to reconnect", (e as Error).message);
    timer = window.setTimeout(tick, 6000);
  }
}

void tick();
