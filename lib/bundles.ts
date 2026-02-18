import type { ChatState, ShippingType, BrandingType } from "./types";

// ─── Bundle type ─────────────────────────────────────────────────────────────

export interface Bundle {
  id: string;
  name: string;
  unitPrice: number;
  leadTimeDays: number;
  minQty: number;
  maxQty: number;
  eligibleShipping: Array<"bulk" | "individual" | "unknown">;
  eligibleBranding: Array<"none" | "sticker" | "insert" | "laser" | "embroidery" | "unknown">;
  notes: string;
}

// ─── BUNDLES constant ────────────────────────────────────────────────────────

export const BUNDLES: Bundle[] = [
  {
    id: "snack-box",
    name: "Snack Box",
    unitPrice: 18,
    leadTimeDays: 5,
    minQty: 25,
    maxQty: 500,
    eligibleShipping: ["bulk", "individual", "unknown"],
    eligibleBranding: ["none", "sticker", "insert", "unknown"],
    notes: "Curated snacks, insert or sticker. Low complexity, fast ship.",
  },
  {
    id: "notebook-pen",
    name: "Notebook + Pen",
    unitPrice: 22,
    leadTimeDays: 7,
    minQty: 50,
    maxQty: 1000,
    eligibleShipping: ["bulk", "individual", "unknown"],
    eligibleBranding: ["none", "sticker", "insert", "laser", "unknown"],
    notes: "Laser engraving optional on pen or notebook cover.",
  },
  {
    id: "coffee-kit",
    name: "Coffee Kit",
    unitPrice: 28,
    leadTimeDays: 5,
    minQty: 30,
    maxQty: 400,
    eligibleShipping: ["bulk", "individual", "unknown"],
    eligibleBranding: ["none", "sticker", "insert", "unknown"],
    notes: "Mug or tumbler, coffee samples. Sticker or insert.",
  },
  {
    id: "throw-blanket",
    name: "Cozy Throw Blanket",
    unitPrice: 35,
    leadTimeDays: 10,
    minQty: 25,
    maxQty: 200,
    eligibleShipping: ["bulk", "individual", "unknown"],
    eligibleBranding: ["none", "insert", "unknown"],
    notes: "Premium throw with optional note card insert.",
  },
  {
    id: "wellness-tea-kit",
    name: "Wellness / Tea Kit",
    unitPrice: 24,
    leadTimeDays: 6,
    minQty: 25,
    maxQty: 350,
    eligibleShipping: ["bulk", "individual", "unknown"],
    eligibleBranding: ["none", "sticker", "insert", "unknown"],
    notes: "Tea, honey stick, tin. Insert or sticker.",
  },
];

// ─── suggestBundles ──────────────────────────────────────────────────────────

export interface SuggestedBundle {
  name: string;
  unitPrice: number;
  leadTimeDays: number;
  why?: string;
}

/**
 * Suggest up to 3 bundles that fit the current ChatState.
 *
 * - Requires state.quantity and state.budgetPerUnitUsd; otherwise returns [].
 * - Only bundles where unitPrice <= budgetPerUnitUsd * 0.75 (margin buffer).
 * - Quantity must be within [minQty, maxQty].
 * - If shippingType (or branding) is set, bundle must list it in eligibleShipping
 *   (eligibleBranding). Undefined is treated as "unknown".
 * - Sorted by leadTimeDays asc, then unitPrice desc; top 3 returned.
 */
export function suggestBundles(state: ChatState): SuggestedBundle[] {
  const qty = state.quantity;
  const budget = state.budgetPerUnitUsd;

  if (qty === undefined || budget === undefined) {
    return [];
  }

  const shipping = state.shippingType ?? "unknown";
  const branding = state.branding ?? "unknown";

  const maxUnitPrice = budget * 0.75;

  const eligible = BUNDLES.filter((b) => {
    if (b.unitPrice > maxUnitPrice) return false;
    if (qty < b.minQty || qty > b.maxQty) return false;
    if (!b.eligibleShipping.includes(shipping)) return false;
    if (!b.eligibleBranding.includes(branding)) return false;
    return true;
  });

  const sorted = [...eligible].sort((a, b) => {
    if (a.leadTimeDays !== b.leadTimeDays) return a.leadTimeDays - b.leadTimeDays;
    return b.unitPrice - a.unitPrice;
  });

  return sorted.slice(0, 3).map((b) => ({
    name: b.name,
    unitPrice: b.unitPrice,
    leadTimeDays: b.leadTimeDays,
    why: b.leadTimeDays <= 6 ? "Fast turnaround" : undefined,
  }));
}
