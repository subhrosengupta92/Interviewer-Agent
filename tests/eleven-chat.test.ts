import { expect, it } from "vitest";
import { ElevenClient } from "../src/lib/eleven";
import { parseReply } from "../src/server/chat";

it("joins a reply that arrives in pieces so its JSON stays valid", async () => {
  const pieces = ['{"say": "Here are fi', 've people", "action": {"type": "candidates", "picks": [{"id": "c-meera", "poin', 'ters": ["a"]}]}}'];
  const fetcher = (async () => new Response(JSON.stringify({ status: "completed", output: pieces.map((text) => ({ text })) }))) as typeof fetch;
  const reply = await new ElevenClient("k", fetcher).chat("conv_1", "go");
  expect(parseReply(reply)).toEqual({ say: "Here are five people", action: { type: "candidates", picks: [{ id: "c-meera", pointers: ["a"] }] } });
});
