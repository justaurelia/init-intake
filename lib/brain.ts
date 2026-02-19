import {
  BrainResult,
  BrandingType,
  ChatState,
  CollectedField,
  ComplexityResult,
  FieldType,
  IntakeField,
  IntakeSession,
  IntakeStatus,
  MessageRole,
  ShippingType,
} from "./types";

// ─── extractFromText ──────────────────────────────────────────────────────────

/**
 * Scan free-form user text and return an updated ChatState.
 *
 * Only fields that are confidently detected in `text` are overwritten.
 * Everything else is carried forward unchanged from `prevState`.
 * The caller should therefore always spread the previous state and merge
 * the return value, which this function already does internally.
 *
 * Detection rules per field — no LLM required:
 *
 *   quantity        – number near people/employees/recipients/gifts/units/pcs/items
 *   budgetPerUnitUsd – $N, N each/per person, under N, <= N
 *   shippingType    – keyword groups for "individual" vs "bulk"
 *   branding        – first matching decoration keyword; priority: embroidery >
 *                     laser > insert > sticker > none
 *   international   – presence of international/outside US/Canada/UK/EU/Europe/Asia
 *                     (never set to false — only set to true when found)
 *   email           – first RFC-5322-ish email address
 *   deadlineText    – raw phrase around by/before/need/deadline/ASAP/urgent/mid-*
 */
