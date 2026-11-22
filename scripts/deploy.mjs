// Deploys dist/_worker.js to Cloudflare Pages with the plain deployments API.
// (wrangler's file upload uses a second token that some network proxies overwrite; this does not.)
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const project = process.env.PAGES_PROJECT ?? "interviewer-agent";
if (!account || !token) throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN");

const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
const form = new FormData();
form.append("manifest", "{}");
form.append("branch", "main");
form.append("commit_hash", git("rev-parse HEAD"));
form.append("commit_message", git("log -1 --pretty=%s"));
form.append("commit_dirty", String(git("status --porcelain") !== ""));
form.append("_worker.js", new File([readFileSync("dist/_worker.js")], "_worker.js", { type: "application/javascript+module" }));

const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}/deployments`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}` },
  body: form,
});
const data = await res.json();
if (!data.success) throw new Error(`Deploy failed: ${JSON.stringify(data.errors)}`);
console.log("Deployed", data.result.url, "→", data.result.aliases ?? "");
