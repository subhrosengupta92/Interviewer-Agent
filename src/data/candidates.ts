/** A candidate who has already done a FirstRound interview. Demo data for the recruiter side. */
export interface PoolCandidate {
  id: string;
  name: string;
  headline: string;
  years: number;
  location: string;
  notice: string;
  expects: string;
  skills: string[];
  /** Overall first-round result out of 10. */
  score: number;
  interviewed_for: string;
  strengths: string[];
  watch: string[];
}

export const CANDIDATES: PoolCandidate[] = [
  {
    id: "c-meera", name: "Meera Krishnan", headline: "SDE-II at a payments gateway", years: 5, location: "Bengaluru", notice: "30 days", expects: "₹38 LPA",
    skills: ["Java", "Kafka", "PostgreSQL", "payments", "idempotency"], score: 8.6, interviewed_for: "SDE-II, Backend",
    strengths: ["Designed the refund retry flow herself and explained exactly how duplicate refunds are prevented", "Walked through a 3 a.m. settlement incident from alert to root cause without prompting", "Knew where every number on her CV came from, including what it did not prove", "Mentors two juniors; described how she changed her review style after feedback"],
    watch: ["Has only worked in one company; less exposure to greenfield design"],
  },
  {
    id: "c-arjun", name: "Arjun Mehta", headline: "Senior Software Engineer at a logistics unicorn", years: 6, location: "Bengaluru", notice: "60 days", expects: "₹44 LPA",
    skills: ["Go", "gRPC", "Kubernetes", "distributed systems", "Redis"], score: 8.3, interviewed_for: "SDE-II, Backend",
    strengths: ["Strongest system design in the pool: reasoned about consistency and back-pressure under failure", "Built the order-assignment service that handles 1,200 requests a second and explained its failure modes", "Handled every harder follow-up until rate limiting across regions"],
    watch: ["No payments or money-movement experience", "Sixty-day notice", "Expectation slightly above range"],
  },
  {
    id: "c-fatima", name: "Fatima Sheikh", headline: "SDE-II at a neobank", years: 4, location: "Mumbai, open to Bengaluru", notice: "30 days", expects: "₹34 LPA",
    skills: ["Java", "Spring Boot", "MySQL", "ledger systems", "payments"], score: 8.1, interviewed_for: "SDE-II, Backend",
    strengths: ["Built the double-entry ledger for wallet transfers and explained how it stays balanced under retries", "Very precise about her own part versus the team's", "Clear thinker on SQL: indexes, isolation levels and a deadlock she fixed"],
    watch: ["Needs to relocate", "Less depth on asynchronous messaging"],
  },
  {
    id: "c-rahul", name: "Rahul Verma", headline: "Software Engineer at an e-commerce marketplace", years: 4, location: "Bengaluru", notice: "15 days", expects: "₹30 LPA",
    skills: ["Java", "Kafka", "Elasticsearch", "checkout"], score: 7.4, interviewed_for: "SDE-II, Backend",
    strengths: ["Owned the cart-to-order service; solid on idempotent order creation", "Fast, practical debugger: reproduced a race condition live in the conversation", "Can join in two weeks"],
    watch: ["Design answers thin once scale went past his own system", "Has not led a design on his own yet"],
  },
  {
    id: "c-divya", name: "Divya Nair", headline: "Backend Engineer at a lending start-up", years: 3, location: "Bengaluru", notice: "30 days", expects: "₹28 LPA",
    skills: ["Python", "Django", "PostgreSQL", "payments", "reconciliation"], score: 7.6, interviewed_for: "SDE-II, Backend",
    strengths: ["Built loan-repayment reconciliation alone; knew the edge cases cold", "Learns fast: moved from analyst to engineer in a year and explained how", "Honest about limits; said plainly what she had not done"],
    watch: ["Python only; no Java or Go in production", "At the lower end of the experience range"],
  },
  {
    id: "c-karthik", name: "Karthik Iyer", headline: "SDE-III at a large IT product company", years: 7, location: "Chennai, open to Bengaluru", notice: "90 days", expects: "₹46 LPA",
    skills: ["Java", "Oracle", "microservices", "banking"], score: 6.9, interviewed_for: "SDE-II, Backend",
    strengths: ["Deep on transactions and database internals", "Seven years on core-banking integrations"],
    watch: ["Ninety-day notice", "Spoke mostly as 'we'; hard to pin down his own contribution", "Expectation above range"],
  },
  {
    id: "c-sneha", name: "Sneha Patil", headline: "SDE-II at a fintech infrastructure company", years: 5, location: "Pune, open to Bengaluru", notice: "45 days", expects: "₹40 LPA",
    skills: ["Go", "PostgreSQL", "Kafka", "payments", "UPI"], score: 8.4, interviewed_for: "SDE-II, Backend",
    strengths: ["Built UPI payment routing with automatic failover between banks; explained the trade-offs clearly", "Writes Go in production daily; strong on concurrency", "Took harder questions on exactly-once processing and stayed correct", "Ran the on-call rotation for a year"],
    watch: ["Forty-five-day notice", "Needs to relocate"],
  },
  {
    id: "c-aditya", name: "Aditya Bose", headline: "Software Engineer at a SaaS company", years: 3, location: "Bengaluru", notice: "30 days", expects: "₹26 LPA",
    skills: ["Node.js", "TypeScript", "MongoDB", "AWS"], score: 6.4, interviewed_for: "SDE-II, Backend",
    strengths: ["Good product instincts; ships quickly", "Clear communicator"],
    watch: ["Could not explain how his own caching layer handled invalidation", "No relational database depth", "No payments background"],
  },
  {
    id: "c-priya", name: "Priya Raman", headline: "Machine Learning Engineer at a payments company", years: 5, location: "Bengaluru", notice: "30 days", expects: "₹45 LPA",
    skills: ["Python", "fraud models", "feature stores", "Spark"], score: 8.2, interviewed_for: "Machine Learning Engineer",
    strengths: ["Shipped a fraud model and could explain its evaluation against a holdout", "Understands serving latency and feature freshness"],
    watch: ["Not a backend services engineer"],
  },
  {
    id: "c-nikhil", name: "Nikhil Gupta", headline: "Product Manager at a consumer app", years: 6, location: "Bengaluru", notice: "60 days", expects: "₹42 LPA",
    skills: ["growth", "experimentation", "SQL", "subscriptions"], score: 7.9, interviewed_for: "Product Manager, Growth",
    strengths: ["Grew repeat purchase with a subscription launch and knew how it was measured", "Comfortable in SQL"],
    watch: ["Sixty-day notice"],
  },
  {
    id: "c-ishaan", name: "Ishaan Malhotra", headline: "Senior Data Analyst at a marketplace", years: 4, location: "Gurugram", notice: "30 days", expects: "₹26 LPA",
    skills: ["SQL", "Python", "A/B testing", "pricing"], score: 7.7, interviewed_for: "Senior Data Analyst",
    strengths: ["Caught a flawed pricing test and explained why the result could not be trusted", "Excellent SQL"],
    watch: ["Prefers to stay in Gurugram"],
  },
  {
    id: "c-tanvi", name: "Tanvi Deshpande", headline: "Performance Marketing Lead at a D2C brand", years: 5, location: "Mumbai", notice: "30 days", expects: "₹28 LPA",
    skills: ["Meta Ads", "Google Ads", "creative testing", "incrementality"], score: 8.0, interviewed_for: "Performance Marketing Manager",
    strengths: ["Ran ₹2 crore a month and explained the difference between attributed and incremental results", "Strong creative judgement"],
    watch: ["Has not managed a team"],
  },
];

export const candidateById = (id: unknown): PoolCandidate | undefined => CANDIDATES.find((c) => c.id === id);
