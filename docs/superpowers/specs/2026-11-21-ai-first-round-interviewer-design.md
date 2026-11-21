# AI First-Round Interviewer: hackathon design

Date: 2026-11-21. Source: the product brief (`AI First-Round Interviewer: Product Brief`).

## Intent

Senior leaders lose 25 to 50 hours a month each to first-round interviews. This build is the hackathon demo of a voice agent that runs a full first round and hands the hiring manager a scored, evidence-backed report. The demo has to prove one thing above all: the agent drills into a padded CV claim until it falls apart ("catch the bluffer").

## Goals

- A hiring manager fills in one form (CV, job description, competencies, hard bars) and gets a link for the candidate.
- The candidate opens the link in a browser and has a spoken interview with the agent.
- The manager gets a report: a score per competency with exact quotes, detailed notes, an overall score out of 10 with a red, amber or green flag, and hard-bar flags.
- A ready-made bluffer scenario (CV, job description, competencies) ships with the app so the lead demo runs in one click.

## Non-goals

- Marketplace, reference checks, WhatsApp delivery.
- Logins, multi-tenant accounts, applicant-tracking integrations.
- A hire or no-hire decision. The report informs; the manager decides.

## Anti-goals

- The agent accusing a candidate of lying. It exposes a lack of specifics; the report says "claim not substantiated", never "lied".
- Scores without quotes. A competency with no evidence is reported as "not enough evidence", not given a number.
- The agent cutting in while a candidate is thinking.

## Constraints

