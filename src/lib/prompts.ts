import type { InterviewInput, Plan, Scorecard, Turn } from "./types";

/** The scorecard as text, for the Interviewer's brief and the Scorer. Empty for older plans without one. */
export function scorecardText(sc: Scorecard | undefined): string {
  if (!sc) return "";
  return [
    `WHAT GOOD LOOKS LIKE FOR THIS ROLE`,
    sc.bar,
    ...sc.competencies.map(
      (c) =>
        `* ${c.name}\n  Strong evidence: ${c.strong.join("; ")}\n  Weak evidence: ${c.weak.join("; ") || "generalities with no first-hand detail"}`,
    ),
    sc.principles.length ? `How to read what you hear:\n${sc.principles.map((p) => `- ${p}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const competencyLines = (input: InterviewInput) =>
  input.competencies
    .map((c) => `- name: "${c.name}" | type: ${c.kind}${c.definition ? ` | what good looks like: ${c.definition}` : ""}`)
    .join("\n");

/**
 * The Planner never sees the compensation budget: its plan is handed to the Interviewer,
 * and the Interviewer must not be able to say the number.
 */
export function plannerMessage(input: InterviewInput): string {
  const bars = [
    "Compensation expectations (ask what the candidate expects; no figure is given to you)",
    input.hard_bars.location ? `Location requirement: ${input.hard_bars.location}` : null,
    input.hard_bars.other ? `Other requirement: ${input.hard_bars.other}` : null,
  ].filter(Boolean);
  return [
    `Role: ${input.role_title}`,
    `Candidate: ${input.candidate_name}`,
    `Interview length: ${input.minutes} minutes`,
    `Hard bars to check early:\n${bars.map((b) => `- ${b}`).join("\n")}`,
    `Competencies to test:\n${competencyLines(input)}`,
    `<job_description>\n${input.job_description}\n</job_description>`,
    `<cv>\n${input.cv_text}\n</cv>`,
    "Produce the interview plan as JSON. Use each competency name exactly as written inside the quotes.",
  ].join("\n\n");
}

/** What the Interviewer reads at the start of the call. Contains no budget figure. */
export function interviewerBrief(input: InterviewInput, plan: Plan): string {
  const firstName = input.candidate_name.split(/\s+/)[0];
  const budget = Object.entries(plan.time_budget_minutes)
    .map(([k, v]) => `${k}: ${v} min`)
    .join(", ");
  return [
    `INTERVIEW BRIEF`,
    `Candidate: ${input.candidate_name} (call them ${firstName}). Role: ${input.role_title}. Length: ${input.minutes} minutes.`,
    budget ? `Time budget: ${budget}.` : "",
    scorecardText(plan.scorecard),
    plan.opening ? `Opening: ${plan.opening}` : "",
    `Background questions:\n${plan.background_questions.map((q) => `- ${q}`).join("\n")}`,
    `Hard bars (ask within the first five minutes; ask, never state a salary figure):\n${plan.hard_bar_checks
      .map((h) => `- ${h.label}: ${h.question}`)
      .join("\n")}`,
    `Competencies and planned questions:\n${plan.competencies
      .map((c) => {
        const def = input.competencies.find((i) => i.name === c.name)?.definition;
        return `* ${c.name}${def ? ` (${def})` : ""}${c.cv_anchor ? ` — anchor: ${c.cv_anchor}` : ""}\n${c.questions
          .map((q) => `  - ${q}`)
          .join("\n")}`;
      })
      .join("\n")}`,
    `CV claims to probe until you reach specifics:\n${plan.claims_to_probe
      .map((c) => `* ${c.claim}\n  Why: ${c.why_probe}\n  Specifics that would back it up: ${c.specifics_needed.join("; ")}`)
      .join("\n")}`,
    `Motivation questions:\n${plan.motivation_questions.map((q) => `- ${q}`).join("\n")}`,
    `<job_description>\n${input.job_description}\n</job_description>`,
    `<cv>\n${input.cv_text}\n</cv>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function transcriptText(turns: Turn[]): string {
  return turns.map((t, i) => `[${i + 1}] ${t.role === "agent" ? "INTERVIEWER" : "CANDIDATE"}: ${t.text}`).join("\n");
}

export function scorerMessage(input: InterviewInput, plan: Plan, turns: Turn[]): string {
  const bars = [
    `Compensation: budget is ${input.hard_bars.compensation_budget ?? "not specified by the company"}`,
    input.hard_bars.location ? `Location: ${input.hard_bars.location}` : null,
    input.hard_bars.other ? `Other: ${input.hard_bars.other}` : null,
  ].filter(Boolean);
  return [
    `Role: ${input.role_title}`,
    `Candidate: ${input.candidate_name}`,
    `Hard bars:\n${bars.map((b) => `- ${b}`).join("\n")}`,
    `Competencies to score:\n${competencyLines(input)}`,
    scorecardText(plan.scorecard) || "No scorecard was written for this interview; use the general scale.",
    `CV claims the interviewer planned to probe:\n${
      plan.claims_to_probe.map((c) => `- ${c.claim} (would be backed by: ${c.specifics_needed.join("; ")})`).join("\n") ||
      "- none"
    }`,
    `<cv>\n${input.cv_text}\n</cv>`,
    `<transcript>\n${transcriptText(turns)}\n</transcript>`,
    "Produce the assessment report as JSON. Use each competency name exactly as written inside the quotes.",
  ].join("\n\n");
}

/**
 * What the Interviewer works from when the call starts before the written plan is ready:
 * the role, what to test and the CV, with the planning left to the Interviewer.
 */
export function quickBrief(input: InterviewInput): string {
  const firstName = input.candidate_name.split(/\s+/)[0];
  const bars = [
    "Salary: ask what they are hoping for. You do not know the budget and never state a figure.",
    input.hard_bars.location ? `Location: the role is ${input.hard_bars.location}. Ask whether that works.` : null,
    input.hard_bars.other ? `Also check: ${input.hard_bars.other}` : null,
  ].filter(Boolean);
  return [
    `INTERVIEW BRIEF`,
    `Candidate: ${input.candidate_name} (call them ${firstName}). Role: ${input.role_title}. Length: ${input.minutes} minutes.`,
    `There is no prepared question list for this conversation. Read the CV below and plan as you go:`,
    `- Pick the three biggest things this person says they did (large numbers, sole ownership, senior scope) and dig into each until you reach what they personally did, how it worked and how the numbers were measured.`,
    `- For each area below, ask questions anchored to named items on their CV, starting comfortable and getting harder as they answer well.`,
    `Practical points to ask in the first few minutes:\n${bars.map((b) => `- ${b}`).join("\n")}`,
    `What to find out about (never name these to the candidate):\n${input.competencies
      .map((c) => `- ${c.name}${c.definition ? `: ${c.definition}` : ""}`)
      .join("\n")}`,
    `Reading answers fairly: using AI tools, libraries or help from others is normal; what matters is whether they understand what they did and can explain it. Team work is normal; what matters is that they are precise about their own part.`,
    `Then: why this role, why now, where they want to be in five years. Then their questions, then close.`,
    `<job_description>\n${input.job_description}\n</job_description>`,
    `<cv>\n${input.cv_text}\n</cv>`,
  ].join("\n\n");
}

/** A plan with no prepared questions, used for scoring when the written plan never arrived. */
export function emptyPlan(input: InterviewInput): Plan {
  return {
    opening: "",
    background_questions: [],
    hard_bar_checks: [],
    competencies: input.competencies.map((c) => ({ name: c.name, questions: [], cv_anchor: "" })),
    claims_to_probe: [],
    motivation_questions: [],
    time_budget_minutes: {},
  };
}
