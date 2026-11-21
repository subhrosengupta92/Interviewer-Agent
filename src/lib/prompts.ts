import type { InterviewInput, Plan, Turn } from "./types";

const competencyLines = (input: InterviewInput) =>
  input.competencies
    .map((c) => `- ${c.name} (${c.kind})${c.definition ? `: ${c.definition}` : ""}`)
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
    "Produce the interview plan as JSON.",
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
    `CV claims the interviewer planned to probe:\n${
      plan.claims_to_probe.map((c) => `- ${c.claim} (would be backed by: ${c.specifics_needed.join("; ")})`).join("\n") ||
      "- none"
    }`,
    `<cv>\n${input.cv_text}\n</cv>`,
    `<transcript>\n${transcriptText(turns)}\n</transcript>`,
    "Produce the assessment report as JSON.",
  ].join("\n\n");
}
