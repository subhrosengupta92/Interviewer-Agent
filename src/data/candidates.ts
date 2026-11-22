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
  {
    id: "c-rhea", name: "Rhea Kapoor", headline: "Vice President, Corporate Development at a listed consumer company", years: 11, location: "Mumbai", notice: "60 days", expects: "₹1.1 Cr",
    skills: ["M&A", "valuation", "deal structuring", "integration", "investor relations"], score: 8.7, interviewed_for: "Head of Corporate Development and Strategy",
    strengths: ["Closed four acquisitions end to end, including a ₹320 crore brand buyout, and explained the earn-out she negotiated", "Walked through a deal she killed in diligence and the customer-concentration issue behind it", "Built the valuation herself and defended every assumption under follow-up", "Ran integration for two acquired brands; candid about what went wrong in the first"],
    watch: ["Sixty-day notice", "Has not led a fundraise; supported the CFO on one"],
  },
  {
    id: "c-kabir", name: "Kabir Anand", headline: "Principal at a growth-stage venture fund", years: 10, location: "Mumbai", notice: "30 days", expects: "₹1.2 Cr",
    skills: ["growth investing", "diligence", "board work", "unit economics", "SaaS"], score: 8.5, interviewed_for: "Principal, Venture Investments",
    strengths: ["Led six growth investments; clear on which two he would not do again and why", "Explained cohort and payback analysis on a SaaS deal from memory, including where the model was fragile", "Sits on three boards; described helping a founder through a down round", "Precise about his own role versus the partner's on each deal"],
    watch: ["All experience is on the investing side; has not sat inside a company", "Expectation at the top of the range"],
  },
  {
    id: "c-zoya", name: "Zoya Merchant", headline: "Director, Investment Banking (Technology M&A)", years: 9, location: "Mumbai", notice: "90 days", expects: "₹1.3 Cr",
    skills: ["sell-side M&A", "private placements", "valuation", "negotiation"], score: 8.0, interviewed_for: "Head of Corporate Development and Strategy",
    strengths: ["Advised on eleven closed technology transactions worth $1.4 billion in total", "Very strong on structuring: explained a ratchet and a locked-box mechanism clearly", "Handled every harder valuation question without notes"],
    watch: ["Ninety-day notice", "Adviser only: has never owned a deal after closing", "Expectation above range"],
  },
  {
    id: "c-dev", name: "Dev Malhotra", headline: "Head of Strategy and Investor Relations at a consumer internet company", years: 12, location: "Bengaluru", notice: "45 days", expects: "₹1.15 Cr",
    skills: ["fundraising", "investor relations", "strategy", "board reporting", "M&A"], score: 8.3, interviewed_for: "Head of Corporate Development and Strategy",
    strengths: ["Ran two fundraises totalling $180 million, from deck to closing, and explained the term he would not accept", "Owns the three-year plan and the board pack; showed how one strategy call changed after a pricing test", "Led one acquisition and its integration; honest that retention of the acquired team was poor", "Twelve years across consulting and operating roles"],
    watch: ["Only one acquisition closed", "Forty-five-day notice"],
  },
  {
    id: "c-ayesha", name: "Ayesha Qureshi", headline: "Senior Associate at a private equity fund", years: 6, location: "Mumbai", notice: "30 days", expects: "₹75 LPA",
    skills: ["private equity", "financial modelling", "commercial diligence", "portfolio monitoring"], score: 7.8, interviewed_for: "Vice President, Growth Equity",
    strengths: ["Built the full model on three buyouts and explained the leverage and exit assumptions", "Ran commercial diligence on a consumer brand, including 40 customer calls she did herself", "Clear, structured thinker under pressure"],
    watch: ["Six years: junior for a head-of role", "Has supported deals, not led them"],
  },
  {
    id: "c-rohan-s", name: "Rohan Sethi", headline: "Finance Director (FP&A and Treasury) at a D2C group", years: 13, location: "Mumbai", notice: "60 days", expects: "₹95 LPA",
    skills: ["FP&A", "treasury", "unit economics", "fundraising support", "audit"], score: 7.5, interviewed_for: "Head of Corporate Development and Strategy",
    strengths: ["Owns the group P&L forecast and explained how contribution margin is built brand by brand", "Led finance diligence on two inbound investments", "Thirteen years in consumer finance"],
    watch: ["Finance operator rather than a deal lead", "Has not sourced or negotiated a transaction", "Sixty-day notice"],
  },
  {
    id: "c-tara", name: "Tara Venkatesh", headline: "Chief of Staff to the CEO at a fintech", years: 8, location: "Bengaluru", notice: "30 days", expects: "₹85 LPA",
    skills: ["strategy", "special projects", "M&A support", "new ventures", "OKRs"], score: 8.1, interviewed_for: "Head of New Ventures and AI Products",
    strengths: ["Launched a new lending line from idea to ₹40 crore disbursed and explained the unit economics", "Ran the workstream on one acquisition and a failed merger; clear on why the merger died", "Trusted by the founders; described changing the CEO's mind on pricing with data"],
    watch: ["Generalist: no deep finance or valuation training", "Has not owned a deal as the lead"],
  },
];

export const candidateById = (id: unknown): PoolCandidate | undefined => CANDIDATES.find((c) => c.id === id);