export function extractFromText(text: string, prevState: ChatState): ChatState {
  const t = text.trim();
  const lower = t.toLowerCase();
  const next: ChatState = { ...prevState };

  // ── quantity ──────────────────────────────────────────────────────────────
  // Range first so "between 30 and 50 recipients" → 40, not 50 from "50 recipients"
  const rangeQty = t.match(/\bbetween\s+(\d+)\s+and\s+(\d+)\s*(?:people|employees|recipients|gifts|units)?/i)
    ?? t.match(/\b(\d+)\s+to\s+(\d+)\s*(?:people|employees|recipients|gifts|units)\b/i)
    ?? t.match(/\b(\d+)\s*-\s*(\d+)\s*(?:people|employees|recipients|gifts|units)\b/i);
  if (rangeQty) {
    const a = parseInt(rangeQty[1], 10);
    const b = parseInt(rangeQty[2], 10);
    if (!isNaN(a) && !isNaN(b) && a > 0 && b > 0) {
      next.quantity = Math.round((a + b) / 2);
    }
  }
  // Single number: quantity patterns
  const qtyPatterns = [
    // number + optional (embroidered|custom) + product keywords ("50 embroidered hoodies", "30 custom kits")
    /\b(\d+)\s+(?:(?:embroidered|custom)\s+)?(?:hoodies?|shirts?|t-?shirts?|jackets?|bags?|kits?|boxes?|gifts?|mugs?|bottles?|notebooks?|devices?|items?|units?|pieces?|pcs)\b/i,

    // number + optional adjective + traditional quantity keywords ("60 holiday gifts")
    /\b(\d+)\s+(?:\w+\s+)?(?:people|employees|recipients|gifts|units|pcs|items)\b/i,

    // number + traditional quantity keywords (no word in between)
    /(?:~|about|approx\.?|around)?\s*(\d+)\s*(?:people|employees|recipients|gifts|units|pcs|items)\b/i,

    // "for 75 people"
    /\bfor\s+(?:~|about|approx\.?|around)?\s*(\d+)\s*(?:people|employees|recipients|guests)?\b/i,

    // "sending 75"
    /\bsend(?:ing)?\s+(?:to\s+)?(?:~|about)?\s*(\d+)\b/i,

    // swag context: "40 onboarding kits", "75 welcome boxes"
    /(?:~|about|approx\.?|around)?\s*(\d+)\s*(?:swag|kits?|boxes?|welcome\s+kits?|onboarding|new\s+hires?|new\s+employees?)\b/i,
  ];
  if (next.quantity === undefined) {
    for (const re of qtyPatterns) {
      const m = t.match(re);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > 0) {
          next.quantity = n;
          break;
        }
      }
    }
  }
  // Fallback: number at beginning + swag context anywhere in sentence
  if (next.quantity === undefined) {
    const startMatch = t.match(/^\s*(\d+)\b/);
    const swagContext = /swag|kit|box|welcome|onboarding|new\s+hire|new\s+employee/i.test(t);

    if (startMatch && swagContext) {
      const n = parseInt(startMatch[1], 10);
      if (!isNaN(n) && n > 0) {
        next.quantity = n;
      }
    }
  }

  // ── budgetPerUnitUsd ──────────────────────────────────────────────────────
  // Range first so "between 25 and 35 each" → 30, not 35 from "35 each"
  const rangeBudget = t.match(/\bbetween\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)\s*(?:each|per\s|dollars?|USD?)\b/i)
    ?? t.match(/\$?(\d+(?:\.\d+)?)\s+to\s+\$?(\d+(?:\.\d+)?)\s*(?:each|per\s)/i)
    ?? t.match(/\$?(\d+(?:\.\d+)?)\s*-\s*\$?(\d+(?:\.\d+)?)\s*(?:each|per\s)/i);
  if (rangeBudget) {
    const a = parseFloat(rangeBudget[1]);
    const b = parseFloat(rangeBudget[2]);
    if (!isNaN(a) && !isNaN(b) && a > 0 && b > 0) {
      next.budgetPerUnitUsd = Math.round(((a + b) / 2) * 100) / 100;
    }
  }
  // Single number: per-unit context (each, per person, under N, around N, etc.)
  if (next.budgetPerUnitUsd === undefined) {
    const budgetPatterns: RegExp[] = [
      /\$(\d+(?:\.\d+)?)\s*(?:each|per\s+(?:person|employee|recipient|unit|head|item)|pp\b)/i,
      /(\d+(?:\.\d+)?)\s*(?:each|per\s+(?:person|employee|recipient|unit|head|item)|pp\b)/i,
      /(?:under|<=?|less\s+than|max(?:imum)?|no\s+more\s+than)\s*\$?(\d+(?:\.\d+)?)/i,
      // "around $35", "about $40", "~$25", "around 35 per gift"
      /(?:around|about|~|approx\.?)\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:each|per\s+(?:gift|person|employee|recipient|unit)|dollars?)?/i,
      // bare $N when quantity context present (e.g. "30 swag around $35")
      /\b(?:around|about|~|approx\.?)\s*\$(\d+(?:\.\d+)?)\b/i,
      /\$\s*(\d+(?:\.\d+)?)\s*$/i, // "$35" at end of input
      /\b(\d+(?:\.\d+)?)\s*\$/i,   // "70$", "35$" (number then dollar sign)
    ];
    for (const re of budgetPatterns) {
      const m = t.match(re);
      if (m) {
        const n = parseFloat(m[1]);
        if (!isNaN(n) && n > 0) {
          next.budgetPerUnitUsd = n;
          break;
        }
      }
    }
  }

  // ── shippingType ──────────────────────────────────────────────────────────
  const individualKw =
    /home\s+address(es)?|individual\s+address(es)?|ship\s+to\s+each|multiple\s+addresses/i;
  const bulkKw =
    /\bbulk\b|one\s+location|ship\s+to\s+(?:the\s+)?office|single\s+address|to\s+our\s+hq/i;

  if (individualKw.test(t)) {
    next.shippingType = "individual" as ShippingType;
  } else if (bulkKw.test(t)) {
    next.shippingType = "bulk" as ShippingType;
  }

  // ── branding ──────────────────────────────────────────────────────────────
  const uncertainBranding =
    /not\s+sure|don'?t\s+know|unsure|open\s+to|flexible|no\s+idea/i.test(t) &&
    /brand|branding|logo|embroidery|engraving|custom/i.test(t);
  if (uncertainBranding) {
    next.branding = undefined;
    (next as Record<string, unknown>).__brandingNeedsQualification = true;
  } else {
    // Priority: embroidery > laser > insert > sticker > none
    type BrandingRule = { type: BrandingType; re: RegExp };
    const brandingRules: BrandingRule[] = [
      { type: "embroidery", re: /\bembroid(?:er(?:ed)?|ery)\b/i },
      { type: "laser", re: /laser|engrav(?:e|ing)/i },
      { type: "insert", re: /\binsert\b|note\s+card|message\s+card/i },
      { type: "sticker", re: /sticker|label/i },
      { type: "none", re: /no\s+branding|no\s+logo|unbranded/i },
    ];
    for (const { type, re } of brandingRules) {
      if (re.test(t)) {
        next.branding = type;
        break;
      }
    }
  }

  // ── distributionTiming (bulk only) ───────────────────────────────────────
  const unsurePhrase =
    /\b(?:not\s+sure|don'?t\s+know|unsure|no\s+idea|no\s+clue|idk|skip)\b/i.test(t);
  if (next.shippingType === "bulk" && next.distributionTiming === undefined) {
    if (unsurePhrase && t.length < 60) {
      next.distributionTiming = "unknown";
    } else if (
      /\b(?:all\s+at\s+once|delivered\s+at\s+once|one\s+delivery|single\s+delivery|all\s+at\s+one\s+time)\b/i.test(
        t
      )
    ) {
      next.distributionTiming = "all_at_once";
    } else if (
      /\b(?:over\s+time|stored\s+and\s+distribut|stored\s+later|distribut(?:e|ed)\s+later|store\s+and\s+distribut)\b/i.test(
        t
      )
    ) {
      next.distributionTiming = "over_time";
    }
  }

  // ── addressHandling (individual only) ─────────────────────────────────────
  if (
    next.shippingType === "individual" &&
    next.addressHandling === undefined
  ) {
    if (unsurePhrase && t.length < 60) {
      next.addressHandling = "unknown";
    } else if (
      /\b(?:we\s+(?:will|'ll|provide)|we\s+have|i(?:'ll| will)\s+provide|provided\s+by\s+us|our\s+addresses|provide\s+the\s+addresses)\b/i.test(
        t
      )
    ) {
      next.addressHandling = "provided";
    } else if (
      /\b(?:you\s+(?:handle|collect)|handle\s+collection|handle\s+distribut|you\s+collect|handled\s+by\s+(?:you|us))\b/i.test(
        t
      )
    ) {
      next.addressHandling = "handled_by_us";
    }
  }

  // ── international ─────────────────────────────────────────────────────────
  // Explicit yes/no when answering "Any international destinations?"
  const bareYes = /^\s*(yes|yeah|yep|yup|sure|correct|we do|we have)\s*[\.\!]?\s*$/i.test(t);
  const bareNo = /^\s*(no|nope|nah|negative|we don't|we do not|us only|domestic only)\s*[\.\!]?\s*$/i.test(t);
  const noInternational = /\b(us only|domestic only|no international|across the us|within the us|in the us|domestic)\b/i.test(t);
  if (bareYes) {
    next.international = true;
  } else if (bareNo || noInternational) {
    next.international = false;
  }
  // Keyword-based: international, outside US, Canada, UK, EU, etc.
  else if (
    /international|outside\s+(?:the\s+)?us|canada|united\s+kingdom|\buk\b|\beu\b|europe|asia/i.test(
      t
    )
  ) {
    next.international = true;
  }

  // ── email ─────────────────────────────────────────────────────────────────
  const emailMatch = t.match(
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/
  );
  if (emailMatch) {
    next.email = emailMatch[0].toLowerCase();
  }

  // ── phone ─────────────────────────────────────────────────────────────────
  const phoneMatch = t.match(
    /(?:\+?\d[\d\s\-\.\(\)]{8,}\d|\b\d{10,}\b)/
  );
  if (phoneMatch) {
    const digits = phoneMatch[0].replace(/\D/g, "");
    if (digits.length >= 10) {
      next.phone = phoneMatch[0].trim();
    }
  }

  // ── deadlineText ──────────────────────────────────────────────────────────
  // Capture the raw phrase — never parse it into a Date.
  const deadlinePatterns: RegExp[] = [
    /\b(by\s+(?:end\s+of\s+)?\S+(?:\s+\S+){0,3})/i,
    /\b(before\s+\S+(?:\s+\S+){0,3})/i,
    /\b(need(?:ed)?\s+(?:by|before|in)\s+\S+(?:\s+\S+){0,3})/i,
    /\b(deadline(?:\s+is)?\s+\S+(?:\s+\S+){0,3})/i,
    /\b(in\s+\d+\s+(?:week|month|day)s?)\b/i,
    /\b(mid-?[A-Z][a-z]+)/,
    /\b(ASAP)\b/i,
    /\b(urgent(?:ly)?)\b/i,
  ];
  for (const re of deadlinePatterns) {
    const m = t.match(re);
    if (m) {
      next.deadlineText = (m[1] ?? m[0]).trim();
      break;
    }
  }

  return next;
}

// ─── _extractField (internal) ─────────────────────────────────────────────────

/**
 * Single-field extraction used by processTurn / schema-driven flow.
 * Not exported — call extractFromText for the multi-field ChatState path.
 */
function _extractField(text: string, field: IntakeField): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  switch (field.type) {
    case FieldType.Email: {
      const m = trimmed.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      return m ? m[0].toLowerCase() : null;
    }
    case FieldType.URL: {
      const m = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
      if (m) return m[0];
      const bare = trimmed.match(/^(?:www\.)?[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:\/\S*)?$/);
      return bare ? `https://${trimmed.replace(/^www\./, "")}` : null;
    }
    case FieldType.Number: {
      const m = trimmed.match(/-?\d+(?:\.\d+)?/);
      return m ? m[0] : null;
    }
    case FieldType.Select: {
      if (!field.options?.length) return trimmed;
      const lower = trimmed.toLowerCase();
      const hit = field.options.find((o) => lower.includes(o.toLowerCase()));
      return hit ?? null;
    }
    case FieldType.Text:
    default:
      return trimmed;
  }
}

