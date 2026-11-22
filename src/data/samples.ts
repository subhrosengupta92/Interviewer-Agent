// Sample roles for the dashboard, each with first-round transcripts that can be questioned. Demo data: none of these people exist.

export interface SampleInterview {
  id: string;
  name: string;
  headline: string;
  /** Overall first-round result out of 10. */
  score: number;
  minutes: number;
  location: string;
  notice: string;
  /** Salary expectation against the role's range. Never an exact figure. */
  expects: "within range" | "slightly above range" | "above range";
  /** Score out of 5 for each area the role tests, in the role's order. */
  areas: number[];
  summary: string;
  /** Question and answer pairs, in the order they were spoken. */
  turns: [string, string][];
}

export interface SampleRole {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  experience: string;
  areas: string[];
  interviews: SampleInterview[];
}

export const SAMPLE_ROLES: SampleRole[] = [
  {
    id: "sde2",
    title: "SDE-II, Backend (Payments)",
    company: "Northwind Pay",
    location: "Bengaluru · Hybrid",
    salary: "₹32–42 LPA",
    experience: "3–6 years",
    areas: ["Payments domain", "System design", "Debugging and incidents", "Ownership"],
    interviews: [
      {
        id: "s-meera",
        name: "Meera Krishnan",
        headline: "SDE-II at a payments gateway · 5 years",
        score: 8.6,
        minutes: 11,
        location: "Bengaluru",
        notice: "30 days",
        expects: "within range",
        areas: [5, 4, 5, 4],
        summary: "Designed and owns the refund retry flow at a payments gateway. Precise about how duplicate refunds are prevented and where her numbers come from. Has only worked at one company, so less greenfield design.",
        turns: [
          ["Your CV says you built the refund retry flow. Which part of that was yours?", "All of the retry side. Refunds were failing when the bank timed out, and support was re-triggering them by hand, which caused double refunds. I designed the retry worker, the idempotency key and the state machine. A teammate built the dashboard on top."],
          ["How do you make sure a refund is never sent twice?", "Every refund gets an idempotency key made from the payment ID and the refund sequence number, stored with a unique constraint in Postgres. The worker claims a row with SELECT FOR UPDATE SKIP LOCKED, calls the bank with the same key, and only then moves the state. If the bank times out we do not retry blind: we call their status API first, because a timeout does not mean it failed."],
          ["Your CV says duplicate refunds fell by 98 percent. How was that measured?", "Finance tracked duplicate refunds per month in their reconciliation sheet: about 140 a month before, two or three after, over three months. I should say what it does not prove: volume also dropped that quarter, so the real improvement is probably a little under 98."],
          ["Tell me about the worst production night you have had.", "A settlement file went out with 4,000 rows missing at 3 a.m. The alert was on file size, which I had added a month earlier. I traced it to a Kafka consumer that had been rebalancing in a loop after a deploy changed the session timeout. I paused the job, replayed from the last committed offset, regenerated the file and it reached the bank forty minutes late. The fix was a config check in CI."],
          ["If you were designing this for ten times the volume, what changes?", "The Postgres queue becomes the bottleneck first, so I would partition the refunds table by day and move claiming to Kafka with one partition per merchant to keep ordering. I have not built that part myself, though. Everything I have done is inside one system that already existed."],
          ["Two practical things: notice period and what you are hoping for on salary?", "Thirty days. I am at 31 and hoping for around 38."],
        ],
      },
      {
        id: "s-sneha",
        name: "Sneha Patil",
        headline: "SDE-II at a fintech infrastructure company · 5 years",
        score: 8.4,
        minutes: 12,
        location: "Pune, would relocate to Bengaluru",
        notice: "45 days",
        expects: "within range",
        areas: [5, 5, 4, 4],
        summary: "Built UPI payment routing with automatic failover between banks, in Go. Strongest of the group on system design and exactly-once questions. Forty-five-day notice and would need to relocate.",
        turns: [
          ["Walk me through the UPI routing system on your CV.", "We connect to four sponsor banks. Each payment is routed to one of them, and when a bank's success rate drops we shift traffic away within about ten seconds. I wrote the router and the health scorer in Go. The scorer keeps a sliding window of the last two hundred attempts per bank and per payment type."],
          ["What stops the router from flapping between two banks?", "Two things. A bank has to stay below 85 percent success for three windows in a row before we move, and when it recovers we send only five percent of traffic back first. Before that we had exactly the flapping you describe during a partial outage, and it made things worse for everyone."],
          ["A payment times out at the bank. The customer retries. What happens?", "The retry carries the same transaction reference, and our ledger write is keyed on it, so a second debit cannot be recorded. The harder case is the bank debiting after our timeout. For that we have a reconciliation job on their settlement file every thirty minutes, which auto-reverses anything we marked failed that they marked successful."],
          ["Is that exactly-once processing?", "No, and I would not call it that. Delivery is at-least-once from Kafka. What we get is exactly-once effect, because the consumer is idempotent on the transaction reference and the offset commit happens after the database commit. If the process dies between the two, the message is processed again and the unique key rejects it."],
          ["Tell me about being on call.", "I ran the rotation for a year: six engineers, one week each. The thing I changed was the runbooks. We had forty alerts and people were paged for all of them, so I cut the paging alerts to nine and wrote a one-page runbook for each. Pages per week went from about thirty to eight."],
          ["Notice period, location and salary expectation?", "Forty-five days, and I can try to negotiate that down. I am in Pune and would move to Bengaluru. I am hoping for around 40."],
        ],
      },
      {
        id: "s-fatima",
        name: "Fatima Sheikh",
        headline: "SDE-II at a neobank · 4 years",
        score: 8.1,
        minutes: 10,
        location: "Mumbai, would relocate to Bengaluru",
        notice: "30 days",
        expects: "within range",
        areas: [4, 3, 4, 5],
        summary: "Built the double-entry ledger for wallet transfers. Very strong on SQL and on being exact about her own part. Thinner on asynchronous messaging, and would need to relocate.",
        turns: [
          ["You built a ledger for wallet transfers. What does a transfer look like in it?", "Two rows in one database transaction: a debit on the sender's account and a credit on the receiver's, with the same transfer ID. Balances are never stored as a number we update; they are the sum of entries, with a snapshot every night so the sum stays fast."],
          ["What keeps it balanced if the request is retried?", "The transfer ID has a unique index, so the second attempt fails at insert and we return the first result. And both rows are in one transaction at REPEATABLE READ, so you can never see a debit without its credit."],
          ["Which parts were yours and which were the team's?", "The schema, the transfer path and the nightly snapshot were mine. The reversal flow was a colleague's, and I reviewed it. The reporting layer was another team's and I did not touch it."],
          ["Tell me about a bug that was hard to find.", "A deadlock that showed up about twice a day. Two transfers between the same pair of accounts in opposite directions were each locking their own account first. I found it from the MySQL deadlock log, and fixed it by always locking the lower account ID first. It has not happened since."],
          ["How would you send a notification after each transfer without slowing the transfer down?", "I would write an event row in the same transaction and have a separate worker publish it. I know that is called an outbox. I have read about doing it with Kafka, but I have not run Kafka in production myself, so I would need help with partitioning and consumer lag."],
          ["Notice period, location and salary expectation?", "Thirty days. I am in Mumbai and would move. Around 34 would work for me."],
        ],
      },
      {
        id: "s-rahul",
        name: "Rahul Verma",
        headline: "Software Engineer at an e-commerce marketplace · 4 years",
        score: 7.4,
        minutes: 9,
        location: "Bengaluru",
        notice: "15 days",
        expects: "within range",
        areas: [3, 3, 5, 3],
        summary: "Owns the cart-to-order service. A fast, practical debugger who can join in two weeks. Design answers thinned out beyond his own system, and he has not led a design on his own.",
        turns: [
          ["What do you own at work today?", "The service that turns a cart into an order. It reserves stock, creates the order and hands off to payments. I have owned it for two years, on call included."],
          ["How do you stop a double click creating two orders?", "The app sends a checkout token it generated when the cart was opened. We store it with a unique key in the orders table, so the second request finds the existing order and returns it."],
          ["Tell me about a bug you are proud of finding.", "Stock going negative on flash sales. I could not reproduce it for a week. Then I wrote a script that fired two hundred parallel checkouts at one item and saw it within a minute: we were reading stock and writing it back in two statements. I changed it to a single UPDATE with a WHERE stock > 0 and checked the affected row count."],
          ["You have not worked on payments yourself. How does a payment refund differ from an order cancellation?", "A cancellation is ours to undo. A refund depends on the bank, so it can be pending for days and you cannot assume it worked. Beyond that I would be guessing; I have integrated with our payments team's API but not built that side."],
          ["Design question: the order service needs to handle fifty times the traffic for one hour. What do you do?", "Add more instances behind the load balancer, and cache the catalogue reads. For the database I would add read replicas. I am not sure what the right answer is for the writes at that scale. Someone senior made those calls on our last sale and I implemented them."],
          ["Notice period and salary expectation?", "Fifteen days; I have already resigned. Around 30."],
        ],
      },
    ],
  },
  {
    id: "corpdev",
    title: "Principal, Corporate Development",
    company: "Northwind Pay",
    location: "Mumbai · Hybrid",
    salary: "₹60–80 LPA",
    experience: "8–12 years",
    areas: ["Deal execution", "Valuation and modelling", "Integration", "Stakeholder judgement"],
    interviews: [
      {
        id: "s-rhea",
        name: "Rhea Kapoor",
        headline: "VP, Corporate Development at a listed consumer company · 11 years",
        score: 8.7,
        minutes: 12,
        location: "Mumbai",
        notice: "60 days",
        expects: "above range",
        areas: [5, 5, 4, 4],
        summary: "Closed four acquisitions end to end and built the valuations herself. Candid about an integration that went badly. Sixty-day notice, expects above the range, and has not led a fundraise.",
        turns: [
          ["Pick the deal you are proudest of and tell me your part in it.", "A ₹320 crore buyout of a personal-care brand. I sourced it from a distributor conversation, ran the process with one analyst, built the model, negotiated the term sheet with the founders and took it to our board. Legal and tax diligence were with advisers; commercial diligence I led myself."],
          ["How did you get to ₹320 crore?", "A DCF and a multiple, and they disagreed. The DCF gave about 290 on our base case. Comparable deals were at four times revenue, which gave 360. The gap was the founders' growth plan, which I did not fully believe, so we paid 260 up front and put 60 into an earn-out tied to revenue in years one and two. They hit the first year and missed the second."],
          ["Tell me about a deal you walked away from.", "A snacks company, in exclusivity. In diligence we found 46 percent of revenue came from one modern-trade chain on a contract that renewed every year. Management had described it as diversified. I recommended we stop, and we did. It cost us about ₹1.2 crore in adviser fees, which I had to explain to the CFO."],
          ["What happened after you closed your first acquisition?", "It went badly, and that was partly on me. We moved their sales team onto our distributor system in month two and lost a third of their salespeople in a quarter. On the second one I kept the team and systems separate for a year, with one shared finance lead, and retention was above 90 percent."],
          ["Have you raised capital?", "Not as the lead. I supported our CFO on a qualified placement: I built the investor model and sat in the meetings, but the relationships and the pricing were his."],
          ["Notice period and salary expectation?", "Sixty days. I am at about a crore now and would want to be a little above that."],
        ],
      },
      {
        id: "s-kabir",
        name: "Kabir Anand",
        headline: "Principal at a growth-stage venture fund · 10 years",
        score: 8.5,
        minutes: 11,
        location: "Mumbai",
        notice: "30 days",
        expects: "above range",
        areas: [4, 5, 2, 5],
        summary: "Led six growth investments and sits on three boards. Excellent on unit economics and on being exact about his role versus the partner's. All of his experience is on the investing side: he has never integrated a business.",
        turns: [
          ["You have led six investments. What does led mean?", "I sourced four of the six, ran diligence on all of them, built the model and wrote the investment memo. The partner signed off and took the first board seat on two; I hold the seat on three. Pricing was a joint call on every one."],
          ["Take me through the numbers on one of them.", "A payroll software company. Net revenue retention was 118 percent and they quoted a payback of eleven months. When I rebuilt it from invoices, payback was nineteen months, because they had left out onboarding cost and counted annual contracts as cash on day one. We still invested, at a valuation about 25 percent lower, and I said in the memo that the model breaks if retention falls below 105."],
          ["Which of the six would you not do again?", "Two. One was a consumer brand where we paid for growth that was all paid marketing; I saw it in the cohorts and argued myself out of it. The other was a good company with a founder who did not want a board. I knew that in the second meeting."],
          ["This role buys companies and then has to make them work inside ours. What have you done after a deal closes?", "Board work: hiring a CFO, a down round, a pricing change. But I should be straight about it. I have never merged two teams or two sets of systems, and I have never been the person accountable for the result inside the company."],
          ["Tell me about the down round.", "The company had eight months of cash and the lead for the new round dropped out. I talked the founder out of a bridge that would have bought three months, helped him cut burn by 40 percent, and we priced a smaller round 35 percent below the last one with a top-up for employees. He was angry with me for a month."],
          ["Notice period and salary expectation?", "Thirty days. With carry I am above a crore, so I would need to understand how you think about the variable part."],
        ],
      },
      {
        id: "s-zoya",
        name: "Zoya Merchant",
        headline: "Director, Investment Banking (Technology M&A) · 9 years",
        score: 8.0,
        minutes: 10,
        location: "Mumbai",
        notice: "90 days",
        expects: "above range",
        areas: [4, 5, 1, 4],
        summary: "Advised on eleven closed technology transactions. Very strong on structuring and valuation. Has only ever been an adviser, never owned a deal after closing, and is on ninety days' notice.",
        turns: [
          ["Eleven closed transactions. What was your role on them?", "Sell-side adviser on nine and buy-side on two. On the last four I ran the deal day to day: the buyer list, the management presentation, the model, the negotiation of price and the main terms. The partner owned the client relationship."],
          ["Explain a structure you are proud of.", "A founder wanted $90 million and the buyer would not go past 70. We closed at 70 with a ratchet: the founder's rolled-over stake stepped up from 12 to 18 percent if revenue passed $40 million in two years. We also used a locked box, so the price was fixed off the last audited balance sheet and there was no fight about working capital at closing."],
          ["What can go wrong with a locked box?", "Leakage. Between the locked-box date and closing the seller still runs the company, so you need a tight definition of what they may take out and an indemnity for anything else. On one deal we caught a dividend they had planned in that window."],
          ["After closing, what happened to the companies you sold?", "I mostly do not know, and that is the honest gap. My work ends at signing. I have heard that two of them struggled with integration, but I was not there for it."],
          ["Why move to a company now?", "Because of that gap. I have advised on eleven deals and owned the outcome of none. I want to be the one still in the room a year later."],
          ["Notice period and salary expectation?", "Ninety days, and the bank rarely shortens it. I am above your range today, and I know that."],
        ],
      },
      {
        id: "s-dev",
        name: "Dev Malhotra",
        headline: "Head of Strategy and Investor Relations at a consumer internet company · 12 years",
        score: 8.3,
        minutes: 12,
        location: "Bengaluru, would relocate to Mumbai",
        notice: "45 days",
        expects: "above range",
        areas: [3, 4, 4, 5],
        summary: "Ran two fundraises and owns the board pack and three-year plan. Led one acquisition and its integration, and is honest that the acquired team mostly left. Only one deal closed.",
        turns: [
          ["How many acquisitions have you closed yourself?", "One. A twenty-person logistics software company, for about $9 million in cash and stock. I ran it without a banker: found them, negotiated with the two founders, and led integration for the first year."],
          ["How did that integration go?", "The product side went well: their routing engine was in our app within five months and cut delivery cost by about six percent. The people side did not. Fourteen of the twenty left inside a year. We had vested most of the founders' stock at closing, which I would not do again."],
          ["You have raised money twice. Tell me about the harder one.", "The second: $110 million when the market had turned. We had three term sheets. I turned down the highest because it carried a two-times liquidation preference that would have sat above every employee. I had to take that to the board with the numbers on what it would cost in a sale at different prices."],
          ["Give me an example of a strategy call that changed because of evidence.", "We planned to launch a subscription at ₹199 a month. I pushed for a pricing test in two cities first. Take-up at 199 was four percent, and at 99 with a delivery cap it was eleven percent with better margin per user. The plan changed, and so did the three-year model I present to the board."],
          ["If I gave you a target tomorrow, could you build the valuation yourself?", "Yes for a DCF and a returns view; I build our own model. On deal structures I am less practised than a banker. I have done one, and I leaned on our lawyers for the mechanics."],
          ["Notice period, location and salary expectation?", "Forty-five days. I am in Bengaluru and would move to Mumbai. I am a little over a crore today."],
        ],
      },
    ],
  },
];

export const sampleRole = (id: unknown) => SAMPLE_ROLES.find((r) => r.id === id);
export const sampleInterview = (id: unknown) => {
  for (const role of SAMPLE_ROLES) {
    const interview = role.interviews.find((i) => i.id === id);
    if (interview) return { role, interview };
  }
  return undefined;
};
