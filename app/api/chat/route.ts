import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { extractFromText, computeComplexity, nextMissing } from "../../../lib/brain";
import { suggestBundles } from "../../../lib/bundles";
import { BotResponseSchema, type BotResponse } from "../../../lib/schema";
import { systemPrompt, buildUserPrompt, questionForField } from "../../../lib/prompt";
import type { ChatState } from "../../../lib/types";

const DEFAULT_MODEL = "gpt-4.1-mini";

// ─── Unsure phrase detection ─────────────────────────────────────────────────

const UNSURE_PATTERN = /^(?:i\s+)?(?:don't|do\s+not)\s+know|^(?:i'?m|i\s+am)\s+not\s+sure|^no\s+idea|^not\s+sure|^unsure|^no\s+clue|^skip(?:\s+this)?|^maybe\s+later|^later|^pass|^dunno|^idk$|^rather\s+not\s+say/i;

function isUnsurePhrase(message: string): boolean {
  const t = message.trim().replace(/\s*[.!?]+$/, "");
  if (!t) return false;
  return UNSURE_PATTERN.test(t) || /^(?:i\s+)?(?:don't|do\s+not)\s+have\s+(?:a\s+)?(?:clue|idea)/i.test(t);
}

// ─── Request body validation ──────────────────────────────────────────────────

function parseBody(body: unknown): {
  message: string;
  state: ChatState;
  history: Array<{ role: "user" | "assistant"; content: string }>;
} | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.message !== "string") return null;
  if (o.state === null || typeof o.state !== "object") return null;
  if (!Array.isArray(o.history)) return null;
  const history = o.history as Array<unknown>;
  if (!history.every((h) => typeof h === "object" && h !== null && "role" in h && "content" in h)) return null;
  return {
    message: o.message,
    state: o.state as ChatState,
    history: history as Array<{ role: "user" | "assistant"; content: string }>,
  };
}

// ─── Fallback response builder ─────────────────────────────────────────────────

function buildFallbackResponse(
  state1: ChatState,
  mode: "streamlined" | "assisted" | "high_touch",
  complexityScore: number,
  missing: string[],
  nextQuestion: string | null,
  deterministicBundles: Array<{ name: string; unitPrice: number; leadTimeDays: number }>
): BotResponse {
  let assistantMessage: string;
  if (nextQuestion) {
    assistantMessage = nextQuestion;
  } else if (mode === "streamlined" && deterministicBundles.length > 0) {
    assistantMessage =
      "This looks eligible for a streamlined flow. Here are a few ready-to-ship options. If you'd like, share your email and we'll follow up.";
  } else if (
    state1.email === undefined &&
    state1.phone === undefined &&
    mode !== "streamlined"
  ) {
    assistantMessage =
      "Thanks — what's the best email or phone to follow up with a tailored proposal?";
  } else {
    assistantMessage =
      "Thanks — we've got what we need. We'll follow up shortly.";
  }

  const bullets: string[] = [];
  if (state1.quantity !== undefined) bullets.push(`${state1.quantity} recipients`);
  if (state1.budgetPerUnitUsd !== undefined)
    bullets.push(`$${state1.budgetPerUnitUsd} per gift`);
  if (state1.deadlineText !== undefined)
    bullets.push(`Deadline: ${state1.deadlineText}`);
  if (state1.shippingType !== undefined)
    bullets.push(`Shipping: ${state1.shippingType}`);
  if (state1.branding !== undefined) bullets.push(`Branding: ${state1.branding}`);
  if (state1.international !== undefined)
    bullets.push(`International: ${state1.international}`);
  const salesSummary =
    bullets.length > 0 ? bullets.join(". ") : "Summary of your request.";

  const bundleSuggestions =
    deterministicBundles.length > 0
      ? deterministicBundles.map((b) => ({
          name: b.name,
          unitPrice: b.unitPrice,
          leadTimeDays: b.leadTimeDays,
          why: "Fits your budget and typical lead time.",
        }))
      : undefined;

  const out: BotResponse = {
    assistantMessage,
    state: state1,
    mode,
    complexityScore,
    missing,
    salesSummary,
    bundleSuggestions,
    leadCaptured: false,
  };

  const parsed = BotResponseSchema.safeParse(out);
  if (!parsed.success) {
    return {
      ...out,
      bundleSuggestions: undefined,
      salesSummary: out.salesSummary ?? "",
    };
  }
  return parsed.data;
}

