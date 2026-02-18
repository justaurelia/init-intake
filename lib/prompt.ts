import type { ChatState, ComplexityMode } from "./types";

// ─── System prompt ───────────────────────────────────────────────────────────

export const systemPrompt = `You are a premium corporate gifting intake assistant. Reply with STRICT JSON only.

Output shape (no markdown, no code fence):
- assistantMessage (string, required): Your reply to the user. Premium, concise, helpful tone.
- salesSummary (string, optional): Only when not asking a question — 1–2 sentence summary of what they need.
- bundleSuggestions (array, optional): If bundles are provided in the turn context, you may include them. Each item must have exactly: name, unitPrice, leadTimeDays (copy values from context) and an optional why (short reason you suggest it).

Rules:
- Do NOT output or modify state, mode, complexityScore, or missing. The server sets those.
- If bundleSuggestions are included, use the exact name, unitPrice, and leadTimeDays from context; you may only add or omit the "why" field.
- If you are given a nextQuestion: ask exactly that one question in assistantMessage; do not ask extra questions.
- If nextQuestion is null: write a closing assistantMessage and a short salesSummary.
- Do not invent bundle names, prices, or lead times. Only use what the server provides.`;

// ─── User prompt args ─────────────────────────────────────────────────────────

export interface BuildUserPromptArgs {
  message: string;
  state: ChatState;
  mode: ComplexityMode;
  complexityScore: number;
  reasons: string[];
  missing: string[];
  nextField: string | null;
  nextQuestion: string | null;
  bundles: Array<{ name: string; unitPrice: number; leadTimeDays: number }>;
}

// ─── buildUserPrompt ──────────────────────────────────────────────────────────

export function buildUserPrompt(args: BuildUserPromptArgs): string {
  const {
    message,
    state,
    mode,
    complexityScore,
    reasons,
    missing,
    nextField,
    nextQuestion,
    bundles,
  } = args;

  const stateLines: string[] = [];
  if (state.quantity !== undefined) stateLines.push(`quantity: ${state.quantity}`);
  if (state.budgetPerUnitUsd !== undefined)
    stateLines.push(`budgetPerUnitUsd: ${state.budgetPerUnitUsd}`);
  if (state.deadlineText !== undefined)
    stateLines.push(`deadlineText: "${state.deadlineText}"`);
  if (state.shippingType !== undefined)
    stateLines.push(`shippingType: ${state.shippingType}`);
  if (state.branding !== undefined) stateLines.push(`branding: ${state.branding}`);
  if (state.international !== undefined)
    stateLines.push(`international: ${state.international}`);
  if (state.email !== undefined) stateLines.push(`email: ${state.email}`);
  if (state.phone !== undefined) stateLines.push(`phone: ${state.phone}`);

  const stateBlock =
    stateLines.length > 0 ? `Current state:\n${stateLines.join("\n")}` : "Current state: (none yet)";

  const bundlesBlock =
    bundles.length > 0
      ? `Pre-computed bundles (use these exact name/unitPrice/leadTimeDays if you suggest any; you may add "why"):\n${bundles
          .map(
            (b) =>
              `- ${b.name} | unitPrice: ${b.unitPrice} | leadTimeDays: ${b.leadTimeDays}`
          )
          .join("\n")}`
      : "Pre-computed bundles: none for this request.";

  return [
    "User message:",
    message,
    "",
    stateBlock,
    "",
    `Mode: ${mode} | Complexity score: ${complexityScore}${reasons.length > 0 ? ` | Reasons: ${reasons.join(", ")}` : ""}`,
    `Missing fields: ${missing.length > 0 ? missing.join(", ") : "none"}`,
    nextField !== null ? `Next field to collect: ${nextField}` : "No next field (closing turn).",
    nextQuestion !== null ? `Next question to ask (exactly one): ${nextQuestion}` : "No next question. Produce closing message + short salesSummary.",
    "",
    bundlesBlock,
    "",
    "Reply with strict JSON only: { \"assistantMessage\": \"...\", \"salesSummary\": \"...\" (if closing), \"bundleSuggestions\": [ { \"name\", \"unitPrice\", \"leadTimeDays\", \"why\"? } ] (optional) }.",
  ].join("\n");
}

// ─── questionForField ────────────────────────────────────────────────────────

const FIELD_QUESTIONS: Record<string, string> = {
  quantity: "How many recipients (approximate quantity)?",
  budgetPerUnitUsd: "What's your budget per gift (USD)?",
  deadlineText: "What delivery deadline are you targeting?",
  shippingType:
    "Should we ship to one location (bulk) or individual addresses?",
  branding:
    "Do you need branding (none, sticker/insert, laser, embroidery)?",
  international: "Any international destinations (outside the US)?",
  email: "What's the best email or phone to follow up with options?",
};

/**
 * Return the canonical one-question copy for the given intake field key.
 * Unknown keys return a generic prompt.
 */
export function questionForField(field: string): string {
  return FIELD_QUESTIONS[field] ?? `What is your ${field}?`;
}
