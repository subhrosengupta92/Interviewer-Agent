import { describe, expect, it } from "vitest";
import { ElevenClient, MissingKeyError } from "../src/lib/eleven";

const fake = (body: unknown, seen: string[] = []) =>
  (async (url: RequestInfo | URL) => {
    seen.push(String(url));
    return new Response(JSON.stringify(body));
  }) as typeof fetch;

describe("ElevenClient", () => {
  it("reads the conversation ID out of a signed WebSocket URL", async () => {
    const c = new ElevenClient("k", fake({ signed_url: "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_id=conv_abc123" }));
    expect((await c.getSession("a", "websocket")).conversation_id).toBe("conv_abc123");
  });
  it("maps a stored transcript to interviewer and candidate turns, skipping empty and tool rows", async () => {
    const c = new ElevenClient(
      "k",
      fake({
        status: "done",
        metadata: { call_duration_secs: 640 },
        transcript: [
          { role: "agent", message: "Hello", time_in_call_secs: 0 },
          { role: "agent", message: null, tool_calls: [{}] },
          { role: "user", message: "  I built it.  ", time_in_call_secs: 9 },
        ],
      }),
    );
    expect(await c.getConversation("conv_1")).toEqual({
      status: "done",
      duration_secs: 640,
      turns: [
        { role: "agent", text: "Hello", at_secs: 0 },
        { role: "candidate", text: "I built it.", at_secs: 9 },
      ],
    });
  });
  it("refuses to call out without a key", async () => {
    await expect(new ElevenClient("").getSession("a", "webrtc")).rejects.toBeInstanceOf(MissingKeyError);
  });
});
