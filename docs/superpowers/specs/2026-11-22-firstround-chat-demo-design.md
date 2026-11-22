# FirstRound chat demo: design

Date: 2026-11-22. For a tech-conference demo. Builds on the existing interviewer (plan, voice interview, scored report).

## Intent

Show FirstRound as a product people already know how to use: a chat. A candidate or a recruiter messages FirstRound, by text or voice note, and everything else happens from that conversation. The demo must work live, with real AI replies, in front of an audience.

## What the audience sees

A white page with a phone in the centre. Inside it, a messaging app with FirstRound's own logo and colours: bubbles, ticks, typing indicator, voice-note waveforms, a call screen. It is a familiar chat-app look, not a copy of WhatsApp's branding. Documents (role details, feedback, job description, candidate fit) open as clean one-page web pages in a new browser tab.

Three entry points:
- `/chat` — a candidate who found FirstRound themselves (self-discovery)
- `/chat?invite=<code>` — a candidate invited by a company for one role
- `/recruit` — a recruiter

## Candidate flow

1. Candidate says "Hi" (typed or voice note).
2. FirstRound greets them, asks for their LinkedIn profile link, and offers to join the network (a button in the chat).
3. On joining, it asks for a CV (PDF upload in the chat).
4. It reads the CV. Invited candidates go straight to the role they were invited for. Self-discovery candidates are matched to the best-fitting open role and told which one.
5. A call comes in on the phone screen: ringing, accept, then the live voice interview with the interviewer for that role.
6. After the call, FirstRound says thanks in the chat.
   - Invited: "we'll come back to you shortly".
   - Self-discovery: shows at most three matching open roles as cards. "See details" opens the role page in a new tab, where Apply applies. Asking for more shows the next three.
7. A minute or two later it sends a feedback document: five pointers on how to improve, each with something to read or watch. Short.

Throughout, the candidate can ask questions in the chat. FirstRound answers as a member of the hiring team, and says "I'll check internally and get back to you" when it does not know.

## Recruiter flow

1. Recruiter opens the chat (demo sign-in: a name and company, already filled in) and says, by text or voice note, that they are hiring for a role. FirstRound asks for a job description if they have one.
2. It asks five or six clarifying questions, one at a time, skipping anything already covered: salary, location, must-haves, team, timeline.
3. It writes the job description and sends it as a document.
4. It shows five candidates as cards. Each links to a one-page fit document: seven short pointers on why they fit, drawn from their first-round interview.
5. If the recruiter does not like them and says why, FirstRound states what it has learned ("Noted: needs payments experience, no notice period over 30 days") and sends a new set that respects it. This repeats.
6. Connect: FirstRound creates a group chat with the recruiter and the candidate, which opens on the phone.

## How it works

- **Chat brains:** two new text agents on ElevenLabs, Concierge (candidate) and Recruiter, on the same model as the Scorer. Each reply is a small JSON object: what to say, plus an optional action for the phone to show (join button, CV request, start call, role cards, candidate cards, document link, group chat). The server keeps the conversation and the phone only renders.
- **Voice notes:** recorded in the browser, transcribed by ElevenLabs, shown as a voice-note bubble with the transcript underneath, and sent to the agent as text.
- **The call:** the existing voice interviewer, shown as an incoming call inside the phone.
- **Role-specialised interviewers:** each role has a stored scorecard (what good looks like). If a role has none, it is written on the fly the first time and kept. The candidate's own plan is then built from that scorecard and their CV. Target: under 30 seconds from CV to incoming call, with the chat talking through the wait.
- **Feedback document:** written by the Scorer from the real call.
- **Demo data:** 10 open roles across engineering, product, data, marketing and design; about 12 pre-interviewed candidates with first-round results for the recruiter side; two invite codes (one is SDE-II at a named demo company). Real interviews done during the demo also join the candidate pool.

## Decisions made by the builder

- Mock sign-in, mock LinkedIn (the link is accepted, not fetched), mock group chat (no real people are messaged).
- The chat replies in text. Voice notes are for the user's side.
- English for the chat; the interview call keeps its language choice.
- The existing setup and report pages stay as they are, as the "engine room" view.
- Live AI means replies take one to three seconds, and can vary between runs. A "reset demo" control clears the conversation.

## Not in this build

Real WhatsApp, real phone calls, real LinkedIn, real accounts, the integrity checks discussed earlier.

## Success check

- A candidate can go from "Hi" to a finished interview, three role cards and a feedback document without leaving the phone frame, using only voice notes.
- A recruiter can go from "I'm hiring an SDE-II" to five candidates, reject them with a reason, get a better five, and open a group chat.
- The interviewer never uses the phrases in `agents/do-not-say.md`.
