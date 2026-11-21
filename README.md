# First Round: AI first-round interviewer

A voice agent that runs a first-round job interview in the browser and gives the hiring manager a scored, quote-backed report. Built for a hackathon on the ElevenLabs Agents platform.

Live: https://interviewer-agent.pages.dev

## How it works

1. **Set up** (`/`): the manager enters the CV, job description, competencies and hard bars. A Planner agent writes an interview plan anchored to the CV, including the claims worth probing.
2. **Interview** (`/interview?id=…`): the candidate talks to the Interviewer agent by voice. It checks hard bars early, drills into claims until it reaches specifics, and closes the call itself.
3. **Report** (`/report?id=…`): a Scorer agent reads the transcript. The report has a score per competency, a verdict per claim, hard-bar flags and an overall score out of 10. Every quote is checked by code against the transcript; a score with no surviving quote becomes "not enough evidence".

The compensation budget is only ever sent to the Scorer. The plan and CV reach the Interviewer through a server-side lookup, never through the candidate's browser.

## Layout

| Path | What it is |
| --- | --- |
| `agents/` | The three agents' prompts and models, and `ids.json` |
| `src/lib/` | Types, validation, quote check, scoring, prompts, ElevenLabs client |
| `src/server/` | API routes (`app.ts`) and the Cloudflare entry point (`worker.ts`) |
| `web/` | The three pages |
| `demo/` | The demo scenario and the persona of the candidate who overstates one claim |
| `scripts/` | `sync-agents`, `simulate`, `dev-server`, `deploy` |
| `docs/superpowers/` | Design and implementation plan |

## Commands

```
npm test              # unit tests
npm run typecheck
npm run build         # browser bundles + dist/_worker.js
npm run sync-agents   # push agents/ to ElevenLabs (needs BASE_URL, TOOL_SECRET)
npm run simulate      # full text-mode run with a simulated candidate, then checks the report
npm run dev           # local server on :8788 against the deployed database
npm run deploy        # build and deploy to Cloudflare Pages
```

Scripts read `ELEVENLABS_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `D1_DATABASE_ID` from the environment.

## Deployment settings (Cloudflare Pages project `interviewer-agent`)

| Name | Kind | Purpose |
| --- | --- | --- |
| `DB` | D1 binding | Interviews, plans and reports |
| `TOOL_SECRET` | Secret | Shared with ElevenLabs so only the Interviewer can call its lookup tools |
| `ELEVENLABS_API_KEY` | Secret | Planning, voice sessions and scoring |

After changing a secret, redeploy for it to take effect.

## Changing the interviewer

Edit the prompt or settings in `agents/` (turn-taking is in `scripts/sync-agents.ts`), run `npm run sync-agents`, then `npm run simulate` to confirm the demo candidate's overstated claim is still marked "not substantiated".