// ─── Lead persistence ────────────────────────────────────────────────────────

async function appendLead(
  state1: ChatState,
  mode: string,
  complexityScore: number,
  reasons: string[],
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{ id: string }> {
  const id = randomUUID();
  const dir = path.join(process.cwd(), "data");
  const filePath = path.join(dir, "leads.json");

  await fs.mkdir(dir, { recursive: true });

  const lead = {
    id,
    createdAt: new Date().toISOString(),
    state: state1,
    mode,
    complexityScore,
    reasons,
    history,
  };

  let existing: unknown[] = [];
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) existing = data;
  } catch {
    // file missing or invalid
  }

  existing.push(lead);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), "utf-8");

  return { id };
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function GET() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = parseBody(body);
    if (!parsed) {
      return NextResponse.json(
        { error: "Body must include message (string), state (object), history (array)" },
        { status: 400 }
      );
    }

    const { message, state, history } = parsed;

    const trimmed = message.trim();
    const userSaidUnsure = isUnsurePhrase(trimmed);

    // 2) Apply deterministic extraction, with special handling for bare numeric
    // or range replies. If user said "I don't know" / "I'm not sure" etc., keep state unchanged.
    const numericMatch = trimmed.match(/^\s*\$?(\d+(?:\.\d+)?)\s*$/);
    const rangeMatch = trimmed.match(/^\s*between\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)\s*$/i)
      ?? trimmed.match(/^\s*(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)\s*$/i)
      ?? trimmed.match(/^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/);

    let state1: ChatState;
    if (userSaidUnsure) {
      state1 = state;
    } else if (rangeMatch) {
      const a = parseFloat(rangeMatch[1]);
      const b = parseFloat(rangeMatch[2]);
      const mid = !Number.isNaN(a) && !Number.isNaN(b) && a > 0 && b > 0
        ? Math.round((a + b) / 2 * 100) / 100
        : NaN;
      if (!Number.isNaN(mid)) {
        if (state.quantity === undefined && state.budgetPerUnitUsd === undefined) {
          state1 = { ...state, quantity: Math.round(mid) };
        } else if (
          state.quantity !== undefined &&
          state.budgetPerUnitUsd === undefined
        ) {
          state1 = { ...state, budgetPerUnitUsd: mid };
        } else {
          state1 = extractFromText(message, state);
        }
      } else {
        state1 = extractFromText(message, state);
      }
    } else if (numericMatch) {
      const n = parseFloat(numericMatch[1]);
      if (!Number.isNaN(n) && n > 0) {
        if (state.quantity === undefined && state.budgetPerUnitUsd === undefined) {
          state1 = { ...state, quantity: n };
        } else if (
          state.quantity !== undefined &&
          state.budgetPerUnitUsd === undefined
        ) {
          state1 = { ...state, budgetPerUnitUsd: n };
        } else {
          state1 = extractFromText(message, state);
        }
      } else {
        state1 = extractFromText(message, state);
      }
    } else {
      state1 = extractFromText(message, state);
    }

    // 3) complexity = computeComplexity(state1)
    const complexity = computeComplexity(state1);

    // 4) missing = nextMissing(state1)
    let missing = nextMissing(state1);
    const mode = complexity.mode;

    // 5) nextField
    let missingNonEmail = missing.filter((f) => f !== "email");
    let nextField: string | null =
      missingNonEmail.length > 0 ? missingNonEmail[0]! : null;
    if (
      nextField === null &&
      mode !== "streamlined" &&
      state1.email === undefined &&
      state1.phone === undefined &&
      missing.includes("email")
    ) {
      nextField = "email";
    }

    // 5b) When user said "I don't know", treat current field as skipped and move to the next
    if (userSaidUnsure && nextField) {
      const skipValue: Partial<ChatState> =
        nextField === "branding"
          ? { branding: "none" }
          : nextField === "international"
            ? { international: false }
            : {};
      if (Object.keys(skipValue).length > 0) {
        state1 = { ...state1, ...skipValue };
        missing = nextMissing(state1);
        missingNonEmail = missing.filter((f) => f !== "email");
        nextField =
          missingNonEmail.length > 0
            ? missingNonEmail[0]!
            : missing.includes("email")
              ? "email"
              : null;
      }
    }

    // 6) bundles
    const bundlesEligible =
      mode === "streamlined" &&
      (missing.length === 0 ||
        (missing.length === 1 && missing[0] === "email"));
    const deterministicBundles = bundlesEligible
      ? suggestBundles(state1).map((b) => ({
          name: b.name,
          unitPrice: b.unitPrice,
          leadTimeDays: b.leadTimeDays,
        }))
      : [];

    // 7) nextQuestion
    const nextQuestion =
      nextField !== null ? questionForField(nextField) : null;

    // 8) OpenAI
    let llmJson: Record<string, unknown> | null = null;
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

    if (apiKey) {
      try {
        const client = new OpenAI({ apiKey });

        const userContent = buildUserPrompt({
          message,
          state: state1,
          mode: complexity.mode,
          complexityScore: complexity.score,
          reasons: complexity.reasons,
          missing,
          nextField,
          nextQuestion,
          bundles: deterministicBundles,
        });

        const completion = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content;
        if (typeof content === "string") {
          llmJson = JSON.parse(content) as Record<string, unknown>;
        }
      } catch (e) {
        // LLM or parse error — use fallback below
      }
    }

    // 9–10) Build final response and validate
    let finalResponse: BotResponse;

    if (llmJson !== null && typeof llmJson.assistantMessage === "string") {
      const base = {
        assistantMessage: llmJson.assistantMessage,
        state: state1,
        mode: complexity.mode,
        complexityScore: complexity.score,
        missing,
      };

      let bundleSuggestions: BotResponse["bundleSuggestions"];
      if (deterministicBundles.length > 0 && Array.isArray(llmJson.bundleSuggestions)) {
        bundleSuggestions = deterministicBundles.map((b) => {
          const fromLlm = (llmJson.bundleSuggestions as Array<Record<string, unknown>>).find(
            (s) => s.name === b.name && s.unitPrice === b.unitPrice && s.leadTimeDays === b.leadTimeDays
          );
          return {
            name: b.name,
            unitPrice: b.unitPrice,
            leadTimeDays: b.leadTimeDays,
            why:
              typeof fromLlm?.why === "string"
                ? fromLlm.why
                : "Fits your budget and typical lead time.",
          };
        });
      } else if (deterministicBundles.length > 0) {
        bundleSuggestions = deterministicBundles.map((b) => ({
          name: b.name,
          unitPrice: b.unitPrice,
          leadTimeDays: b.leadTimeDays,
          why: "Fits your budget and typical lead time.",
        }));
      } else {
        bundleSuggestions = undefined;
      }

      finalResponse = {
        ...base,
        salesSummary:
          typeof llmJson.salesSummary === "string"
            ? llmJson.salesSummary
            : undefined,
        bundleSuggestions,
        leadCaptured: false,
        leadId: undefined,
      };

      const validated = BotResponseSchema.safeParse(finalResponse);
      if (!validated.success) {
        finalResponse = buildFallbackResponse(
          state1,
          complexity.mode,
          complexity.score,
          missing,
          nextQuestion,
          deterministicBundles
        );
      } else {
        finalResponse = validated.data;
      }
    } else {
      finalResponse = buildFallbackResponse(
        state1,
        complexity.mode,
        complexity.score,
        missing,
        nextQuestion,
        deterministicBundles
      );
    }

    if (userSaidUnsure && nextQuestion) {
      finalResponse = {
        ...finalResponse,
        assistantMessage: "No problem — we can add that later. " + nextQuestion,
      };
    }

    // 12) Lead saving
    const hasContact =
      (state1.email !== undefined && state1.email !== "") ||
      (state1.phone !== undefined && state1.phone !== "");
    const leadComplete =
      hasContact &&
      (missing.length === 0 ||
        (missing.length === 1 && missing[0] === "email"));

    if (leadComplete) {
      try {
        const { id } = await appendLead(
          state1,
          complexity.mode,
          complexity.score,
          complexity.reasons,
          history
        );
        finalResponse = {
          ...finalResponse,
          leadCaptured: true,
          leadId: id,
        };
        const revalidate = BotResponseSchema.safeParse(finalResponse);
        if (revalidate.success) finalResponse = revalidate.data;
      } catch {
        // persist failure — keep response without leadId
      }
    }

    return NextResponse.json(finalResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
