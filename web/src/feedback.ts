import { $, api, esc, idFromUrl, paintLogos } from "./common";

const brand = '<div class="brand"><span class="logo" data-logo="lime"></span><div><b>First</b><span>Round</span></div></div>';
const id = idFromUrl();

async function load() {
  try {
    const f = await api(`/interviews/${encodeURIComponent(id)}/feedback`);
    if (f.status !== "done") {
      const failed = ["score_failed", "too_short", "plan_failed"].includes(f.status);
      $("#doc").innerHTML = `${brand}<h1>${failed ? "No feedback for this conversation" : "Your feedback is being written"}</h1>
        <p class="wait">${failed ? "The conversation was too short to give useful feedback." : '<span class="spin"></span>This takes about a minute. The page updates by itself.'}</p>`;
      paintLogos();
      if (!failed) setTimeout(load, 4000);
      return;
    }
    const tips = (f.feedback ?? []) as { title: string; advice: string; resource: string }[];
    $("#doc").innerHTML = `${brand}
      <div class="eyebrow">Feedback · ${esc(f.role_title)}</div>
      <h1>${esc(f.first_name)}, here are five things that will help next time</h1>
      <p style="color:var(--ink-2)">From your first-round conversation. Short on purpose.</p>
      ${tips
        .map(
          (t, i) => `<section class="tip"><div class="n">${i + 1}</div><div><h3>${esc(t.title)}</h3><p>${esc(t.advice)}</p>${
            t.resource ? `<span class="res"><b>Read or watch:</b> ${esc(t.resource)}</span>` : ""
          }</div></section>`,
        )
        .join("") || "<p>No feedback was written for this conversation.</p>"}`;
    paintLogos();
  } catch (e) {
    $("#doc").innerHTML = `${brand}<h1>Feedback not found</h1><p>${esc((e as Error).message)}</p>`;
    paintLogos();
  }
}

paintLogos();
void load();
