import { $, api, esc, paintLogos } from "./common";

const q = new URLSearchParams(location.search);
const id = q.get("id") ?? "";
const chat = q.get("chat") ?? "";
const brand = '<div class="brand"><span class="logo" data-logo="lime"></span><div><b>First</b><span>Round</span></div></div>';

async function load() {
  try {
    const r = await api(`/roles/${encodeURIComponent(id)}`);
    document.title = `${r.title} at ${r.company} · FirstRound`;
    const list = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    $("#doc").innerHTML = `${brand}
      <div class="eyebrow">${esc(r.company)}</div>
      <h1>${esc(r.title)}</h1>
      <div class="pills"><span>${esc(r.location)}</span><span>${esc(r.salary)}</span><span>${esc(r.experience)}</span></div>
      <p style="margin-top:18px">${esc(r.summary)}</p>
      <h2>About ${esc(r.company)}</h2><p>${esc(r.about)}</p>
      <h2>What you will do</h2>${list(r.responsibilities)}
      <h2>What we look for</h2>${list(r.requirements)}`;
    paintLogos();
    const bar = $("#applybar");
    bar.hidden = false;
    const btn = $("#apply") as HTMLButtonElement;
    const applied = () => {
      btn.disabled = true;
      btn.textContent = "Applied ✓";
      $("#apply-note").textContent = "Done. We've told the team; you can close this tab and go back to the chat.";
    };
    if (!chat) {
      btn.disabled = true;
      $("#apply-note").textContent = "Open this role from your FirstRound chat to apply.";
      return;
    }
    const state = await api(`/chat/${encodeURIComponent(chat)}`).catch(() => null);
    if (state?.applied?.includes(id)) applied();
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Applying…";
      try {
        await api(`/chat/${encodeURIComponent(chat)}/apply`, "POST", { role_id: id });
        applied();
        try {
          new BroadcastChannel("firstround").postMessage({ type: "applied", chat, role_id: id, label: `${r.title} at ${r.company}` });
        } catch {
          /* the chat picks it up on refresh */
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "Apply";
        $("#apply-note").textContent = (e as Error).message;
      }
    });
  } catch (e) {
    $("#doc").innerHTML = `${brand}<h1>Role not found</h1><p>${esc((e as Error).message)}</p>`;
    paintLogos();
  }
}

paintLogos();
void load();
