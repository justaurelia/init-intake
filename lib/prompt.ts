import type { ChatState, ComplexityMode } from "./types";

// ─── System prompt ───────────────────────────────────────────────────────────

export const systemPrompt = `You are a premium corporate gifting intake assistant. Reply with STRICT JSON only.

Output shape (no markdown, no code fence):
- assistantMessage (string, required): Your reply to the user. Premium, concise, helpful tone.
- bundleSuggestions (array, optional): If bundles are provided in the turn context, you may include them. Each item must have exactly: name, unitPrice, leadTimeDays (copy values from context) and an optional why (short reason you suggest it).

Rules:
- Do NOT output or modify state, mode, complexityScore, or missing. The server sets those.
- If bundleSuggestions are included, use the exact name, unitPrice, and leadTimeDays from context; you may only add or omit the "why" field.
- If you are given a nextQuestion: output ONLY that question in assistantMessage. No preamble, no order recap, no "Given your budget...", no context — just the question text.
- If nextQuestion is null: do nothing.
- Do not invent bundle names, prices, or lead times. Only use what the server provides.
- For all paths (streamlined, assisted, high_touch), when the next field to collect is contact (email), ask explicitly for contact — but only in that turn; never ask for contact in the same message as another question.`;

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
    nextField !== null
      ? `Next field to collect: ${nextField}${nextField === "email" ? " (REQUIRED: ask for contact before closing)" : ""}`
      : "No next field (closing turn).",
    nextQuestion !== null
      ? `Next question to ask — output ONLY this text, nothing else (no preamble, no recap): ${nextQuestion}`
      : "No next question. No closing message.",
    "",
    bundlesBlock,
    "",
    "Reply with strict JSON only: { \"assistantMessage\": \"...\", \"bundleSuggestions\": [ { \"name\", \"unitPrice\", \"leadTimeDays\", \"why\"? } ] (optional) }.",
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
  distributionTiming:
    "Will all items be delivered at once, or stored and distributed later?",
  addressHandling:
    "Will you provide the shipping addresses, or would you like us to handle collection and distribution?",
  email: "What's the best email or phone to follow up with options?",
};

/**
 * Return the canonical one-question copy for the given intake field key.
 * Unknown keys return a generic prompt.
 */
export function questionForField(field: string): string {
  return FIELD_QUESTIONS[field] ?? `What is your ${field}?`;
}
