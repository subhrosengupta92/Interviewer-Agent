import { describe, expect, it } from "vitest";
import { extractJson } from "../src/lib/json";
import { enforceEvidence, quoteInTranscript } from "../src/lib/quotes";
import { finaliseScore, flagFor } from "../src/lib/scoring";
import { validateInput, validatePlan, validateReport } from "../src/lib/validate";
import { input, report, turns } from "./fixtures";

describe("extractJson", () => {
  it("reads bare, fenced and prose-wrapped JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here is the plan:\n{"a":{"b":2}}\nHope that helps.')).toEqual({ a: { b: 2 } });
  });
  it("throws when there is no object", () => {
    expect(() => extractJson("sorry, I cannot")).toThrow();
    expect(() => extractJson("[1,2]")).toThrow();
  });
});

describe("quoteInTranscript", () => {
  it("matches across case, punctuation and spacing", () => {
    expect(quoteInTranscript("i wrote the back off   scheduler", turns)).toBe(true);
    expect(quoteInTranscript("it fell from 4% to 1.5%", turns)).toBe(true);
  });
  it("only matches what the candidate said", () => {
    expect(quoteInTranscript("Which part of the retry service did you own", turns)).toBe(false);
  });
  it("rejects quotes shorter than four words and invented quotes", () => {
    expect(quoteInTranscript("I wrote the", turns)).toBe(false);
    expect(quoteInTranscript("I led the whole migration alone", turns)).toBe(false);
  });
});

describe("enforceEvidence", () => {
  const out = enforceEvidence(report, turns);
  it("keeps real quotes and their score", () => {
    expect(out.competencies[0]).toMatchObject({ score: 4, insufficient_evidence: false });
    expect(out.competencies[0].quotes).toHaveLength(1);
  });
  it("removes the score when no quote survives", () => {
    expect(out.competencies[1]).toMatchObject({ score: null, insufficient_evidence: true, quotes: [] });
  });
  it("downgrades a substantiated claim that has no surviving quote", () => {
    expect(out.claims[0].verdict).toBe("partly_substantiated");
  });
  it("marks a hard bar unclear when its quote is missing", () => {
    const r = enforceEvidence({ ...report, hard_bars: [{ ...report.hard_bars[0], quotes: ["made up words here now"] }] }, turns);
    expect(r.hard_bars[0].status).toBe("unclear");
  });
});

describe("scoring", () => {
  it("flags by threshold", () => {
    expect(flagFor(7.5)).toBe("green");
    expect(flagFor(7.4)).toBe("amber");
    expect(flagFor(5)).toBe("amber");
    expect(flagFor(4.9)).toBe("red");
  });
  it("caps the overall score at 4 when a hard bar is not met", () => {
    expect(finaliseScore(report)).toMatchObject({ overall_score: 4, flag: "red" });
  });
  it("leaves the score alone when hard bars are fine", () => {
    const ok = { ...report, hard_bars: [{ ...report.hard_bars[0], status: "met" as const }] };
    expect(finaliseScore(ok)).toMatchObject({ overall_score: 8, flag: "green" });
  });
  it("caps when nothing could be scored", () => {
    const none = { ...report, hard_bars: [], competencies: report.competencies.map((c) => ({ ...c, score: null })) };
    expect(finaliseScore(none).overall_score).toBe(4);
  });
});

describe("validateInput", () => {
  it("accepts a complete form", () => {
    expect(validateInput(input)).toEqual(input);
  });
  it.each([
    [{ ...input, cv_text: "  " }, /CV is empty/],
    [{ ...input, competencies: [] }, /at least one competency/],
    [{ ...input, minutes: 20 }, /10 or 30/],
    [{ ...input, candidate_name: "" }, /Candidate name/],
    [{ ...input, competencies: [input.competencies[0], { ...input.competencies[0], name: "system DESIGN" }] }, /different/],
  ])("rejects bad input %#", (bad, msg) => {
    expect(() => validateInput(bad)).toThrow(msg);
  });
});

describe("validatePlan and validateReport", () => {
  it("requires questions for every competency", () => {
    expect(() => validatePlan({ competencies: [{ name: "System design", questions: ["q"] }] }, input)).toThrow(/Ownership/);
  });
  it("turns out-of-range scores into not enough evidence", () => {
    const r = validateReport({ overall_score: 6, competencies: [{ name: "system design", score: 9, quotes: [] }] }, input);
    expect(r.competencies[0]).toMatchObject({ name: "System design", score: null, insufficient_evidence: true });
    expect(r.competencies[1].score).toBeNull();
  });
  it("rejects a report without an overall score", () => {
    expect(() => validateReport({ competencies: [] }, input)).toThrow(/overall score/);
  });
});
