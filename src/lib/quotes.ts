import type { Report, Turn } from "./types";

const MIN_WORDS = 4;

/** Lower-case, strip punctuation, collapse whitespace, so transcription quirks do not break matching. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the quote appears, word for word, in something the candidate said. */
export function quoteInTranscript(quote: string, turns: Turn[]): boolean {
  const q = normalise(quote.replace(/\.\.\.|…/g, " "));
  if (q.split(" ").filter(Boolean).length < MIN_WORDS) return false;
  return turns.some((t) => t.role === "candidate" && normalise(t.text).includes(q));
}

/** Drops quotes that are not in the transcript; a competency left with none loses its score. */
export function enforceEvidence(report: Report, turns: Turn[]): Report {
  const keep = (quotes: string[]) => (quotes ?? []).filter((q) => quoteInTranscript(q, turns));
  return {
    ...report,
    hard_bars: report.hard_bars.map((h) => {
      const quotes = keep(h.quotes);
      // A hard bar judged without a quote cannot be called met or not met.
      return { ...h, quotes, status: quotes.length ? h.status : "unclear" };
    }),
    competencies: report.competencies.map((c) => {
      const quotes = keep(c.quotes);
      return quotes.length
        ? { ...c, quotes, insufficient_evidence: false }
        : { ...c, quotes, score: null, insufficient_evidence: true };
    }),
    claims: report.claims.map((c) => {
      const quotes = keep(c.quotes);
      // "Substantiated" needs the candidate's own words; absence of evidence is the weaker verdict.
      const verdict = !quotes.length && c.verdict === "substantiated" ? "partly_substantiated" : c.verdict;
      return { ...c, quotes, verdict };
    }),
  };
}
