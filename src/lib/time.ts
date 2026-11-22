/** What the Interviewer is told about the clock. Sent as a silent context update, not spoken. */
export function timeGuidance(elapsedMin: number, totalMin: number): string {
  const left = totalMin - elapsedMin;
  if (left <= 0) return "Time is up. Close the interview now: thank the candidate, mention next steps, say goodbye, then call end_call.";
  if (left <= Math.max(2, totalMin * 0.15)) return "Wrap up: invite the candidate's questions briefly, then close.";
  if (left <= totalMin * 0.35) return "Finish competencies and claims now, then move to motivation.";
  return "On track. Continue with the plan.";
}

export function timeUpdate(elapsedMin: number, totalMin: number): string {
  return `Time check (do not mention this to the candidate): ${elapsedMin} of ${totalMin} minutes used. ${timeGuidance(elapsedMin, totalMin)}`;
}