// ─── computeComplexity ────────────────────────────────────────────────────────

/**
 * Score an order's operational complexity from the collected ChatState.
 *
 * Scoring rules (additive, start = 1):
 *   +1  budgetPerUnitUsd is missing
 *   +1  shippingType === "individual"
 *   +1  branding is "laser" or "embroidery"
 *   +1  quantity > 200
 *   +2  international === true
 *   +1  deadlineText signals a tight timeline
 *
 * Score is clamped to [1, 5].
 *
 * Mode mapping:
 *   1–2  → "streamlined"
 *   3–4  → "assisted"
 *   5    → "high_touch"
 */
export function computeComplexity(state: ChatState): ComplexityResult {
  let score = 1;
  const reasons: string[] = [];

  if (state.budgetPerUnitUsd === undefined) {
    score += 1;
    reasons.push("Budget not provided");
  }

  if (state.shippingType === "individual") {
    score += 2;
    reasons.push("Individual shipping");
  }

  if (state.distributionTiming === "over_time") {
    score += 1;
    reasons.push("Storage and distribution over time");
  }

  if (state.addressHandling === "handled_by_us") {
    score += 1;
    reasons.push("Address collection and distribution handled by us");
  }

  if (state.branding === "laser" || state.branding === "embroidery") {
    score += 1;
    reasons.push("High-touch branding (laser/embroidery)");
  }

  if (state.quantity !== undefined && state.quantity > 200) {
    score += 1;
    reasons.push("Large quantity");
  }

  if (state.international === true) {
    score += 2;
    reasons.push("International shipping");
  }

  if (state.deadlineText !== undefined && _isTightDeadline(state.deadlineText)) {
    score += 1;
    reasons.push("Tight deadline");
  }

  if ((state as Record<string, unknown>).__brandingNeedsQualification === true) {
    score += 1;
    reasons.push("Branding needs clarification");
  }

  score = Math.min(5, Math.max(1, score));

  let mode: "streamlined" | "assisted" | "high_touch" =
    score <= 2 ? "streamlined" : score <= 4 ? "assisted" : "high_touch";
  if ((state as Record<string, unknown>).__brandingNeedsQualification === true) {
    mode = "assisted";
  }

  return { score, mode, reasons };
}

