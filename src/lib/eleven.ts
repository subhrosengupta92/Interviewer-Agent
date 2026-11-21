import type { Turn } from "./types";

export interface ConversationSnapshot {
  /** ElevenLabs status: "initiated", "in-progress", "processing", "done" or "failed". */
  status: string;
  turns: Turn[];
  duration_secs: number;
}

export type Transport = "webrtc" | "websocket";
export interface SessionGrant {
  token?: string;
  signed_url?: string;
  conversation_id?: string;
}

export interface Eleven {
  /** Sends one message to a text-only agent and returns at once; the reply is read later. */
  startText(agentId: string, message: string): Promise<string>;
  getConversation(conversationId: string): Promise<ConversationSnapshot>;
  /** Short-lived credential the browser uses to join a voice session: a WebRTC token or a WebSocket URL. */
  getSession(agentId: string, transport: Transport): Promise<SessionGrant>;
}

const BASE = "https://api.elevenlabs.io";

/** Thrown when the deployment has no ElevenLabs key configured. */
export class MissingKeyError extends Error {
  constructor() {
    super("The ElevenLabs key has not been added to this deployment yet.");
  }
}

export class ElevenClient implements Eleven {
  constructor(
    private apiKey: string,
    private fetcher: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.apiKey) throw new MissingKeyError();
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

  async getSession(agentId: string, transport: Transport): Promise<SessionGrant> {
    const q = `agent_id=${encodeURIComponent(agentId)}`;
    if (transport === "webrtc") return this.call(`/v1/convai/conversation/token?${q}`);
    const grant = await this.call<SessionGrant>(`/v1/convai/conversation/get-signed-url?${q}&include_conversation_id=true`);
    // The signed URL carries the conversation ID as a query parameter rather than as its own field.
    const fromUrl = grant.signed_url ? new URL(grant.signed_url).searchParams.get("conversation_id") : null;
    return { ...grant, conversation_id: grant.conversation_id ?? fromUrl ?? undefined };
  }
}
