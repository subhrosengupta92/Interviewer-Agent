/**
 * Local server for development: serves the built pages and runs the API in Node,
 * against the deployed database (so the Interviewer's lookup tools, which call the
 * deployed site, see the same interviews). Run `npm run build` first.
 *
 * Needs: ELEVENLABS_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID.
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import ids from "../agents/ids.json";
import { ElevenClient } from "../src/lib/eleven";
import { handleApi } from "../src/server/app";
import { remoteStore } from "./remote-store";

const PORT = Number(process.env.PORT ?? 8788);
const PAGES: Record<string, string> = { "/": "/index.html", "/interview": "/interview.html", "/report": "/report.html", "/chat": "/chat.html", "/role": "/role.html", "/feedback": "/feedback.html", "/recruit": "/recruit.html", "/jd": "/jd.html", "/fit": "/fit.html" };
const TYPES: Record<string, string> = { html: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript" };
const deps = {
  store: remoteStore(),
  eleven: new ElevenClient(process.env.ELEVENLABS_API_KEY ?? ""),
  agents: ids,
  toolSecret: process.env.TOOL_SECRET ?? "",
  now: () => Date.now(),
  newId: () => crypto.randomUUID().replace(/-/g, ""),
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const out = await handleApi(
      new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      }),
      deps,
    );
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(await out.text());
    return;
  }
  const path = PAGES[url.pathname.replace(/\/$/, "") || "/"] ?? url.pathname;
  try {
    const body = readFileSync(`.build/site${path}`);
    res.writeHead(200, { "content-type": TYPES[path.split(".").pop() ?? ""] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
