import type { Turn } from "./types";

export interface ConversationSnapshot {
  /** ElevenLabs status: "initiated", "in-progress", "processing", "done" or "failed". */
  status: string;
  turns: Turn[];
  duration_secs: number;
}

export interface Eleven {
  /** Sends one message to a text-only agent and returns at once; the reply is read later. */
  startText(agentId: string, message: string): Promise<string>;
  getConversation(conversationId: string): Promise<ConversationSnapshot>;
  /** Short-lived token the browser uses to join a voice session. */
  getToken(agentId: string): Promise<{ token: string; conversation_id?: string }>;
}

const BASE = "https://api.elevenlabs.io";

export class ElevenClient implements Eleven {
  constructor(
    private apiKey: string,
    private fetcher: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetcher(BASE + path, {
      ...init,
      headers: { "xi-api-key": this.apiKey, "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  async startText(agentId: string, message: string): Promise<string> {
    const { conversation_id } = await this.call<{ conversation_id: string }>("/v1/convai/conversations", {
      method: "POST",
      body: JSON.stringify({ agent: { type: "persisted", agent_id: agentId } }),
    });
    await this.call(`/v1/convai/conversations/${conversation_id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        input: [{ type: "user_message", content: [{ type: "text", text: message }] }],
        background: true,
      }),
    });
    return conversation_id;
  }

  async getConversation(conversationId: string): Promise<ConversationSnapshot> {
    const c = await this.call<{
      status: string;
      transcript?: { role: string; message?: string | null; time_in_call_secs?: number }[];
      metadata?: { call_duration_secs?: number };
    }>(`/v1/convai/conversations/${conversationId}`);
    const turns: Turn[] = (c.transcript ?? [])
      .filter((t) => (t.role === "agent" || t.role === "user") && t.message && t.message.trim())
      .map((t) => ({
        role: t.role === "agent" ? ("agent" as const) : ("candidate" as const),
        text: t.message!.trim(),
        at_secs: t.time_in_call_secs,
      }));
    return { status: c.status, turns, duration_secs: c.metadata?.call_duration_secs ?? 0 };
  }

  async getToken(agentId: string): Promise<{ token: string; conversation_id?: string }> {
    return this.call(`/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`);
  }
}
