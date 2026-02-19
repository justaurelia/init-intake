// ─── Enums ────────────────────────────────────────────────────────────────────

export enum MessageRole {
  System = "system",
  User = "user",
  Assistant = "assistant",
}

export enum IntakeStatus {
  Active = "active",
  Complete = "complete",
  Abandoned = "abandoned",
}

export enum FieldType {
  Text = "text",
  Email = "email",
  URL = "url",
  Number = "number",
  Select = "select",
}

// ─── Core domain types ────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** ISO timestamp (string for JSON-safe serialization). */
  createdAt: string;
}

/** A single field declared in the intake schema. */
export interface IntakeField {
  /** Unique machine-readable key, e.g. "contactEmail". */
  key: string;
  /** Human-readable label shown in prompts, e.g. "Contact Email". */
  label: string;
  type: FieldType;
  required: boolean;
  /** Optional clarifying hint injected into the prompt for this field. */
  hint?: string;
  /** Ordered list of accepted values — only used when type === FieldType.Select. */
  options?: string[];
  validation?: FieldValidation;
}

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  /** Regex pattern the extracted value must satisfy. */
  pattern?: string;
}

/** A field value successfully collected from the user. */
export interface CollectedField {
  key: string;
  value: string;
  /** ISO timestamp of when this value was extracted. */
  extractedAt: string;
}

/**
 * The full state of one intake conversation.
 * Persisted between turns and passed into brain functions.
 */
export interface IntakeSession {
  sessionId: string;
  /** Optional — can be populated once the company is identified. */
  companyId?: string;
  /** Map of field key → collected value for O(1) lookup. */
  collectedFields: Record<string, CollectedField>;
  messages: ChatMessage[];
  status: IntakeStatus;
  /**
   * Complexity score. For ChatState-based flow use brain.computeComplexity(state):
   * returns an integer in [1, 5], higher = more complex. Schema-driven flow may
   * persist a different scale (e.g. 0–10) via _schemaComplexity.
   */
  complexity: number;
  startedAt: string;
  updatedAt: string;
}

// ─── API shapes ───────────────────────────────────────────────────────────────

export interface ChatRequest {
  sessionId: string;
  message: string;
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  status: IntakeStatus;
  complexity: number;
}

// ─── ChatState ────────────────────────────────────────────────────────────────

export type ShippingType = "individual" | "bulk" | "unknown";

export type BrandingType = "embroidery" | "laser" | "insert" | "sticker" | "none" | "unknown";

/**
 * The domain-specific fields extracted incrementally from free-form user text.
 * Every field is optional — extractFromText only populates what it can confidently detect;
 * everything else is inherited from the previous state unchanged.
 */
/** Bulk: all delivered at once vs stored and distributed over time. */
export type DistributionTiming = "all_at_once" | "over_time" | "unknown";

/** Individual: addresses provided by client vs handled by us. */
export type AddressHandling = "provided" | "handled_by_us" | "unknown";

export interface ChatState {
  /** Number of people / units the order covers. */
  quantity?: number;
  /** Per-unit budget in USD. */
  budgetPerUnitUsd?: number;
  /** Whether items ship to individual addresses or a single bulk location. */
  shippingType?: ShippingType;
  /** Primary branding / decoration method requested. */
  branding?: BrandingType;
  /** True when the order includes non-US destinations. */
  international?: boolean;
  /** Contact email extracted from the conversation. */
  email?: string;
  /** Contact phone extracted from the conversation. */
  phone?: string;
  /** Raw deadline phrase as the user wrote it — never parsed into a Date. */
  deadlineText?: string;
  /** Bulk only: all at once vs stored/distributed over time. */
  distributionTiming?: DistributionTiming;
  /** Individual only: addresses provided vs we handle collection/distribution. */
  addressHandling?: AddressHandling;
}

// ─── Complexity ───────────────────────────────────────────────────────────────

/** Routing tier derived from the complexity score. */
export type ComplexityMode = "streamlined" | "assisted" | "high_touch";

export interface ComplexityResult {
  /** Integer in [1, 5]. Higher = more complex order. */
  score: number;
  /** Human-routing tier mapped from score. */
  mode: ComplexityMode;
  /** One short string per scoring rule that fired. */
  reasons: string[];
}

// ─── Brain output ─────────────────────────────────────────────────────────────

export type BrainAction = "ask" | "confirm" | "finalize";

export interface BrainResult {
  /** What the brain decided to do this turn. */
  action: BrainAction;
  /** The field being targeted by an "ask" or "confirm" action. */
  targetField?: IntakeField;
  /** The message text to send back to the user. */
  message: string;
  /** Session after applying this turn's updates (immutable — caller must persist). */
  updatedSession: IntakeSession;
}
