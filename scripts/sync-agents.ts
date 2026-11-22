/**
 * Creates or updates the three ElevenLabs agents and the Interviewer's two lookup tools
 * from the config in agents/. Run: BASE_URL=https://… TOOL_SECRET=… npm run sync-agents
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  INTERVIEWER_FIRST_MESSAGE,
  INTERVIEWER_FIRST_MESSAGE_HI,
  INTERVIEWER_MODEL,
  interviewerPrompt,
  INTERVIEWER_VOICE_ID,
} from "../agents/interviewer";
import { CONCIERGE_MODEL, CONCIERGE_PROMPT } from "../agents/concierge";
import { MATCHER_MODEL, MATCHER_PROMPT } from "../agents/matcher";
import { PLANNER_MODEL, PLANNER_PROMPT } from "../agents/planner";
import { FIT_MODEL, FIT_PROMPT, NOTES_MODEL, NOTES_PROMPT, RECRUITER_MODEL, RECRUITER_PROMPT } from "../agents/recruiter";
import { DEFAULT_VOICE, LANGUAGES } from "../src/lib/voices";
import { SCORER_MODEL, SCORER_PROMPT } from "../agents/scorer";
import { el } from "./eleven-admin";

const PREFIX = "interviewer-agent/";
// ElevenLabs rejects "fast" for the Claude models used here (checked 2026-11-22), so this stays "standard".
const SERVICE_TIER = process.env.SERVICE_TIER ?? "standard";
// Everything below the file's introduction is given to the Interviewer verbatim.
const doNotSay = readFileSync(new URL("../agents/do-not-say.md", import.meta.url), "utf8").split("\n").slice(4).join("\n").trim();
const BASE_URL = (process.env.BASE_URL ?? "").replace(/\/$/, "");
const TOOL_SECRET = process.env.TOOL_SECRET ?? "";
if (!BASE_URL || !TOOL_SECRET) throw new Error("Set BASE_URL and TOOL_SECRET");

async function upsertSecret(name: string, value: string): Promise<string> {
  const { secrets } = await el<{ secrets: { secret_id: string; name: string }[] }>("/v1/convai/secrets");
  const hit = secrets.find((s) => s.name === name);
  if (hit) {
    await el(`/v1/convai/secrets/${hit.secret_id}`, "PATCH", { type: "update", name, value });
    return hit.secret_id;
  }
  return (await el<{ secret_id: string }>("/v1/convai/secrets", "POST", { type: "new", name, value })).secret_id;
}

async function upsertTool(name: string, description: string, path: string, secretId: string): Promise<string> {
  const tool_config = {
    type: "webhook",
    name,
    description,
    response_timeout_secs: 15,
    // Have the agent say a short line before the lookup, so the candidate is not left in silence while it runs.
    pre_tool_speech: "force",
    // A soft keyboard sound while it looks things up, like someone pulling up notes.
    tool_call_sound: "typing",
    tool_call_sound_behavior: "always",
    api_schema: {
      url: `${BASE_URL}${path}`,
      method: "GET",
      query_params_schema: {
        properties: { interview_id: { type: "string", dynamic_variable: "interview_id" } },
        required: ["interview_id"],
      },
      request_headers: { "x-tool-secret": { secret_id: secretId } },
    },
  };
  const { tools } = await el<{ tools: { id: string; tool_config: { name: string } }[] }>("/v1/convai/tools");
  const hit = tools.find((t) => t.tool_config.name === name);
  if (hit) {
    await el(`/v1/convai/tools/${hit.id}`, "PATCH", { tool_config });
    return hit.id;
  }
  return (await el<{ id: string }>("/v1/convai/tools", "POST", { tool_config })).id;
}

async function upsertAgent(name: string, body: Record<string, unknown>): Promise<string> {
  const { agents } = await el<{ agents: { agent_id: string; name: string }[] }>(
    `/v1/convai/agents?page_size=100&search=${encodeURIComponent(PREFIX)}`,
  );
  const hit = agents.find((a) => a.name === name);
  if (hit) {
    await el(`/v1/convai/agents/${hit.agent_id}`, "PATCH", { name, ...body });
    return hit.agent_id;
  }
  return (await el<{ agent_id: string }>("/v1/convai/agents/create", "POST", { name, ...body })).agent_id;
}

const textAgent = (prompt: string, llm: string) => ({
  conversation_config: {
    conversation: { text_only: true },
    agent: { first_message: "", language: "en", prompt: { prompt, llm, temperature: 0, max_tokens: 16000, service_tier: SERVICE_TIER } },
  },
  platform_settings: { auth: { enable_auth: true } },
});

const secretId = await upsertSecret("interviewer_agent_tool_secret", TOOL_SECRET);
const briefTool = await upsertTool(
  "get_interview_brief",
  "Fetches the brief for this interview: the candidate's CV, the job description, the planned questions, the competencies to test and the CV claims to probe. Call once, before your second message.",
  "/api/tool/brief",
  secretId,
);
// Time is now sent by the browser as a silent context update; remove the old lookup tool if it exists.
const { tools: existing } = await el<{ tools: { id: string; tool_config: { name: string } }[] }>("/v1/convai/tools");
const oldTimeTool = existing.find((t) => t.tool_config.name === "check_time");

const planner = await upsertAgent(`${PREFIX}planner`, textAgent(PLANNER_PROMPT, PLANNER_MODEL));
const scorer = await upsertAgent(`${PREFIX}scorer`, textAgent(SCORER_PROMPT, SCORER_MODEL));
const conciergeConfig = textAgent(CONCIERGE_PROMPT, CONCIERGE_MODEL);
conciergeConfig.conversation_config.agent.prompt.temperature = 0.5;
conciergeConfig.conversation_config.agent.prompt.max_tokens = 1200;
(conciergeConfig.conversation_config.agent as Record<string, unknown>).dynamic_variables = {
  dynamic_variable_placeholders: { entry: "The candidate found FirstRound on their own (self-discovery)." },
};
const concierge = await upsertAgent(`${PREFIX}concierge`, conciergeConfig);
const interviewer = await upsertAgent(`${PREFIX}interviewer`, {
  conversation_config: {
    turn: {
      // Normal turn-taking, with the reply prepared during the pause so it starts sooner.
      // "patient" waited noticeably longer after every answer; go back to it if the agent cuts in.
      turn_eagerness: "normal",
      turn_timeout: 20,
      speculative_turn: true,
      silence_end_call_timeout: 180,
      // "Yeah", "mm-hm", "okay" and the like are listening noises, not interruptions: keep talking through them.
      interruption_ignore_term_languages: ["en"],
      merge_with_default_ignore_terms: true,
      // Only pure listening noises here; words that can be a real answer ("yes", "sure") are left out.
      interruption_ignore_terms: ["yeah", "ya", "haan", "hmm", "mm", "mm-hmm", "uh-huh", "okay", "ok", "achha", "accha", "i see", "got it"],
    },
    // Ignore other people talking and TV or street noise near the candidate.
    vad: { background_voice_detection: true },
    tts: { voice_id: INTERVIEWER_VOICE_ID, speed: 1.03, expressive_mode: true },
    conversation: {
      max_duration_seconds: 35 * 60,
      // Quiet office ambience under the whole call, so silences do not sound dead. Set source_type to null to turn it off.
      background_sound: { source_type: "preset", source_id: "office1", volume: 0.08, crossfade_loop: true },
    },
    // Hindi interviews: same agent, Hindi speech recognition and voice, and a Hindi greeting.
    language_presets: { hi: { overrides: { agent: { language: "hi", first_message: INTERVIEWER_FIRST_MESSAGE_HI } } } },
    agent: {
      first_message: INTERVIEWER_FIRST_MESSAGE,
      language: "en",
      // In Hindi, keep English technical words in the speech instead of forcing pure Hindi.
      hinglish_mode: true,
      disable_first_message_interruptions: true,
      max_conversation_duration_message:
        "We're out of time, so I'll stop here. Thank you for speaking with me today; the hiring team will be in touch about next steps. Goodbye.",
      dynamic_variables: {
        dynamic_variable_placeholders: {
          interview_id: "missing",
          interviewer_name: DEFAULT_VOICE.name,
          interviewer_gender: DEFAULT_VOICE.gender,
          interview_language: LANGUAGES[0].instruction,
          candidate_first_name: "there",
          role_title: "open",
          minutes: 30,
        },
      },
      prompt: {
        prompt: interviewerPrompt(doNotSay),
        llm: INTERVIEWER_MODEL,
        service_tier: SERVICE_TIER,
        temperature: 0.7,
        tool_ids: [briefTool],
        built_in_tools: {
          end_call: {
            type: "system",
            name: "end_call",
            description: "End the call after you have said goodbye, or if the candidate asks to stop.",
            params: { system_tool_type: "end_call" },
          },
        },
      },
    },
  },
  platform_settings: {
    auth: { enable_auth: true },
    // The browser may choose the voice and language for a call; nothing else about the agent can be overridden.
    overrides: { conversation_config_override: { tts: { voice_id: true }, agent: { language: true } } },
  },
});

const recruiterConfig = textAgent(RECRUITER_PROMPT, RECRUITER_MODEL);
recruiterConfig.conversation_config.agent.prompt.temperature = 0.4;
recruiterConfig.conversation_config.agent.prompt.max_tokens = 2000;
(recruiterConfig.conversation_config.agent as Record<string, unknown>).dynamic_variables = {
  dynamic_variable_placeholders: { recruiter: "a hiring manager" },
};
const recruiter = await upsertAgent(`${PREFIX}recruiter`, recruiterConfig);
const fitConfig = textAgent(FIT_PROMPT, FIT_MODEL);
fitConfig.conversation_config.agent.prompt.max_tokens = 800;
const fit = await upsertAgent(`${PREFIX}fit-writer`, fitConfig);
const matcherConfig = textAgent(MATCHER_PROMPT, MATCHER_MODEL);
matcherConfig.conversation_config.agent.prompt.max_tokens = 900;
const matcher = await upsertAgent(`${PREFIX}role-matcher`, matcherConfig);
const notesConfig = textAgent(NOTES_PROMPT, NOTES_MODEL);
notesConfig.conversation_config.agent.prompt.temperature = 0.4;
notesConfig.conversation_config.agent.prompt.max_tokens = 1500;
const notes = await upsertAgent(`${PREFIX}notes-writer`, notesConfig);
const ids = { planner, interviewer, scorer, concierge, recruiter, fit, matcher, notes };
writeFileSync(new URL("../agents/ids.json", import.meta.url), JSON.stringify(ids, null, 2) + "\n");
if (oldTimeTool) await el(`/v1/convai/tools/${oldTimeTool.id}`, "DELETE");
console.log("Synced", ids, { briefTool });
