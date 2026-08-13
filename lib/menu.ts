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

/**
 * The text columns are Postgres `text`, so the database accepts a title or a
 * meal description of any size. Left unbounded, one paste turns the menu board
 * into a wall of text for the whole house.
 */
export const MAX_PROPOSAL_TITLE_LENGTH = 120;
export const MAX_ITEM_DESCRIPTION_LENGTH = 200;

/**
 * Seven days times three meals. The unique index on
 * (proposal_id, day_of_week, meal_type) already makes more than this
 * impossible, but rejecting it here means a runaway payload is turned away
 * with a readable message instead of a constraint violation.
 */
export const MAX_PROPOSAL_ITEMS = DAY_LABELS.length * MEAL_TYPES.length;

/** Validates a proposal's item list. Returns an error message, or null. */
export function validateProposalItems(items: unknown): string | null {
  if (!Array.isArray(items) || items.length === 0) {
    return "At least one menu item is required.";
  }
  if (items.length > MAX_PROPOSAL_ITEMS) {
    return `A week has room for at most ${MAX_PROPOSAL_ITEMS} meals.`;
  }

  // Two descriptions for the same meal would otherwise reach the database and
  // come back as a unique-constraint error, which reads as "That already
  // exists" and tells the proposer nothing about what to change.
  const seen = new Set<string>();

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
    if (String(description).trim().length > MAX_ITEM_DESCRIPTION_LENGTH) {
      return `Each meal description must be ${MAX_ITEM_DESCRIPTION_LENGTH} characters or fewer.`;
    }

    const key = `${dayOfWeek}-${mealType}`;
    if (seen.has(key)) {
      return `${DAY_LABELS[dayOfWeek]} ${MEAL_TYPE_LABELS[mealType as MealType].toLowerCase()} is listed twice.`;
    }
    seen.add(key);
  }
  return null;
}
