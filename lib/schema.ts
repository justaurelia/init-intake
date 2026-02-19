import { z } from "zod";
import type { ChatState, ComplexityMode } from "./types";

// ─── ChatState validation (mirrors ChatState from ./types) ────────────────────

const ChatStateSchema = z
  .object({
    quantity: z.number().int().positive().optional(),
    budgetPerUnitUsd: z.number().positive().optional(),
    shippingType: z
      .enum(["individual", "bulk", "unknown"])
      .optional(),
    branding: z
      .enum(["embroidery", "laser", "insert", "sticker", "none", "unknown"])
      .optional(),
    international: z.boolean().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    deadlineText: z.string().optional(),
    distributionTiming: z
      .enum(["all_at_once", "over_time", "unknown"])
      .optional(),
    addressHandling: z
      .enum(["provided", "handled_by_us", "unknown"])
      .optional(),
  })
  .strict();

// ─── BundleSuggestionSchema ───────────────────────────────────────────────────

export const BundleSuggestionSchema = z.object({
  name: z.string(),
  unitPrice: z.number(),
  leadTimeDays: z.number(),
  why: z.string(),
});

export type BundleSuggestion = z.infer<typeof BundleSuggestionSchema>;

// ─── BotResponseSchema ───────────────────────────────────────────────────────

export const BotResponseSchema = z.object({
  assistantMessage: z.string(),
  state: ChatStateSchema,
  mode: z.enum(["streamlined", "assisted", "high_touch"]),
  complexityScore: z.number().int().min(1).max(5),
  missing: z.array(z.string()).default([]),
  bundleSuggestions: z.array(BundleSuggestionSchema).optional(),
  salesSummary: z.string().optional(),
  leadCaptured: z.boolean().optional(),
  leadId: z.string().optional(),
});

export type BotResponse = z.infer<typeof BotResponseSchema>;
