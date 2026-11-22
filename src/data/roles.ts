import type { Competency } from "../lib/types";

/** An open role on the FirstRound network. Demo data. */
export interface Role {
  id: string;
  title: string;
  company: string;
  /** One line about the company, shown on the role page. */
  about: string;
  location: string;
  /** Salary range shown to candidates. */
  salary: string;
  /** What the company can actually pay. Only the Scorer sees this. */
  budget: string;
  experience: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  competencies: Competency[];
  tags: string[];
}

const f = (name: string, definition: string): Competency => ({ name, kind: "functional", definition });
const b = (name: string, definition: string): Competency => ({ name, kind: "behavioural", definition });

export const ROLES: Role[] = [
  {
    id: "sde2-backend-payments",
    title: "SDE-II, Backend (Payments)",
    company: "Northwind Pay",
    about: "Payments infrastructure for 40,000 online merchants across India.",
    location: "Bengaluru · Hybrid, 3 days in office",
    salary: "₹32–42 LPA",
    budget: "Up to ₹42 lakh per year fixed",
    experience: "3–6 years",
    summary: "Own services on the payment path: routing, refunds and reconciliation, at 2,000 transactions a second.",
    responsibilities: [
      "Design and run backend services in Java or Go that move real money, with correctness first",
      "Own features end to end: design note, code, tests, rollout, on-call",
      "Improve payment success rate and cut reconciliation breaks",
      "Review code and mentor SDE-Is",
    ],
    requirements: [
      "3–6 years building backend services with real production traffic",
      "Strong on data modelling, SQL, concurrency and API design",
      "Has debugged production incidents personally and can walk through one",
      "Understands idempotency, retries and consistency in distributed systems",
    ],
    competencies: [
      f("Distributed systems design", "Designs services that stay correct under retries, failures and load, and can explain the trade-offs"),
      f("Coding and debugging depth", "Knows their own code down to queries, locks and failure modes"),
      f("Data modelling and SQL", "Models data for correctness and can reason about indexes, transactions and scale"),
      b("Ownership", "Takes a problem to the finish and is precise about their own part"),
      b("Mentoring and collaboration", "Raises the level of people around them through reviews and pairing"),
    ],
    tags: ["backend", "java", "go", "payments", "distributed systems", "sql", "engineering"],
  },
  {
    id: "sde2-frontend",
    title: "SDE-II, Frontend",
    company: "Lumen Health",
    about: "Teleconsultation and pharmacy for 6 million patients.",
    location: "Gurugram · Hybrid, 2 days in office",
    salary: "₹28–36 LPA",
    budget: "Up to ₹36 lakh per year fixed",
    experience: "3–6 years",
    summary: "Build the patient app's booking and consultation flows in React and React Native.",
    responsibilities: [
      "Ship web and mobile features used by millions of patients",
      "Own performance: load time, bundle size and smooth video consults on poor networks",
      "Build shared components with design",
    ],
    requirements: [
      "3–6 years in React or React Native with TypeScript",
      "Has measured and fixed a real performance problem",
      "Cares about accessibility and state management done simply",
    ],
    competencies: [
      f("Frontend architecture", "Structures state, data fetching and components so features stay easy to change"),
      f("Web performance", "Measures before optimising and knows what actually makes a page slow"),
      f("Coding and debugging depth", "Can explain how their own code works and how they found a hard bug"),
      b("Product sense", "Notices when a flow is wrong for the user and pushes back with evidence"),
    ],
    tags: ["frontend", "react", "typescript", "mobile", "engineering"],
  },
  {
    id: "ml-engineer",
    title: "Machine Learning Engineer",
    company: "Northwind Pay",
    about: "Payments infrastructure for 40,000 online merchants across India.",
    location: "Bengaluru · Hybrid, 3 days in office",
    salary: "₹38–50 LPA",
    budget: "Up to ₹50 lakh per year fixed",
    experience: "4–7 years",
    summary: "Build and run fraud and risk models that decide in under 50 milliseconds.",
    responsibilities: ["Train, ship and monitor fraud models", "Build the feature pipeline and online serving path", "Measure model impact honestly against a holdout"],
    requirements: ["4–7 years shipping ML models to production", "Strong Python and SQL; comfortable in a JVM or Go service", "Understands evaluation, drift and feedback loops"],
    competencies: [
      f("Applied machine learning", "Chooses the simplest model that works and can explain how it was evaluated"),
      f("ML systems", "Understands serving latency, feature freshness and monitoring"),
      f("Data and metrics literacy", "Knows how their numbers were measured and what would bias them"),
      b("Ownership", "Follows a model into production and owns what happens after"),
    ],
    tags: ["machine learning", "python", "fraud", "data", "engineering"],
  },
  {
    id: "sre",
    title: "Site Reliability Engineer",
    company: "Northwind Pay",
    about: "Payments infrastructure for 40,000 online merchants across India.",
    location: "Bengaluru · Hybrid, 3 days in office",
    salary: "₹30–40 LPA",
    budget: "Up to ₹40 lakh per year fixed",
    experience: "4–8 years",
    summary: "Keep the payment path at four nines: capacity, incident response and safe deploys.",
    responsibilities: ["Run Kubernetes on AWS for 300 services", "Lead incident response and write the reviews", "Build deploy and rollback tooling"],
    requirements: ["4–8 years in SRE or platform engineering", "Deep Linux, networking and Kubernetes", "Has led a serious incident from page to fix"],
    competencies: [
      f("Reliability engineering", "Thinks in failure modes, error budgets and blast radius"),
      f("Systems and networking depth", "Can debug from symptom down to the kernel or the network"),
      b("Calm under pressure", "Leads an incident clearly and writes an honest review after"),
      b("Ownership", "Fixes the cause, not just the page"),
    ],
    tags: ["sre", "devops", "kubernetes", "aws", "infrastructure", "engineering"],
  },
  {
    id: "engineering-manager",
    title: "Engineering Manager, Checkout",
    company: "Halo Wellness",
    about: "A family of direct-to-consumer health and wellness brands.",
    location: "Mumbai · In office",
    salary: "₹55–70 LPA",
    budget: "Up to ₹70 lakh per year fixed",
    experience: "8–12 years",
    summary: "Lead a team of eight engineers who own checkout, payments and order placement.",
    responsibilities: ["Hire, grow and retain a strong team", "Own delivery and quality for checkout", "Stay technical enough to review designs"],
    requirements: ["8+ years in software, 2+ managing engineers", "Has hired and has managed someone out", "Solid backend fundamentals"],
    competencies: [
      b("People leadership", "Sets a clear bar, grows people and handles under-performance directly"),
      f("Technical judgement", "Can tell a good design from a bad one and ask the question that matters"),
      b("Delivery", "Plans honestly and says early when something will slip"),
      b("Influence", "Works with product and business as a peer"),
    ],
    tags: ["engineering manager", "leadership", "backend", "engineering"],
  },
  {
    id: "senior-data-analyst",
    title: "Senior Data Analyst",
    company: "Kestrel Commerce",
    about: "A beauty and personal-care marketplace with 9 million customers.",
    location: "Bengaluru · Hybrid, 3 days in office",
    salary: "₹22–30 LPA",
    budget: "Up to ₹30 lakh per year fixed",
    experience: "3–6 years",
    summary: "Be the analyst for pricing and promotions: experiments, dashboards and the hard questions.",
    responsibilities: ["Design and read A/B tests on pricing", "Build the metrics the business runs on", "Tell leaders what the data does and does not say"],
    requirements: ["3–6 years in analytics", "Excellent SQL; working Python or R", "Understands experiment design and its traps"],
    competencies: [
      f("SQL and data modelling", "Writes correct, readable queries and knows where the data lies"),
      f("Experimentation", "Designs a clean test and knows when a result cannot be trusted"),
      f("Business judgement", "Turns a vague question into an analysis that changes a decision"),
      b("Communication", "Says the uncomfortable thing clearly"),
    ],
    tags: ["data", "analytics", "sql", "experimentation"],
  },
  {
    id: "product-manager-growth",
    title: "Product Manager, Growth",
    company: "Kestrel Commerce",
    about: "A beauty and personal-care marketplace with 9 million customers.",
    location: "Bengaluru · Hybrid, 3 days in office",
    salary: "₹35–48 LPA",
    budget: "Up to ₹48 lakh per year fixed",
    experience: "4–8 years",
    summary: "Own activation and repeat purchase for the app: onboarding, subscriptions and re-engagement.",
    responsibilities: ["Set the growth roadmap and prove what works with experiments", "Work daily with engineering, design and marketing", "Own repeat rate and retention"],
    requirements: ["4–8 years in product, some in growth or consumer", "Comfortable with SQL and experiment readouts", "Has shipped something that moved a real metric"],
    competencies: [
      f("Product judgement", "Picks the problem worth solving and can say why"),
      f("Data and metrics literacy", "Knows how their numbers were measured"),
      b("Ownership", "Precise about their own part in a team result"),
      b("Influence", "Gets engineers and designers on side without authority"),
    ],
    tags: ["product", "growth", "consumer"],
  },
  {
    id: "performance-marketing-manager",
    title: "Performance Marketing Manager",
    company: "Halo Wellness",
    about: "A family of direct-to-consumer health and wellness brands.",
    location: "Mumbai · In office",
    salary: "₹24–32 LPA",
    budget: "Up to ₹32 lakh per year fixed",
    experience: "4–7 years",
    summary: "Run ₹4 crore a month across Meta and Google for two brands, on new-customer ROAS.",
    responsibilities: ["Plan and run paid acquisition", "Own creative testing with the brand team", "Report honestly on incremental results"],
    requirements: ["4–7 years in performance marketing for consumer brands", "Deep Meta Ads experience", "Understands attribution and its limits"],
    competencies: [
      f("Paid acquisition", "Reasons about CAC, ROAS and scaling from first principles"),
      f("Measurement", "Knows the difference between attributed and incremental"),
      f("Creative judgement", "Can say why an ad worked"),
      b("Ownership", "Treats the budget like their own money"),
    ],
    tags: ["marketing", "performance marketing", "meta", "growth"],
  },
  {
    id: "product-designer",
    title: "Product Designer",
    company: "Lumen Health",
    about: "Teleconsultation and pharmacy for 6 million patients.",
    location: "Gurugram · Hybrid, 2 days in office",
    salary: "₹24–34 LPA",
    budget: "Up to ₹34 lakh per year fixed",
    experience: "3–7 years",
    summary: "Design the consultation and prescription experience for patients and doctors.",
    responsibilities: ["Own flows from research to shipped pixels", "Run usability tests with patients", "Grow the design system"],
    requirements: ["3–7 years in product design for apps", "A portfolio with shipped work and the reasoning behind it", "Comfortable with research"],
    competencies: [
      f("Interaction design", "Makes a hard flow feel obvious"),
      f("Research", "Learns from users and changes the design because of it"),
      b("Collaboration", "Works with engineers as a partner"),
      b("Product sense", "Knows which problem matters"),
    ],
    tags: ["design", "ux", "product design"],
  },
  {
    id: "vc-principal",
    title: "Principal, Venture Investments",
    company: "Meridian Ventures",
    about: "A $350 million early-growth fund backing B2B software and consumer companies in India and South-East Asia.",
    location: "Mumbai · In office, with travel",
    salary: "₹90 LPA–1.3 Cr plus carry",
    budget: "Up to ₹1.3 crore per year fixed, plus carry",
    experience: "8–12 years",
    summary: "Source, lead and win Series A and B investments, and sit on the boards of the companies you back.",
    responsibilities: [
      "Build a thesis in two or three sectors and source companies ahead of the market",
      "Lead diligence end to end: market, product, unit economics, team and references",
      "Write the investment memo and defend it at the investment committee",
      "Work with founders after the cheque: hiring, pricing, go-to-market and the next round",
    ],
    requirements: [
      "8–12 years across venture or growth investing, or operating plus investing",
      "Deals you personally sourced or led, and a clear view of which went wrong and why",
      "Strong on unit economics, cohort analysis and valuation",
      "Founders pick up the phone when you call",
    ],
    competencies: [
      f("Investment judgement", "Can explain why they backed or passed on a company, and what they got wrong"),
      f("Financial and unit-economics depth", "Knows how a company's numbers were built and what would break them"),
      f("Sourcing and thesis building", "Has a point of view that led to real deals, not a list of sectors"),
      b("Founder relationships", "Is trusted by founders and has helped one through a hard moment"),
      b("Ownership", "Precise about their own role in a deal versus the partnership's"),
    ],
    tags: ["venture capital", "investing", "finance", "growth equity", "board"],
  },
  {
    id: "growth-equity-vp",
    title: "Vice President, Growth Equity",
    company: "Northgate Capital",
    about: "A growth-equity investor writing $20–60 million cheques into profitable technology businesses.",
    location: "Mumbai · In office",
    salary: "₹1–1.5 Cr plus carry",
    budget: "Up to ₹1.5 crore per year fixed, plus carry",
    experience: "9–14 years",
    summary: "Lead growth investments from first meeting to exit, with deep work on portfolio value creation.",
    responsibilities: ["Originate and execute growth-stage investments", "Run financial, commercial and operating diligence", "Drive value creation plans with portfolio CEOs", "Manage exits"],
    requirements: ["9–14 years in growth equity, private equity or venture", "Has led deals and sat on boards", "Excellent financial modelling and commercial judgement"],
    competencies: [
      f("Investment judgement", "Explains the real reasons a deal worked or did not"),
      f("Financial modelling and valuation", "Can defend the assumptions that drove a valuation"),
      f("Portfolio value creation", "Has changed a portfolio company's trajectory and can say how"),
      b("Influence", "Moves a CEO or an investment committee with evidence"),
    ],
    tags: ["growth equity", "private equity", "investing", "finance"],
  },
  {
    id: "head-new-ventures",
    title: "Head of New Ventures and AI Products",
    company: "Halo Wellness",
    about: "A family of direct-to-consumer health and wellness brands.",
    location: "Mumbai · In office",
    salary: "₹1–1.4 Cr",
    budget: "Up to ₹1.4 crore per year fixed",
    experience: "10+ years",
    summary: "Incubate new brands to their first ₹25 crore, and build AI products that change how the company runs.",
    responsibilities: ["Decide which ventures and AI products to build, and which to stop", "Own each venture's P&L until hand-over", "Ship AI agents that take real work off leaders' plates", "Hire and lead a small senior team"],
    requirements: ["10+ years across investing, strategy or product, with something taken from zero to revenue", "Commercial depth: knows the numbers and what breaks them", "Real understanding of what current AI can and cannot do"],
    competencies: [
      f("Zero-to-one venture building", "Has personally taken something from idea to revenue and can explain the calls that mattered"),
      f("Commercial and P&L judgement", "Knows where each number came from and what would break it"),
      f("AI product depth", "Understands what they built with AI well enough to explain how it works and where it fails"),
      b("Hiring and building teams", "Sets a clear bar and has dealt with a hire that did not work out"),
      b("Influence with senior stakeholders", "Changes founders' minds with evidence"),
    ],
    tags: ["new ventures", "strategy", "ai", "product", "leadership", "investing"],
  },
  {
    id: "director-product-fintech",
    title: "Director of Product, Lending",
    company: "Northwind Pay",
    about: "Payments infrastructure for 40,000 online merchants across India.",
    location: "Bengaluru · Hybrid, 3 days in office",
    salary: "₹80 LPA–1.1 Cr",
    budget: "Up to ₹1.1 crore per year fixed",
    experience: "9–13 years",
    summary: "Own merchant lending: credit products, underwriting experience and the P&L that comes with them.",
    responsibilities: ["Set the product strategy for merchant credit", "Own the lending P&L with risk and finance", "Lead a team of five product managers", "Work with lending partners and regulators"],
    requirements: ["9–13 years across product, finance or investing in fintech", "Understands credit economics: yields, losses, cost of capital", "Has led product managers or a business line"],
    competencies: [
      f("Product strategy", "Picks the problem worth solving and can say what they chose not to do"),
      f("Financial and credit judgement", "Understands how a lending book makes and loses money"),
      b("People leadership", "Grows product managers and holds a clear bar"),
      b("Influence", "Works with risk, finance and partners as a peer"),
    ],
    tags: ["product", "fintech", "lending", "finance", "leadership"],
  },
  {
    id: "corp-dev-strategy",
    title: "Head of Corporate Development and Strategy",
    company: "Kestrel Commerce",
    about: "A beauty and personal-care marketplace with 9 million customers.",
    location: "Bengaluru · Hybrid, 3 days in office",
    salary: "₹85 LPA–1.2 Cr",
    budget: "Up to ₹1.2 crore per year fixed",
    experience: "9–14 years",
    summary: "Lead acquisitions, fundraising and the annual strategy for a company preparing to list.",
    responsibilities: ["Source, value and close acquisitions of brands and technology", "Run fundraising and investor relations with the CFO", "Own the three-year plan and the board narrative", "Integrate what the company buys"],
    requirements: ["9–14 years in investing, investment banking or corporate development", "Has closed transactions and lived with them afterwards", "Strong valuation, structuring and negotiation skills"],
    competencies: [
      f("Deal judgement", "Explains why a deal was worth doing and what they would not repeat"),
      f("Valuation and structuring", "Can defend a price and the terms that protected it"),
      f("Strategic thinking", "Turns a market view into choices the company actually made"),
      b("Influence", "Brings a founder, a board and a seller to the same answer"),
    ],
    tags: ["corporate development", "m&a", "strategy", "finance", "investing"],
  },
  {
    id: "founders-office-associate",
    title: "Founder's Office Associate",
    company: "Halo Wellness",
    about: "A family of direct-to-consumer health and wellness brands.",
    location: "Mumbai · In office",
    salary: "₹18–24 LPA",
    budget: "Up to ₹24 lakh per year fixed",
    experience: "1–4 years",
    summary: "Work with the founders on new brand launches, special projects and whatever is on fire.",
    responsibilities: ["Run projects end to end across functions", "Build the analysis behind big decisions", "Take new launches from idea to first revenue"],
    requirements: ["1–4 years in consulting, a startup or a founder's office", "Structured thinking and strong Excel or SQL", "Gets things done without being asked twice"],
    competencies: [
      f("Structured problem solving", "Breaks a messy problem into parts and gets to an answer"),
      f("Commercial judgement", "Understands unit economics and what drives them"),
      b("Ownership", "Finishes things"),
      b("Learning agility", "Picks up new areas fast"),
    ],
    tags: ["generalist", "strategy", "operations", "founder's office"],
  },
];

export const roleById = (id: unknown): Role | undefined => ROLES.find((r) => r.id === id);

/** The role as a job description, for the Planner and Scorer. */
export function roleJobDescription(r: Role): string {
  return [
    `${r.title} — ${r.company}`,
    r.about,
    r.summary,
    `Experience: ${r.experience}. Location: ${r.location}.`,
    `What you will do:\n${r.responsibilities.map((x) => `- ${x}`).join("\n")}`,
    `What we look for:\n${r.requirements.map((x) => `- ${x}`).join("\n")}`,
  ].join("\n\n");
}

/** A company invitation to interview for one role. Demo data. */
export interface Invite {
  code: string;
  role_id: string;
  invited_by: string;
}

export const INVITES: Invite[] = [
  { code: "northwind-sde2", role_id: "sde2-backend-payments", invited_by: "Ananya Rao, Engineering Manager at Northwind Pay" },
  { code: "kestrel-pm", role_id: "product-manager-growth", invited_by: "Vikram Shah, Director of Product at Kestrel Commerce" },
];

export const inviteByCode = (code: unknown): Invite | undefined => INVITES.find((i) => i.code === code);