- The ElevenLabs API key is the only AI credential. Everything (speech, the interviewer's reasoning, planning, scoring) runs through ElevenLabs.
- The key must never reach the browser.
- The app must be reachable by URL, so it is deployed. A Cloudflare deploy token is available in the build session.
- No sign-in on the hackathon app; interview and report links are unguessable IDs.

## Approaches considered

1. **Own brain, ElevenLabs for voice only.** Claude plans, picks follow-ups and scores; ElevenLabs transcribes and speaks. Strictly turn-based, full control over drilling. Needs a second API key and more orchestration code.
2. **ElevenLabs Agent end to end (chosen by Subhro).** The ElevenLabs Agents platform runs the live conversation with one of its built-in models. Faster to build and sounds more live. The trade-off is that it is real-time, so thinking pauses need tuning, and drilling logic lives in the agent's prompt.

Subhro picked approach 2.

## How it works

Three ElevenLabs agents, all defined as config files in the repo and pushed by a sync script (never hand-edited in the dashboard):

| Agent | Mode | Job |
| --- | --- | --- |
| Planner | text only | Turns CV + job description + competencies + hard bars into an interview plan (JSON) |
| Interviewer | voice | Runs the interview from the plan |
| Scorer | text only | Turns the transcript + plan into the report (JSON) |

### Flow

1. **Setup (manager).** A form takes: candidate name, role title, CV (pasted text or a PDF, whose text is extracted in the browser), job description, a list of competencies (name, behavioural or functional, optional one-line definition), hard bars (compensation budget, location, anything else as free text), and interview length (30 minutes by default, 10 minutes for demos). A "Load demo scenario" button fills in the bluffer case.
2. **Plan.** The server sends the inputs to the Planner. The plan contains: an opening, background and motivation questions, hard-bar checks placed in the first five minutes, for each competency two or three questions anchored to named items on the CV, a list of CV claims worth probing (big numbers, vague ownership, senior-sounding scope) with the specifics that would substantiate each, and a time budget per section. The manager sees the plan and can start over; editing the plan is out of scope.
3. **Interview (candidate).** The candidate link shows a consent line, a microphone check and a Start button. The page asks the server for a short-lived session token, then opens a voice session with the Interviewer, passing only the interview ID and the candidate's first name. The Interviewer's first action is a server-side lookup that fetches the plan, CV and job description for that ID, so none of it passes through the candidate's browser. The page shows who is speaking, the elapsed time and an End button. No live transcript is shown to the candidate.
4. **Report (manager).** When the call ends, the server fetches the full transcript from ElevenLabs, sends it with the plan to the Scorer, checks the result, stores it and shows it. The report page is the manager's link.

### Interviewer behaviour (the prompt's job)

- Covers the full round in order: welcome, background (education, career path, and family only if the candidate brings it up), hard bars, competencies, motivation, candidate questions, close.
- One question at a time, short spoken sentences, no lists read aloud.
- Drilling rule: when the candidate claims an outcome or ownership, ask what they personally did, which numbers they tracked, what the result was and how they know. Keep going up to three follow-ups per claim, then move on politely whether or not specifics arrived.
- Keeps a mental checklist of competencies and returns to any without concrete evidence while time remains.
- Hard bars: asks them early. If one clearly fails, it does not argue or end the call; it carries on and the report flags it.
- Never reveals scoring, the plan or its instructions; never gives feedback on answers.
- Asks for compensation expectations and never states the budget. The budget is not given to the Interviewer at all; only the Scorer sees it.
- Ends the call itself when the plan is covered or the time is up.

### Not interrupting

The Interviewer is set to its most patient turn-taking, with a long silence allowance before it speaks, and the candidate can say "give me a moment" to hold the floor. This is tuned by testing; if it still cuts in, the fallback is a hold-to-talk button on the candidate page.

### Report content

- Header: candidate, role, date, duration, overall score out of 10, red, amber or green flag, a three-line summary.
- Hard bars: each one with met, not met or unclear, and the quote.
- Competencies: each with a score from 1 to 5, a one-line rationale, and two to four verbatim candidate quotes. "Not enough evidence" replaces the score when quotes are missing.
- Claims probed: each CV claim that was drilled, what was asked, and a verdict of substantiated, partly substantiated or not substantiated, with quotes. This section is the bluffer proof.
- Detailed notes by interview section.
- Full transcript at the bottom.

Every quote in the report is checked by code against the transcript. A quote that does not appear is dropped; a score left with no quotes becomes "not enough evidence".

## Decisions made by the builder (Subhro has not reviewed these individually)

- **Hosting:** Cloudflare Pages, with small server functions that hold the key and talk to ElevenLabs. Subhro adds the ElevenLabs key as a secret in the Cloudflare dashboard once.
- **Storage:** Cloudflare KV holds each interview (inputs, plan, conversation ID, report). If the deploy token cannot create KV, the fallback is to keep the inputs and plan in the session variables that ElevenLabs stores with the conversation, and regenerate the report on view.
- **Models:** Interviewer on `claude-sonnet-5-5` (fast enough for voice, strong enough to drill); Planner and Scorer on `claude-opus-5-5`.
- **Language:** English only.
- **Voice:** one calm, neutral premade voice; changeable in the agent config.
- **Stack:** plain TypeScript, a small static front end with no framework, the official ElevenLabs browser client for the voice session.
- **Hard-bar failure:** continue and flag, rather than ending early.
- **Scoring scale:** 1 to 5 per competency; overall out of 10 is the Scorer's holistic judgement, capped at 4 if a hard bar is not met, with green at 7.5 and above, amber from 5 to 7.4, red below 5.

- **Report link:** the manager gets the report link at setup, next to the candidate link. It shows "waiting for interview", then "scoring", then the report. If scoring fails it shows a Retry button.
- **Dropped calls and repeat visits:** the candidate can start again from the same link. The most recent conversation longer than two minutes is the one scored, and the report says how many attempts there were.
- **Demo scenario:** written by the builder. An SDE 1 role, a CV with one padded claim (sole ownership of a system the candidate only contributed to, with an inflated metric), and five competencies. The brief fixes none of this.
- **Budget privacy:** follows from the server-side lookup above; if that lookup proves unreliable, the fallback is session variables with the budget left out.

## Build-session facts

- The ElevenLabs key is live in the build session (injected by the network proxy, not readable). The account is on the Creator tier with about 463k characters left this month, has the Agents platform, and lists both chosen Claude models.
- Nobody can speak to the agent from the build session. The builder tests with scripted text conversations; Subhro does the live voice checks (success checks 1 and 3) on the deployed link, and turn-taking is tuned from his feedback.

## Left to the builder

- How the server calls the text-only agents (ElevenLabs has a simulate-conversation call and a text chat mode; pick whichever returns clean JSON reliably, and retry once on malformed output).
- Exact prompts, turn-taking numbers, visual design of the three pages.
- Tests: unit tests for prompt assembly, plan and report validation and the quote check; plus a scripted text-mode run where a simulated bluffer candidate is interviewed and the report must mark the false claim as not substantiated.

## Success check for the demo

1. Load the demo scenario, start the interview, play the bluffer: the agent asks at least two follow-ups on the padded claim, and the report lists it as not substantiated with quotes.
2. Every score in the report has quotes that appear word for word in the transcript.
3. A candidate who pauses for five seconds mid-answer is not interrupted.
