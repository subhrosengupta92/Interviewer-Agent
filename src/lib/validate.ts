import { LANGUAGES, VOICES } from "./voices";
import type { ClaimVerdict, HardBarStatus, InterviewInput, Plan, Report } from "./types";

export class ValidationError extends Error {}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown) => arr(v).map(str).filter(Boolean);
/** Models sometimes decorate a name ("Ownership (behavioural)"); compare on the bare name. */
const bare = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const sameName = (a: string, b: string) => bare(a) === bare(b);

const MAX_CV = 40_000;
const MAX_JD = 20_000;

export function validateInput(raw: unknown): InterviewInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const fail = (m: string): never => {
    throw new ValidationError(m);
  };
  const candidate_name = str(r.candidate_name) || fail("Candidate name is required.");
  const role_title = str(r.role_title) || fail("Role title is required.");
  const cv_text = str(r.cv_text) || fail("The CV is empty. If the PDF is a scan, paste the CV text instead.");
  const job_description = str(r.job_description) || fail("Job description is required.");
  if (cv_text.length > MAX_CV) fail("The CV is too long (limit 40,000 characters).");
  if (job_description.length > MAX_JD) fail("The job description is too long (limit 20,000 characters).");
  const competencies = arr(r.competencies)
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      const kind = o.kind === "behavioural" ? ("behavioural" as const) : ("functional" as const);
      const definition = str(o.definition);
      return { name: str(o.name), kind, ...(definition ? { definition } : {}) };
    })
    .filter((c) => c.name);
  if (!competencies.length) fail("Add at least one competency.");
  if (competencies.length > 10) fail("Use at most 10 competencies.");
  if (new Set(competencies.map((c) => c.name.toLowerCase())).size !== competencies.length)
    fail("Competency names must be different from each other.");
  const minutes = Number(r.minutes);
  if (minutes !== 10 && minutes !== 30) fail("Interview length must be 10 or 30 minutes.");
  const hb = (r.hard_bars ?? {}) as Record<string, unknown>;
  const hard_bars = {
    ...(str(hb.compensation_budget) ? { compensation_budget: str(hb.compensation_budget) } : {}),
    ...(str(hb.location) ? { location: str(hb.location) } : {}),
    ...(str(hb.other) ? { other: str(hb.other) } : {}),
  };
  const voice = VOICES.find((v) => v.id === r.voice_id);
  const language = LANGUAGES.find((l) => l.code === r.language);
  return {
    candidate_name,
    role_title,
    cv_text,
    job_description,
    competencies,
    hard_bars,
    minutes: minutes as 10 | 30,
    ...(voice ? { voice_id: voice.id } : {}),
    ...(language && language.code !== "en" ? { language: language.code } : {}),
  };
}

/** Normalises the Planner's output and makes sure every competency from the form has questions. */
export function validatePlan(raw: unknown, input: InterviewInput): Plan {
  const r = (raw ?? {}) as Record<string, unknown>;
  const planned = arr(r.competencies).map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return { name: str(o.name), questions: strs(o.questions), cv_anchor: str(o.cv_anchor) };
  });
  const competencies = input.competencies.map((c) => {
    const hit = planned.find((p) => sameName(p.name, c.name));
    if (!hit || !hit.questions.length) throw new ValidationError(`Plan has no questions for "${c.name}".`);
    return { ...hit, name: c.name };
  });
  const sc = (r.scorecard ?? {}) as Record<string, unknown>;
  const bars = arr(sc.competencies).map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return { name: str(o.name), strong: strs(o.strong), weak: strs(o.weak) };
  });
  const scorecard = {
    bar: str(sc.bar),
    competencies: input.competencies.map((c) => {
      const hit = bars.find((b) => sameName(b.name, c.name));
      if (!hit || !hit.strong.length) throw new ValidationError(`Scorecard does not say what good looks like for "${c.name}".`);
      return { ...hit, name: c.name };
    }),
    principles: strs(sc.principles),
  };
  const budget: Record<string, number> = {};
  for (const [k, v] of Object.entries((r.time_budget_minutes ?? {}) as Record<string, unknown>)) {
    if (Number.isFinite(Number(v))) budget[k] = Number(v);
  }
  return {
    scorecard,
    opening: str(r.opening),
    background_questions: strs(r.background_questions),
    hard_bar_checks: arr(r.hard_bar_checks)
      .map((h, i) => {
        const o = (h ?? {}) as Record<string, unknown>;
        return { id: str(o.id) || `hb${i + 1}`, label: str(o.label), question: str(o.question) };
      })
      .filter((h) => h.label && h.question),
    competencies,
    claims_to_probe: arr(r.claims_to_probe)
      .map((c, i) => {
        const o = (c ?? {}) as Record<string, unknown>;
        return {
          id: str(o.id) || `c${i + 1}`,
          claim: str(o.claim),
          why_probe: str(o.why_probe),
          specifics_needed: strs(o.specifics_needed),
        };
      })
      .filter((c) => c.claim),
    motivation_questions: strs(r.motivation_questions),
    time_budget_minutes: budget,
  };
}

const HARD_BAR: HardBarStatus[] = ["met", "not_met", "unclear"];
const VERDICTS: ClaimVerdict[] = ["substantiated", "partly_substantiated", "not_substantiated", "not_probed"];

/** Normalises the Scorer's output. Scores outside 1 to 5 become "not enough evidence". */
export function validateReport(raw: unknown, input: InterviewInput): Report {
  const r = (raw ?? {}) as Record<string, unknown>;
  const scored = arr(r.competencies).map((c) => (c ?? {}) as Record<string, unknown>);
  const competencies = input.competencies.map((c) => {
    const o = scored.find((s) => sameName(str(s.name), c.name)) ?? {};
    const n = Number(o.score);
    const score = o.score !== null && Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : null;
    return {
      name: c.name,
      score,
      insufficient_evidence: score === null,
      rationale: str(o.rationale),
      quotes: strs(o.quotes),
    };
  });
  const overall = Number(r.overall_score);
  if (!Number.isFinite(overall)) throw new ValidationError("Report has no overall score.");
  return {
    summary: str(r.summary),
    overall_score: overall,
    flag: "red",
    hard_bars: arr(r.hard_bars)
      .map((h) => {
        const o = (h ?? {}) as Record<string, unknown>;
        const status = HARD_BAR.includes(o.status as HardBarStatus) ? (o.status as HardBarStatus) : "unclear";
        return { label: str(o.label), status, note: str(o.note), quotes: strs(o.quotes) };
      })
      .filter((h) => h.label),
    competencies,
    claims: arr(r.claims)
      .map((c) => {
        const o = (c ?? {}) as Record<string, unknown>;
        const verdict = VERDICTS.includes(o.verdict as ClaimVerdict) ? (o.verdict as ClaimVerdict) : "not_probed";
        return {
          claim: str(o.claim),
          verdict,
          what_was_asked: str(o.what_was_asked),
          note: str(o.note),
          quotes: strs(o.quotes),
        };
      })
      .filter((c) => c.claim),
    notes: arr(r.notes)
      .map((n) => {
        const o = (n ?? {}) as Record<string, unknown>;
        return { section: str(o.section), points: strs(o.points) };
      })
      .filter((n) => n.section && n.points.length),
  };
}
