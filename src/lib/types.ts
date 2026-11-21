export type CompetencyKind = "behavioural" | "functional";

export interface Competency {
  name: string;
  kind: CompetencyKind;
  definition?: string;
}

export interface HardBars {
  /** What the company can pay. Never shown to the candidate or the Interviewer. */
  compensation_budget?: string;
  location?: string;
  other?: string;
}

export interface InterviewInput {
  candidate_name: string;
  role_title: string;
  cv_text: string;
  job_description: string;
  competencies: Competency[];
  hard_bars: HardBars;
  minutes: 10 | 30;
  /** Which voice the interviewer uses; absent on older interviews. */
  voice_id?: string;
}

export interface PlanClaim {
  id: string;
  claim: string;
  why_probe: string;
  specifics_needed: string[];
}

export interface PlanCompetency {
  name: string;
  questions: string[];
  cv_anchor: string;
}

export interface PlanHardBar {
  id: string;
  label: string;
  question: string;
}

/** What good looks like for one competency, at this role's level, written before the interview. */
export interface CompetencyBar {
  name: string;
  strong: string[];
  weak: string[];
}

/** The hiring manager's view of the role, fixed before anyone reads the transcript. */
export interface Scorecard {
  /** What a strong hire at this level would be doing six months in. */
  bar: string;
  competencies: CompetencyBar[];
  /** How to read common situations fairly, e.g. AI coding tools, team projects, short tenure. */
  principles: string[];
}

export interface Plan {
  /** Absent on interviews planned before scorecards existed. */
  scorecard?: Scorecard;
  opening: string;
  background_questions: string[];
  hard_bar_checks: PlanHardBar[];
  competencies: PlanCompetency[];
  claims_to_probe: PlanClaim[];
  motivation_questions: string[];
  time_budget_minutes: Record<string, number>;
}

export interface Turn {
  role: "agent" | "candidate";
  text: string;
  at_secs?: number;
}

export type HardBarStatus = "met" | "not_met" | "unclear";
export type ClaimVerdict = "substantiated" | "partly_substantiated" | "not_substantiated" | "not_probed";
export type Flag = "green" | "amber" | "red";

export interface Report {
  summary: string;
  overall_score: number;
  /** The Scorer's own number, when a rule lowered it; otherwise absent. */
  score_before_cap?: number;
  cap_reason?: string;
  flag: Flag;
  hard_bars: { label: string; status: HardBarStatus; note: string; quotes: string[] }[];
  competencies: {
    name: string;
    score: number | null;
    insufficient_evidence: boolean;
    rationale: string;
    quotes: string[];
  }[];
  claims: {
    claim: string;
    verdict: ClaimVerdict;
    what_was_asked: string;
    note: string;
    quotes: string[];
  }[];
  notes: { section: string; points: string[] }[];
}

export type Status =
  | "planning"
  | "ready"
  | "in_progress"
  | "scoring"
  | "done"
  | "plan_failed"
  | "score_failed"
  | "too_short";

export interface Interview {
  id: string;
  created_at: number;
  status: Status;
  input: InterviewInput;
  plan: Plan | null;
  report: Report | null;
  turns: Turn[] | null;
  /** ElevenLabs conversation running the Planner or Scorer in the background. */
  job_conversation_id: string | null;
  job_started_at: number | null;
  job_attempts: number;
  /** When the candidate last started a voice session (ms). */
  started_at: number | null;
  /** Voice conversations, oldest first. */
  conversation_ids: string[];
  duration_secs: number | null;
  error: string | null;
}
