import type { InterviewInput, Report, Turn } from "../src/lib/types";

export const input: InterviewInput = {
  candidate_name: "Asha Rao",
  role_title: "SDE 1",
  cv_text: "Built the payments retry service at Finlo.",
  job_description: "Backend engineer for checkout.",
  competencies: [
    { name: "System design", kind: "functional" },
    { name: "Ownership", kind: "behavioural", definition: "Takes work to the finish" },
  ],
  hard_bars: { compensation_budget: "up to 18 LPA", location: "Mumbai, in office" },
  minutes: 30,
};

export const turns: Turn[] = [
  { role: "agent", text: "Which part of the retry service did you own?" },
  { role: "candidate", text: "I wrote the back-off scheduler, and I tracked the failed-payment rate; it fell from 4% to 1.5%." },
  { role: "agent", text: "What are your compensation expectations?" },
  { role: "candidate", text: "I am looking for around 25 lakhs per year." },
];

export const report: Report = {
  summary: "Solid on design.",
  overall_score: 8,
  flag: "green",
  hard_bars: [
    { label: "Compensation", status: "not_met", note: "Above budget", quotes: ["I am looking for around 25 lakhs per year"] },
  ],
  competencies: [
    { name: "System design", score: 4, insufficient_evidence: false, rationale: "Specific", quotes: ["I wrote the BACK-OFF scheduler"] },
    { name: "Ownership", score: 5, insufficient_evidence: false, rationale: "Invented", quotes: ["I led the whole migration alone"] },
  ],
  claims: [
    { claim: "Built retry service", verdict: "substantiated", what_was_asked: "Which part", note: "", quotes: ["never said this at all"] },
  ],
  notes: [{ section: "Background", points: ["Worked at Finlo"] }],
};
