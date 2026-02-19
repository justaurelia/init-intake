/**
 * Lightweight test harness for POST /api/chat
 *
 * Usage:
 *   1) Start the app:  vercel dev   (or  npm run dev)
 *   2) Run tests:      npm run test:chat
 *
 * Default base URL: http://localhost:3000. If your server runs on another
 * port, set BASE_URL, e.g.  BASE_URL=http://localhost:3001 npm run test:chat
 *
 * Exits with code 1 if any test fails or the server is not reachable.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const POLL_MS = 500;
const TIMEOUT_MS = 10_000;

type Mode = "streamlined" | "assisted" | "high_touch";

interface ChatState {
  quantity?: number;
  budgetPerUnitUsd?: number;
  shippingType?: string;
  branding?: string;
  international?: boolean;
  email?: string;
  deadlineText?: string;
}

interface BotResponse {
  assistantMessage: string;
  state: ChatState;
  mode: Mode;
  complexityScore: number;
  missing: string[];
  bundleSuggestions?: Array<{ name: string; unitPrice: number; leadTimeDays: number; why?: string }>;
  salesSummary?: string;
  leadCaptured?: boolean;
  leadId?: string;
}

interface Turn {
  message: string;
}

interface Expected {
  finalMode?: Mode;
  minScore?: number;
  maxScore?: number;
  mustHaveBundles?: boolean;
  mustAskForBudget?: boolean;
  mustAskForEmail?: boolean;
  mustCaptureLead?: boolean;
  expectQuantity?: number;
  expectBudgetPerUnitUsd?: number;
  expectBranding?: string;
  mustContainInMessage?: string;
}

interface TestCase {
  name: string;
  turns: Turn[];
  expected: Expected;
}

const TEST_CASES: TestCase[] = [
  {
    name: "A) Streamlined + bundles",
    turns: [
      {
        message:
          "We need 40 gifts, budget is $45 each, bulk to SF office, all at once, no branding, delivery in 4 weeks.",
      },
    ],
    expected: {
      finalMode: "streamlined",
      maxScore: 2,
      mustHaveBundles: true,
      mustAskForEmail: false,
    },
  },
  {
    name: "B) Missing budget then bundles",
    turns: [
      {
        message:
          "We need 60 holiday gifts for employees, bulk to NYC office, all at once, no logo, mid-December.",
      },
      { message: "Around $70 each." },
    ],
    expected: {
      finalMode: "streamlined",
      mustAskForBudget: true,
      mustHaveBundles: true,
    },
  },
  {
    name: "C) Assisted (individual shipping)",
    turns: [
      {
        message:
          "120 gifts, $85 each, ship to home addresses across the US, we'll provide the addresses, include a note card, mid-December.",
      },
    ],
    expected: {
      finalMode: "assisted",
      minScore: 3,
      mustAskForEmail: true,
    },
  },
  {
    name: "D) High-touch (embroidery + international + tight)",
    turns: [
      {
        message:
          "250 embroidered hoodies, ship to individual addresses in US and Canada, you handle collection and distribution, need them in 2 weeks.",
      },
      { message: "email is zezette@test.com" },
    ],
    expected: {
      finalMode: "high_touch",
      minScore: 5,
      mustAskForEmail: true,
      // leadCaptured only when intake is otherwise complete (all non-email fields filled)
    },
  },
  {
    name: "E) Budget confusion (total budget)",
    turns: [{ message: "Total budget is $5000 for 100 gifts." }],
    expected: {
      mustAskForBudget: true,
    },
  },
  {
    name: "F) Bare number after quantity question",
    turns: [
      { message: "We'd like to explore a small gifting project." },
      { message: "30" },
    ],
    expected: {
      expectQuantity: 30,
    },
  },
  {
    name: "G) Bare number after budget question",
    turns: [
      { message: "We'd like to explore a small gifting project." },
      { message: "30" },
      { message: "30" },
    ],
    expected: {
      expectQuantity: 30,
      expectBudgetPerUnitUsd: 30,
    },
  },
  {
    name: "H) Range for recipients (bare)",
    turns: [
      { message: "We'd like to explore a small gifting project." },
      { message: "between 30 and 50" },
    ],
    expected: {
      expectQuantity: 40,
    },
  },
  {
    name: "I) Range for budget (bare)",
    turns: [
      { message: "We'd like to explore a small gifting project." },
      { message: "between 30 and 50" },
      { message: "between 20 and 40" },
    ],
    expected: {
      expectQuantity: 40,
      expectBudgetPerUnitUsd: 30,
    },
  },
  {
    name: "J) Range with context in one message",
    turns: [
      {
        message:
          "We need between 30 and 50 recipients, budget between 25 and 35 each, bulk, no branding.",
      },
    ],
    expected: {
      expectQuantity: 40,
      expectBudgetPerUnitUsd: 30,
    },
  },
  {
    name: "K) I don't know (skip branding)",
    turns: [
      {
        message:
          "40 gifts, $45 each, bulk shipping, mid-December delivery.",
      },
      { message: "I don't know" },
    ],
    expected: {
      expectBranding: "none",
      mustContainInMessage: "No problem — we can add that later.",
    },
  },
  {
    name: "L) I don't know (skip quantity)",
    turns: [
      { message: "We'd like to explore a small gifting project." },
      { message: "I'm not sure" },
    ],
    expected: {
      expectQuantity: 50,
      mustContainInMessage: "No problem — we can add that later.",
    },
  },
  {
    name: "N) Bulk + storage question (all at once)",
    turns: [
      { message: "50 gifts, $40 each, bulk to Chicago, no branding, 3 weeks." },
      { message: "All at once" },
    ],
    expected: {
      mustAskForEmail: true,
    },
  },
  {
    name: "O) Individual + address question (we provide)",
    turns: [
      {
        message:
          "75 gifts, $55 each, ship to home addresses, no branding, mid-March.",
      },
      { message: "We'll provide the addresses" },
    ],
    expected: {
      mustAskForEmail: true,
    },
  },
  {
    name: "P) Not sure for distribution (bulk)",
    turns: [
      { message: "30 swag, $25 each, bulk, no logo, flexible." },
      { message: "Not sure" },
    ],
    expected: {
      mustContainInMessage: "No problem — we can add that later.",
    },
  },
  {
    name: "M) I don't know (skip international)",
    turns: [
      {
        message:
          "80 gifts, $40 each, ship to individual addresses, we provide the addresses, no branding, mid-January.",
      },
      { message: "Skip" },
    ],
    expected: {
      mustContainInMessage: "No problem — we can add that later.",
      mustAskForEmail: true,
    },
  },
];

function asksForBudget(msg: string): boolean {
  return /budget|per gift|per unit|USD|each\s*\?/i.test(msg);
}

function asksForEmail(msg: string): boolean {
  return /email|e-mail/i.test(msg);
}

async function waitForServer(): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    try {
      const res = await fetch(BASE + "/", { method: "GET" });
      if (res.ok) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.error("Server did not respond at " + BASE + " within " + TIMEOUT_MS / 1000 + "s.");
  console.error("Start the app with: npm run dev");
  process.exit(1);
}

async function runTestCase(tc: TestCase): Promise<{ passed: boolean; errors: string[]; finalResponse: BotResponse | null }> {
  const errors: string[] = [];
  let state: ChatState = {};
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let finalResponse: BotResponse | null = null;
  let sawBudgetAsk = false;
  let sawEmailAsk = false;

  for (const turn of tc.turns) {
    const body = { message: turn.message, state, history };
    const res = await fetch(BASE + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      errors.push(`HTTP ${res.status}: ${await res.text()}`);
      break;
    }

    const data = (await res.json()) as BotResponse;
    finalResponse = data;

    state = data.state;
    history = [...history, { role: "user" as const, content: turn.message }, { role: "assistant" as const, content: data.assistantMessage }];

    if (data.missing?.includes("budgetPerUnitUsd") || asksForBudget(data.assistantMessage)) sawBudgetAsk = true;
    if (data.missing?.includes("email") || asksForEmail(data.assistantMessage)) sawEmailAsk = true;
  }

  if (!finalResponse) {
    return { passed: false, errors, finalResponse: null };
  }

  const e = tc.expected;

  if (e.finalMode !== undefined && finalResponse.mode !== e.finalMode) {
    errors.push(`finalMode: expected "${e.finalMode}", got "${finalResponse.mode}"`);
  }
  if (e.minScore !== undefined && finalResponse.complexityScore < e.minScore) {
    errors.push(`complexityScore: expected >= ${e.minScore}, got ${finalResponse.complexityScore}`);
  }
  if (e.maxScore !== undefined && finalResponse.complexityScore > e.maxScore) {
    errors.push(`complexityScore: expected <= ${e.maxScore}, got ${finalResponse.complexityScore}`);
  }
  if (e.mustHaveBundles !== undefined) {
    const hasBundles = Array.isArray(finalResponse.bundleSuggestions) && finalResponse.bundleSuggestions.length > 0;
    if (e.mustHaveBundles && !hasBundles) errors.push("expected bundleSuggestions, got none");
    if (!e.mustHaveBundles && hasBundles) errors.push("expected no bundleSuggestions");
  }
  if (e.mustAskForBudget && !sawBudgetAsk) {
    errors.push("expected at least one turn to ask for budget (missing budgetPerUnitUsd or message)");
  }
  if (e.mustAskForEmail && !sawEmailAsk) {
    errors.push("expected at least one turn to ask for email (missing email or message)");
  }
  if (e.mustCaptureLead === true && finalResponse.leadCaptured !== true) {
    errors.push("expected leadCaptured === true");
  }
  if (
    e.expectQuantity !== undefined &&
    finalResponse.state.quantity !== e.expectQuantity
  ) {
    errors.push(
      `expected quantity ${e.expectQuantity}, got ${finalResponse.state.quantity}`
    );
  }
  if (
    e.expectBudgetPerUnitUsd !== undefined &&
    finalResponse.state.budgetPerUnitUsd !== e.expectBudgetPerUnitUsd
  ) {
    errors.push(
      `expected budgetPerUnitUsd ${e.expectBudgetPerUnitUsd}, got ${finalResponse.state.budgetPerUnitUsd}`
    );
  }
  if (
    e.expectBranding !== undefined &&
    finalResponse.state.branding !== e.expectBranding
  ) {
    errors.push(
      `expected branding "${e.expectBranding}", got "${finalResponse.state.branding}"`
    );
  }
  if (
    e.mustContainInMessage !== undefined &&
    !finalResponse.assistantMessage.includes(e.mustContainInMessage)
  ) {
    errors.push(
      `expected assistantMessage to contain "${e.mustContainInMessage}"`
    );
  }

  return {
    passed: errors.length === 0,
    errors,
    finalResponse,
  };
}

function reportLine(tc: TestCase, result: { passed: boolean; errors: string[]; finalResponse: BotResponse | null }): string {
  const status = result.passed ? "PASS" : "FAIL";
  const r = result.finalResponse;
  const parts = [
    status,
    tc.name,
    r ? `mode=${r.mode}` : "",
    r ? `score=${r.complexityScore}` : "",
    r ? `missing=[${(r.missing ?? []).join(",")}]` : "",
    r && r.bundleSuggestions?.length ? `bundles=${r.bundleSuggestions.length}` : "bundles=0",
    r?.leadCaptured === true ? "leadCaptured=true" : "",
  ].filter(Boolean);
  return parts.join(" | ");
}

async function main(): Promise<void> {
  console.log("Waiting for server at " + BASE + " ...");
  await waitForServer();
  console.log("Server up. Running " + TEST_CASES.length + " test cases.\n");

  let failed = 0;
  for (const tc of TEST_CASES) {
    const result = await runTestCase(tc);
    console.log(reportLine(tc, result));
    if (!result.passed) {
      failed++;
      result.errors.forEach((err) => console.log("  - " + err));
    }
  }

  console.log("\n" + (failed === 0 ? "All tests passed." : failed + " test(s) failed."));
  process.exit(failed > 0 ? 1 : 0);
}

main();
