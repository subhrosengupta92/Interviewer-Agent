# FirstRound: the Agentic Hiring Factory

FirstRound is a set of AI agents that take a hiring team from a brief to a shortlist. The team says who it needs. Agents write the job description, interview every candidate by voice on the subject of the role, score and write up each interview, and answer questions across the transcripts.

**Live:** https://interviewer-agent.pages.dev

Built on the ElevenLabs Agents platform (voice and text agents) and Cloudflare Pages with a D1 database.

## Why it exists

> "I took 30+ first rounds a month. That was 30 to 40 hours."
> "We handed it to Talent Acquisition. But TAs are generalists. They couldn't take subject-specific interviews."

A first round has to test the subject itself: the engineering, the deal work, the modelling. FirstRound's interviewer does that for every candidate, and the hiring team gets the hours back.

## What you can do in the app

| Screen | Path | Who it is for | What happens |
| --- | --- | --- | --- |
| Home page | `/` | Anyone | The pitch, with an animated view of the five agents. Every button opens the hiring-team chat. |
| Hiring team | `/recruit` | Recruiter or hiring manager | Brief FirstRound by text, voice note or a discovery call. It writes the job description, shows candidates and sets up introductions. |
| Job description | `/jd?id=…` | Candidates (public link) | The role, a **Share** button, and **Do the first round**, which starts a voice interview for that exact role. |
| Invited candidate | `/chat?jd=…` or `/chat?invite=…` | Candidate | A chat that leads to a ten-minute voice interview. The call button starts the interview straight away. |
| Role screen | `/room?chat=…` | Hiring team | Everyone interviewed for one role, with scores, strengths and things to check, and an "Ask the notes" box. |
| Dashboard | `/dashboard` | Hiring team | A desktop screen: pick several interviews, compare scores by area, read any transcript, and ask questions across the selection. Ships with two sample roles. |
| Report | `/report?id=…` | Hiring team | One interview in full: scores, quotes, claim checks and the transcript. |
| Fit page | `/fit?chat=…&c=…` | Hiring team | Seven pointers on why a candidate fits, with their interview notes. |
| Set-up form | `/setup` | Demo use | The original form for running a single interview from a pasted CV and job description. |

The app's top-right switcher moves between **Hiring team**, **Invited candidate** and **Dashboard**.

## The flow, end to end

```
Hiring team                                Candidates
-----------                                ----------
1. Brief (chat, voice note or call)
2. Job description written  ── Share ───▶  3. Open the link, "Do the first round"
                                           4. Ten-minute voice interview on the subject
5. Interview scored and written up  ◀──────┘
6. Role screen / Dashboard: compare people, read transcripts, ask questions
7. Connect with a candidate
```

## The agents

Every agent is an ElevenLabs agent. Prompts and models live in `agents/`; the live agent IDs are in `agents/ids.json`.

| Agent | Kind | File | Job |
| --- | --- | --- | --- |
| Discovery | Voice | `agents/discovery.ts` | A five-minute call with the hiring team about who they want to hire. |
| Recruiter | Text | `agents/recruiter.ts` | The hiring-team chat: asks what is missing, writes the job description and what to test, picks candidates, sets up introductions. |
| Concierge | Text | `agents/concierge.ts` | The candidate chat: greets, collects the CV, starts the interview, follows up afterwards. |
| Matcher | Text | `agents/matcher.ts` | Scores open roles against a CV. |
| Planner | Text | `agents/planner.ts` | Writes the interview plan from the CV and role, including the claims worth probing. |
| Interviewer | Voice | `agents/interviewer.ts` | Runs the first round. Checks practical points early, digs into claims until it reaches specifics, and ends the call itself. |
| Scorer | Text | `agents/scorer.ts` | Reads the transcript and writes the report: a score per area, a verdict per claim, notes, and feedback for the candidate. |
| Fit writer, Notes writer | Text | `agents/recruiter.ts` | Write the fit pointers and interview notes for network candidates. |
| Analyst | Text | `agents/analyst.ts` | Answers the hiring team's questions from interview notes and transcripts (role screen and dashboard). |

Safeguards built into the code, not left to the prompts:

- **Quotes are checked.** Every quote in a report is compared with the transcript; a score with no surviving quote becomes "not enough evidence" (`src/lib/quotes.ts`).
- **The budget stays private.** The company's compensation budget is only sent to the Scorer. The interviewer never knows it.
- **Candidates never see the plan.** The plan and CV reach the Interviewer through a server-side lookup protected by a shared secret, not through the browser.
- **Shared links hide the hiring team's chat.** A job description link carries its own public ID, and candidates cannot read the team's chat or candidate list from it.

## Repository layout

