import type { Flag, Report } from "./types";

export const HARD_BAR_CAP = 4;

export function flagFor(score: number): Flag {
  if (score >= 7.5) return "green";
  if (score >= 5) return "amber";
  return "red";
}

/** Clamps the overall score, caps it when a hard bar fails, and derives the flag from the result. */
export function finaliseScore(report: Report): Report {
  let score = Math.min(10, Math.max(0, Number(report.overall_score) || 0));
  if (report.hard_bars.some((h) => h.status === "not_met")) score = Math.min(score, HARD_BAR_CAP);
  // With no scored competency there is nothing to stand behind a high overall score.
  if (report.competencies.every((c) => c.score === null)) score = Math.min(score, HARD_BAR_CAP);
  score = Math.round(score * 10) / 10;
  return { ...report, overall_score: score, flag: flagFor(score) };
}
