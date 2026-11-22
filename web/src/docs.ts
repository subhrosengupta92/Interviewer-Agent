// One-page documents for recruiters: the job description, and why a candidate fits.
import { $, api, esc, paintLogos } from "./common";

const q = new URLSearchParams(location.search);
const chat = encodeURIComponent(q.get("chat") ?? "");
const brand = '<div class="brand"><span class="logo" data-logo="lime"></span><div><b>First</b><span>Round</span></div></div>';
const list = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

async function jd() {
  const r = await api(`/recruit/${chat}/jd`);
  document.title = `${r.title} · Job description`;
  $("#doc").innerHTML = `${brand}
    <div class="eyebrow">Job description${r.company ? ` · ${esc(r.company)}` : ""}</div>
    <h1>${esc(r.title)}</h1>
    <div class="pills">${[r.location, r.salary, r.experience].filter(Boolean).map((p: string) => `<span>${esc(p)}</span>`).join("")}</div>
    <p style="margin-top:18px">${esc(r.summary)}</p>
    <h2>What you will do</h2>${list(r.responsibilities)}
    <h2>What we look for</h2>${list(r.requirements)}`;
}

async function fit() {
  const r = await api(`/recruit/${chat}/fit/${encodeURIComponent(q.get("c") ?? "")}`);
  const c = r.candidate;
  document.title = `${c.name} · Why they fit`;
  $("#doc").innerHTML = `${brand}
    <div class="eyebrow">Why they fit${r.role ? ` · ${esc(r.role)}` : ""}</div>
    <h1>${esc(c.name)}</h1>
    <p style="color:var(--ink-2);margin-bottom:6px">${esc(c.headline)} · ${c.years} years</p>
    <div class="fitnum"><b>${Number(c.score).toFixed(1)}</b><span>out of 10 in their first round, for ${esc(c.interviewed_for)}</span></div>
    <div class="pills"><span>${esc(c.location)}</span><span>Notice ${esc(c.notice)}</span>${c.skills.slice(0, 4).map((s: string) => `<span>${esc(s)}</span>`).join("")}</div>
    <ol class="points">${r.pointers
      .map((p: string) => {
        const check = /^(to check|watch)\s*:/i.test(p);
        return `<li class="${check ? "check" : ""}">${esc(p.replace(/^(to check|watch)\s*:\s*/i, ""))}</li>`;
      })
      .join("")}</ol>`;
}

paintLogos();
(location.pathname.startsWith("/fit") ? fit() : jd())
  .catch((e) => ($("#doc").innerHTML = `${brand}<h1>Not found</h1><p>${esc((e as Error).message)}</p>`))
  .finally(paintLogos);
