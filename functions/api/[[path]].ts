import ids from "../../agents/ids.json";
import { ElevenClient } from "../../src/lib/eleven";
import { D1Store } from "../../src/lib/store";
import { handleApi } from "../../src/server/app";

interface Env {
  DB: D1Database;
  ELEVENLABS_API_KEY?: string;
  TOOL_SECRET?: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ELEVENLABS_API_KEY && !new URL(request.url).pathname.startsWith("/api/tool/")) {
    return new Response(JSON.stringify({ error: "The ElevenLabs key has not been added to this deployment yet." }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
  return handleApi(request, {
    store: new D1Store(env.DB),
    eleven: new ElevenClient(env.ELEVENLABS_API_KEY ?? ""),
    agents: ids,
    toolSecret: env.TOOL_SECRET ?? "",
    now: () => Date.now(),
    newId: () => crypto.randomUUID().replace(/-/g, ""),
  });
};
