import type { MealType } from "@prisma/client";

/**
 * Shared shapes and validation for M2.2 Weekly Menu Proposal & Voting,
 * used by both the propose/close endpoints and the form.
 */

export const MEAL_TYPES: MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};

// dayOfWeek is ISO-style: 0 = Monday ... 6 = Sunday, matching weekStartDate
// always being that week's Monday (see mondayOf below).
export const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/**
 * Normalises any date to the Monday of its week (UTC, so it's stable
 * regardless of server timezone). The partial unique index that enforces
 * "one approved menu per house per week" is keyed on this exact value, so
 * every proposal for the same calendar week must collapse to the same date
 * regardless of which day the proposer happened to pick in the form.
 */
export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export type ProposalItemInput = { dayOfWeek: number; mealType: MealType; description: string };

/** Validates a proposal's item list. Returns an error message, or null. */
export function validateProposalItems(items: unknown): string | null {
  if (!Array.isArray(items) || items.length === 0) {
    return "At least one menu item is required.";
  }
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) return "Each item must be an object.";
    const { dayOfWeek, mealType, description } = raw as Partial<ProposalItemInput>;
    if (typeof dayOfWeek !== "number" || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return "dayOfWeek must be a whole number from 0 (Monday) to 6 (Sunday).";
    }
    if (!mealType || !MEAL_TYPES.includes(mealType as MealType)) {
      return `mealType must be one of: ${MEAL_TYPES.join(", ")}.`;
    }
    if (!description || String(description).trim().length === 0) {
      return "Each item needs a description.";
    }
  }
  return null;
}