| Path | What it holds |
| --- | --- |
| `agents/` | Prompts, models and settings for each agent, and `ids.json`. `do-not-say.md` is the interviewer's list of phrases to avoid. |
| `src/server/app.ts` | The API router, and the interview lifecycle (plan, call, score). |
| `src/server/chat.ts` | The candidate chat, including interviews started from the call button or from a shared job description. |
| `src/server/recruit.ts` | The hiring-team chat, discovery calls, shared job descriptions and the role screen. |
| `src/server/dashboard.ts` | The dashboard API: listing interviews, reading a transcript, asking across several. |
| `src/server/worker.ts` | The Cloudflare Pages entry point. Serves the pages and routes `/api/*`. |
| `src/server/d1-store.ts` | The database store. Interviews and chats share one table. |
| `src/lib/` | Types, validation, the quote check, scoring rules, prompt builders, voices and the ElevenLabs client. |
| `src/data/roles.ts` | Open roles and demo invitations. |
| `src/data/candidates.ts` | The demo candidate network. |
| `src/data/samples.ts` | The dashboard's two sample roles and their eight interview transcripts. |
| `web/` | Pages (`*.html`), styles (`*.css`) and browser code (`web/src/*.ts`). |
| `web/src/voice.ts` | Joining a voice call: WebRTC first, WebSocket as a fallback. |
| `tests/` | Unit tests for the API, the libraries and the ElevenLabs client. |
| `scripts/` | `sync-agents`, `simulate`, `dev-server` and `deploy`. |
| `demo/` | A scripted candidate who overstates one claim, used by `simulate`. |
| `docs/superpowers/` | The original design documents and implementation plan. |

## API

All routes are under `/api`.

| Route | Purpose |
| --- | --- |
| `POST /recruit` · `POST /recruit/:id/message` | Open the hiring-team chat; send a message. |
| `POST /recruit/:id/call` · `POST /recruit/:id/call/complete` | Start a discovery call; write it up when it ends. |
| `GET /recruit/:id/jd` · `GET /jd/:shareId` | The job description for the team; the same as candidates see it. |
| `GET /recruit/:id/room` · `POST /recruit/:id/room/ask` | Everyone interviewed for the role; a question over their notes. |
| `GET /recruit/:id/fit/:candidateId` | Fit pointers and interview notes for one candidate. |
| `POST /chat` · `POST /chat/:id/message` · `POST /chat/:id/call` | Open the candidate chat (optionally from a job description); send a message; go straight to the interview. |
| `POST /interviews` · `GET /interviews/:id` | Create an interview; read it with its plan and report. |
| `POST /interviews/:id/session` · `POST /interviews/:id/complete` | Get a voice session; mark the call finished so it is scored. |
| `GET /interviews/:id/candidate` · `GET /interviews/:id/feedback` | What the candidate may see before and after the call. |
| `GET /dashboard` · `GET /dashboard/transcript/:id` · `POST /dashboard/ask` | Roles and interviews; one transcript; a question across selected transcripts. |
| `POST /transcribe` | Speech to text for voice notes. |
| `GET /tool/brief` | The interviewer's server-side lookup (needs the tool secret). |

## Commands

```bash
npm test              # unit tests
```

```bash
npm run typecheck     # server, browser and script code
```

```bash
npm run build         # browser bundles, then dist/_worker.js with the pages embedded
```

```bash
npm run dev           # local server on :8788 against the deployed database
```

```bash
npm run deploy        # build and deploy to Cloudflare Pages
```

```bash
npm run sync-agents   # push agents/ to ElevenLabs (needs BASE_URL and TOOL_SECRET)
```

```bash
npm run simulate      # a full text-mode run with a scripted candidate, then checks the report
```

Scripts read `ELEVENLABS_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `D1_DATABASE_ID` from the environment.

## Deployment settings

Cloudflare Pages project `interviewer-agent`:

| Name | Kind | Purpose |
| --- | --- | --- |
| `DB` | D1 binding | Interviews, plans, reports and chats |
| `ELEVENLABS_API_KEY` | Secret | All agent calls, voice sessions and transcription |
| `TOOL_SECRET` | Secret | Shared with ElevenLabs so only the Interviewer can call its lookup |

After changing a secret, redeploy for it to take effect.

## Changing an agent

1. Edit its prompt or settings in `agents/` (voice turn-taking is in `scripts/sync-agents.ts` and `agents/discovery.ts`).
2. Run `npm run sync-agents` to push it to ElevenLabs. A new agent's ID is written to `agents/ids.json`; commit that file.
3. Run `npm run simulate` to confirm the scripted candidate's overstated claim is still marked "not substantiated".

## Demo data

The candidate network, the open roles, the invitations and the dashboard's sample transcripts are invented for demonstration. None of those people or companies exist. Interviews done through the app are real recordings of whoever took the call, and are stored in the database.