/**
 * Return true when a raw deadline phrase signals urgency.
 *
 * Matches:
 *   - "ASAP", "urgent", "rush", "immediately"
 *   - "in N weeks" where N ≤ 2
 *   - "in N days" where N ≤ 14
 */
function _isTightDeadline(deadlineText: string): boolean {
  const t = deadlineText.toLowerCase();
  if (/\basap\b/.test(t)) return true;
  if (/\burgent/.test(t)) return true;
  if (/\brush\b/.test(t)) return true;
  if (/\bimmediately\b/.test(t)) return true;

  const weeksMatch = t.match(/\bin\s+(\d+)\s+weeks?\b/);
  if (weeksMatch && parseInt(weeksMatch[1], 10) <= 2) return true;

  const daysMatch = t.match(/\bin\s+(\d+)\s+days?\b/);
  if (daysMatch && parseInt(daysMatch[1], 10) <= 14) return true;

  return false;
}

// ─── _schemaComplexity (internal) ────────────────────────────────────────────

/**
 * Legacy score used by processTurn's schema-driven flow.
 * Returns a raw number in [0, 10]; not exported.
 */
function _schemaComplexity(
  session: IntakeSession,
  schema: IntakeField[]
): number {
  const required = schema.filter((f) => f.required);
  if (required.length === 0) return 0;

  const remaining = required.filter(
    (f) => !(f.key in session.collectedFields)
  ).length;

  const fieldScore = (remaining / required.length) * 7;

  const userTurns = session.messages.filter(
    (m) => m.role === MessageRole.User
  ).length;
  const extraTurns = Math.max(0, userTurns - required.length);
  const convPenalty = Math.min(3, extraTurns * 0.3);

  return Math.round((fieldScore + convPenalty) * 10) / 10;
}

