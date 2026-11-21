import type { Flag, Report } from "./types";

export const HARD_BAR_CAP = 4;

export function flagFor(score: number): Flag {
  if (score >= 7.5) return "green";
  if (score >= 5) return "amber";
  return "red";
}

/** Clamps the overall score, caps it when a hard bar fails, and derives the flag from the result. */
export function finaliseScore(report: Report): Report {
  const round = (n: number) => Math.round(n * 10) / 10;
  const own = round(Math.min(10, Math.max(0, Number(report.overall_score) || 0)));
  let score = own;
  let cap_reason: string | undefined;
  const failed = report.hard_bars.filter((h) => h.status === "not_met").map((h) => h.label);
  if (failed.length && score > HARD_BAR_CAP) {
    score = HARD_BAR_CAP;
    cap_reason = `Capped at ${HARD_BAR_CAP} because a hard bar was not met: ${failed.join(", ")}.`;
  }
  // With no scored competency there is nothing to stand behind a high overall score.
  if (report.competencies.every((c) => c.score === null) && score > HARD_BAR_CAP) {
    score = HARD_BAR_CAP;
    cap_reason = `Capped at ${HARD_BAR_CAP} because no competency had enough evidence to score.`;
  }
  const { score_before_cap: _a, cap_reason: _b, ...rest } = report;
  return {
    ...rest,
    overall_score: score,
    flag: flagFor(score),
    ...(cap_reason ? { score_before_cap: own, cap_reason } : {}),
  };
}
