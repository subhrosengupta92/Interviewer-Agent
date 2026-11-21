import type { InterviewInput } from "../src/lib/types";

/**
 * The lead demo: an SDE 1 candidate whose CV overstates one thing.
 * The CV says he designed and built the fraud-scoring service alone and cut fraud losses by 62%.
 * In truth (see demo/bluffer-persona.ts) he joined after it was live and wrote its dashboards and tests.
 */
export const demoScenario: InterviewInput = {
  candidate_name: "Rohan Mehta",
  role_title: "Software Development Engineer 1 (Backend)",
  minutes: 10,
  hard_bars: {
    compensation_budget: "Up to ₹18 lakh per year fixed",
    location: "Mumbai, five days a week in the office",
  },
  competencies: [
    { name: "Backend system design", kind: "functional", definition: "Designs services that stay correct and fast under load; can explain trade-offs" },
    { name: "Coding and debugging depth", kind: "functional", definition: "Knows their own code and can reason through a production failure" },
    { name: "Data and metrics literacy", kind: "functional", definition: "Knows how the numbers they quote were measured" },
    { name: "Ownership", kind: "behavioural", definition: "Takes a problem to the finish and is precise about their own part" },
    { name: "Learning agility", kind: "behavioural", definition: "Picks up unfamiliar areas quickly and seeks feedback" },
  ],
  job_description: `Software Development Engineer 1, Backend — Checkout and Payments

We are a consumer health and wellness company selling direct to customers across India. The checkout and payments team owns order placement, payment routing, refunds and fraud controls for roughly 60,000 orders a day.

What you will do
- Build and run backend services in Java or Go on AWS, with PostgreSQL, Redis and Kafka.
- Own features end to end: design, code, tests, rollout, on-call.
- Improve payment success rate and reduce cash-on-delivery returns and fraud.
- Write clear design notes and review other engineers' code.

What we look for
- One to three years of backend experience on a production system with real traffic.
- Solid grasp of data structures, SQL, API design and concurrency basics.
- Evidence that you have debugged production issues yourself.
- Clear, honest communication about what you did and what the team did.

Location: Mumbai, in the office five days a week.`,
  cv_text: `ROHAN MEHTA
Backend Engineer · Pune · rohan.mehta@example.com

SUMMARY
Backend engineer with 2 years of experience building high-scale payment systems. Designed and built a real-time fraud detection service single-handedly.

EXPERIENCE
PayNest Technologies, Pune — Software Engineer (July 2024 – present)
- Single-handedly designed and built the real-time fraud-scoring service (Java, Kafka, Redis) that scores 100% of transactions in under 40 ms; cut fraud losses by 62% in two quarters.
- Built the merchant settlement reconciliation job in Spring Batch, processing 1.2 million records nightly; reduced mismatches from 0.8% to 0.1%.
- Added idempotency keys to the refunds API, eliminating duplicate refunds.
- On-call for the payments platform; resolved 30+ production incidents.

Internship: Kirana Kart, Pune — Backend Intern (Jan 2024 – June 2024)
- Wrote REST endpoints for the inventory service in Node.js and PostgreSQL.
- Added pagination and indexes that reduced a slow listing query from 3 s to 200 ms.

EDUCATION
B.Tech, Computer Engineering, Pune Institute of Computer Technology, 2024 — CGPA 8.4

SKILLS
Java, Spring Boot, Go (basic), Kafka, Redis, PostgreSQL, AWS (EC2, SQS, RDS), Docker, Grafana`,
};