// ─── nextMissing ──────────────────────────────────────────────────────────────

/**
 * Return every ChatState field key that still needs to be collected, in the
 * canonical intake order.
 *
 * Field inclusion rules:
 *
 *   quantity         – always, if undefined
 *   budgetPerUnitUsd – always, if undefined
 *   deadlineText     – always, if undefined
 *   shippingType     – always, if undefined
 *   branding         – always, if undefined
 *   international    – conditional: only when shippingType === "individual"
 *                      AND international is still undefined
 *                      (bulk / unknown shipping → not worth asking)
 *   email            – always, if undefined
 *                      (the API route decides when in the flow to actually ask)
 *
 * Returns an empty array when the state is fully collected.
 */
export function nextMissing(state: ChatState): string[] {
  const missing: string[] = [];

  if (state.quantity === undefined)         missing.push("quantity");
  if (state.budgetPerUnitUsd === undefined)  missing.push("budgetPerUnitUsd");
  if (state.deadlineText === undefined)      missing.push("deadlineText");
  if (state.shippingType === undefined)      missing.push("shippingType");
  if (state.branding === undefined)          missing.push("branding");

  if (state.shippingType === "individual" && state.international === undefined) {
    missing.push("international");
  }

  if (
    state.shippingType === "bulk" &&
    state.distributionTiming === undefined
  ) {
    missing.push("distributionTiming");
  }

  if (
    state.shippingType === "individual" &&
    state.addressHandling === undefined
  ) {
    missing.push("addressHandling");
  }

  if (state.email === undefined && state.phone === undefined)
    missing.push("email");

  return missing;
}

