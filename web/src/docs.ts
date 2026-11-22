// One-page documents for recruiters: the job description, and why a candidate fits.
import { $, api, esc, paintLogos } from "./common";

const q = new URLSearchParams(location.search);
const chat = encodeURIComponent(q.get("chat") ?? "");
const brand = '<div class="brand"><span class="logo" data-logo="lime"></span><div><b>First</b><span>Round</span></div></div>';
const list = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

/** Copies the public link to the job description, or opens the phone's share sheet where there is one. */
async function share(url: string, title: string, button: HTMLButtonElement) {
  const label = button.textContent;
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title, url });
    else {
      await navigator.clipboard.writeText(url);
      button.textContent = "Link copied";
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return; // they closed the share sheet
    // No clipboard access: show the link so it can be copied by hand.
    prompt("Copy this link", url);
  }
  setTimeout(() => (button.textContent = label), 2200);
}

async function jd() {
  // The hiring team opens it from their chat; candidates open the shared link, which carries only the public ID.
  const shared = q.get("id") ?? "";
  const r = shared ? await api(`/jd/${encodeURIComponent(shared)}`) : await api(`/recruit/${chat}/jd`);
  const link = `${location.origin}/jd?id=${encodeURIComponent(r.share_id)}`;
  document.title = `${r.title} · Job description`;
  $("#doc").innerHTML = `${brand}
    <div class="eyebrow">Job description${r.company ? ` · ${esc(r.company)}` : ""}</div>
    <h1>${esc(r.title)}</h1>
    <div class="pills">${[r.location, r.salary, r.experience].filter(Boolean).map((p: string) => `<span>${esc(p)}</span>`).join("")}</div>
    <p style="margin-top:18px">${esc(r.summary)}</p>
    <h2>What you will do</h2>${list(r.responsibilities)}
    <h2>What we look for</h2>${list(r.requirements)}
    ${shared ? "" : `<p class="team-note">Only you see this line: <a href="/room?chat=${chat}">everyone who has interviewed for this role</a>.</p>`}
    <div class="applybar">
      <button type="button" class="ghost" id="share">Share</button>
      <a class="primary" href="/chat?jd=${encodeURIComponent(r.share_id)}">Do the first round</a>
      <span>A ten-minute voice interview, right now.</span>
    </div>`;
  const button = $("#share") as HTMLButtonElement;
  button.addEventListener("click", () => void share(link, `${r.title}${r.company ? ` at ${r.company}` : ""}`, button));
}

async function fit() {
  const r = await api(`/recruit/${chat}/fit/${encodeURIComponent(q.get("c") ?? "")}`);
  const c = r.candidate;
  document.title = `${c.name} · Why they fit`;
  $("#doc").innerHTML = `${brand}
    <div class="eyebrow">Why they fit${r.role ? ` · ${esc(r.role)}` : ""}</div>
    <h1>${esc(c.name)}</h1>
    <p style="color:var(--ink-2);margin-bottom:6px">${esc(c.headline)}${c.years ? ` · ${c.years} years` : ""}</p>
    <div class="fitnum"><b>${Number(c.score).toFixed(1)}</b><span>out of 10 in their first round, for ${esc(c.interviewed_for)}</span></div>
    <div class="pills">${r.real ? "<span>Real interview · today</span>" : ""}${c.location ? `<span>${esc(c.location)}</span>` : ""}${c.notice ? `<span>Notice ${esc(c.notice)}</span>` : ""}${c.skills.slice(0, 4).map((s: string) => `<span>${esc(s)}</span>`).join("")}</div>
    <ol class="points">${r.pointers
      .map((p: string) => {
        const check = /^(to check|watch)\s*:/i.test(p);
        const text = p.replace(/^(to check|watch)\s*:\s*/i, "");
        return `<li class="${check ? "check" : ""}">${esc(text.charAt(0).toUpperCase() + text.slice(1))}</li>`;
      })
      .join("")}</ol>
    ${
      (r.notes ?? []).length
        ? `<section class="notes"><div class="notes-head"><span class="eyebrow">First-round interview · notes</span><span class="notes-meta">${esc(c.interviewed_for)} · voice call with FirstRound</span></div>
            ${(r.notes as { section: string; points: string[] }[])
              .map((n) => `<h3>${esc(n.section)}</h3><ul>${n.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`)
              .join("")}</section>`
        : ""
    }
    ${r.report_url ? `<p style="margin-top:22px"><a href="${esc(r.report_url)}" target="_blank" rel="noopener">Open the full interview report, with quotes and transcript</a></p>` : ""}`;
}

paintLogos();
(location.pathname.startsWith("/fit") ? fit() : jd())
  .catch((e) => ($("#doc").innerHTML = `${brand}<h1>Not found</h1><p>${esc((e as Error).message)}</p>`))
  .finally(paintLogos);
