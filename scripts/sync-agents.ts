/**
 * Creates or updates the three ElevenLabs agents and the Interviewer's two lookup tools
 * from the config in agents/. Run: BASE_URL=https://… TOOL_SECRET=… npm run sync-agents
 */
import { writeFileSync } from "node:fs";
import {
  INTERVIEWER_FIRST_MESSAGE,
  INTERVIEWER_MODEL,
  INTERVIEWER_PROMPT,
  INTERVIEWER_VOICE_ID,
} from "../agents/interviewer";
import { PLANNER_MODEL, PLANNER_PROMPT } from "../agents/planner";
import { DEFAULT_VOICE } from "../src/lib/voices";
import { SCORER_MODEL, SCORER_PROMPT } from "../agents/scorer";
import { el } from "./eleven-admin";

const PREFIX = "interviewer-agent/";
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
    agent: { first_message: "", language: "en", prompt: { prompt, llm, temperature: 0, max_tokens: 16000 } },
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
const interviewer = await upsertAgent(`${PREFIX}interviewer`, {
  conversation_config: {
    turn: {
      // Normal turn-taking, with the reply prepared during the pause so it starts sooner.
      // "patient" waited noticeably longer after every answer; go back to it if the agent cuts in.
      turn_eagerness: "normal",
      turn_timeout: 20,
      speculative_turn: true,
      silence_end_call_timeout: 180,
    },
    tts: { voice_id: INTERVIEWER_VOICE_ID, speed: 1.03, expressive_mode: true },
    conversation: { max_duration_seconds: 35 * 60 },
    agent: {
      first_message: INTERVIEWER_FIRST_MESSAGE,
      language: "en",
      disable_first_message_interruptions: true,
      max_conversation_duration_message:
        "We're out of time, so I'll stop here. Thank you for speaking with me today; the hiring team will be in touch about next steps. Goodbye.",
      dynamic_variables: {
        dynamic_variable_placeholders: {
          interview_id: "missing",
          interviewer_name: DEFAULT_VOICE.name,
          candidate_first_name: "there",
          role_title: "open",
          minutes: 30,
        },
      },
      prompt: {
        prompt: INTERVIEWER_PROMPT,
        llm: INTERVIEWER_MODEL,
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
    // The browser may choose the voice for a call; nothing else about the agent can be overridden.
    overrides: { conversation_config_override: { tts: { voice_id: true } } },
  },
});

const ids = { planner, interviewer, scorer };
writeFileSync(new URL("../agents/ids.json", import.meta.url), JSON.stringify(ids, null, 2) + "\n");
if (oldTimeTool) await el(`/v1/convai/tools/${oldTimeTool.id}`, "DELETE");
console.log("Synced", ids, { briefTool });
