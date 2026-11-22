// Joining a voice session: WebRTC first, then a WebSocket if WebRTC cannot connect on this network.
import { Conversation } from "@elevenlabs/client";
import { ApiError } from "./common";

export type VoiceCall = Awaited<ReturnType<typeof Conversation.startSession>>;

export interface VoiceGrant {
  token?: string;
  signed_url?: string;
  variables: Record<string, string | number | boolean>;
  /** Set when the call may choose its own voice and language. */
  voice_id?: string;
  language?: string;
}

export interface VoiceCallbacks {
  onConnect: () => void;
  onModeChange: (m: { mode: string }) => void;
  onDisconnect: () => void;
  onError: (message: string) => void;
}

export async function connectVoice(grant: (transport: "webrtc" | "websocket") => Promise<VoiceGrant>, callbacks: VoiceCallbacks): Promise<VoiceCall> {
  const options = (s: VoiceGrant) => ({
    dynamicVariables: s.variables,
    ...(s.voice_id ? { overrides: { tts: { voiceId: s.voice_id }, agent: { language: s.language as never } } } : {}),
    ...callbacks,
  });
  try {
    const s = await grant("webrtc");
    return await Conversation.startSession({ conversationToken: s.token!, connectionType: "webrtc", ...options(s) });
  } catch (first) {
    // The server said no (not ready, no key): a second transport will not change that.
    if (first instanceof ApiError) throw first;
    const s = await grant("websocket");
    return await Conversation.startSession({ signedUrl: s.signed_url!, connectionType: "websocket", ...options(s) });
  }
}