// ─── _nextMissingField (internal) ────────────────────────────────────────────

/**
 * Schema-driven single-field lookup used by processTurn.
 * Not exported — use nextMissing() for the ChatState flow.
 */
function _nextMissingField(
  session: IntakeSession,
  schema: IntakeField[]
): IntakeField | null {
  const collected = session.collectedFields;

  const missingRequired = schema.filter(
    (f) => f.required && !(f.key in collected)
  );
  if (missingRequired.length > 0) return missingRequired[0];

  const missingOptional = schema.filter(
    (f) => !f.required && !(f.key in collected)
  );
  return missingOptional.length > 0 ? missingOptional[0] : null;
}

// ─── processTurn ─────────────────────────────────────────────────────────────

/**
 * Core brain entry point called once per user turn.
 *
 * Steps:
 *   1. Determine which field we are currently targeting (nextMissing).
 *   2. Attempt to extract its value from the latest user message.
 *   3. If extraction succeeds → store the value, re-compute complexity, and
 *      either move to the next field ("ask") or finalise ("finalize").
 *   4. If extraction fails    → re-ask for the same field ("confirm").
 *
 * No LLM calls are made here; message text is assembled from field metadata.
 * Replace the `buildMessage` helpers below with LLM-generated copy later.
 */
export function processTurn(
  userMessage: string,
  session: IntakeSession,
  schema: IntakeField[]
): BrainResult {
  const target = _nextMissingField(session, schema);

  // All fields collected — finalise.
  if (!target) {
    const finalSession: IntakeSession = {
      ...session,
      status: IntakeStatus.Complete,
      complexity: 0,
      updatedAt: new Date().toISOString(),
    };
    return {
      action: "finalize",
      message: buildFinalizeMessage(session),
      updatedSession: finalSession,
    };
  }

  const extracted = _extractField(userMessage, target);

  if (extracted === null) {
    // Could not extract — re-prompt without mutating the session.
    return {
      action: "confirm",
      targetField: target,
      message: buildRepromptMessage(target),
      updatedSession: {
        ...session,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  // Store the extracted value.
  const now = new Date().toISOString();
  const newCollected: CollectedField = {
    key: target.key,
    value: extracted,
    extractedAt: now,
  };

  const updatedCollectedFields = {
    ...session.collectedFields,
    [target.key]: newCollected,
  };

  const partialSession: IntakeSession = {
    ...session,
    collectedFields: updatedCollectedFields,
    updatedAt: now,
  };

  const newComplexity = _schemaComplexity(partialSession, schema);
  const nextField = _nextMissingField(partialSession, schema);

  if (!nextField) {
    const finalSession: IntakeSession = {
      ...partialSession,
      status: IntakeStatus.Complete,
      complexity: 0,
      updatedAt: now,
    };
    return {
      action: "finalize",
      message: buildFinalizeMessage(partialSession),
      updatedSession: finalSession,
    };
  }

  const updatedSession: IntakeSession = {
    ...partialSession,
    complexity: newComplexity,
  };

  return {
    action: "ask",
    targetField: nextField,
    message: buildAskMessage(nextField),
    updatedSession,
  };
}

// ─── Message builders (no LLM — replace with prompt.ts later) ────────────────

function buildAskMessage(field: IntakeField): string {
  const hint = field.hint ? ` (${field.hint})` : "";
  return `Got it! What is your ${field.label}?${hint}`;
}

function buildRepromptMessage(field: IntakeField): string {
  const hint = field.hint ? ` ${field.hint}.` : "";
  return `I didn't catch that — could you share your ${field.label}?${hint}`;
}

function buildFinalizeMessage(session: IntakeSession): string {
  const count = Object.keys(session.collectedFields).length;
  return `Thanks! I've collected all ${count} piece${count === 1 ? "" : "s"} of information. Your intake is complete.`;
}
