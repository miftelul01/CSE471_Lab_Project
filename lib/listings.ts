import type { CleanlinessLevel, RoomType, SleepSchedule } from "@prisma/client";

/**
 * Shared shapes and validation for M1.1 listings, used by both the create and
 * edit endpoints and by the form. Lives here rather than in a route.ts because
 * Next validates the exports of route modules and rejects unexpected ones.
 */

export const ROOM_TYPES: RoomType[] = ["SINGLE", "SHARED", "MASTER", "SEAT", "ENTIRE_FLAT"];
export const SLEEP_SCHEDULES: SleepSchedule[] = ["EARLY_BIRD", "NIGHT_OWL", "FLEXIBLE"];
export const CLEANLINESS_LEVELS: CleanlinessLevel[] = ["VERY_TIDY", "MODERATE", "RELAXED"];

/** Human labels, so the UI and the API agree on wording. */
export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  SINGLE: "Single room",
  SHARED: "Shared room",
  MASTER: "Master bedroom",
  SEAT: "Seat in a shared room",
  ENTIRE_FLAT: "Entire flat",
};

export type ListingInput = {
  title: string;
  description?: string;
  rent: number;
  area: string;
  address?: string;
  roomType: RoomType;
  capacity?: number;
  amenities?: string[];
  latitude?: number | null;
  longitude?: number | null;
  /** Attach to an existing house; omit on create to make one from this listing. */
  houseId?: string | null;
  sleepSchedule?: SleepSchedule | null;
  cleanliness?: CleanlinessLevel | null;
  allowsSmoking?: boolean | null;
  allowsPets?: boolean | null;
  isActive?: boolean;
};

/**
 * Validates whichever fields are present. Returns an error message, or null.
 *
 * Deliberately tolerant of missing fields so PATCH can reuse it — "required"
 * is checked separately by the create endpoint.
 */
export function validateListing(body: Partial<ListingInput>): string | null {
  if (body.title !== undefined && String(body.title).trim().length === 0) {
    return "Title cannot be empty.";
  }
  if (body.area !== undefined && String(body.area).trim().length === 0) {
    return "Area cannot be empty.";
  }
  if (body.rent !== undefined) {
    const rent = Number(body.rent);
    if (!Number.isFinite(rent) || rent < 0) return "Rent must be a number of 0 or more.";
  }
  if (body.capacity !== undefined) {
    const capacity = Number(body.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) {
      return "Capacity must be a whole number of 1 or more.";
    }
  }
  if (body.roomType !== undefined && !ROOM_TYPES.includes(body.roomType)) {
    return `Room type must be one of: ${ROOM_TYPES.join(", ")}.`;
  }
  if (body.sleepSchedule != null && !SLEEP_SCHEDULES.includes(body.sleepSchedule)) {
    return `Sleep schedule must be one of: ${SLEEP_SCHEDULES.join(", ")}.`;
  }
  if (body.cleanliness != null && !CLEANLINESS_LEVELS.includes(body.cleanliness)) {
    return `Cleanliness must be one of: ${CLEANLINESS_LEVELS.join(", ")}.`;
  }
  if (body.amenities !== undefined) {
    if (!Array.isArray(body.amenities) || body.amenities.some((a) => typeof a !== "string")) {
      return "Amenities must be a list of strings.";
    }
  }
  if (body.latitude != null && (Number(body.latitude) < -90 || Number(body.latitude) > 90)) {
    return "Latitude must be between -90 and 90.";
  }
  if (body.longitude != null && (Number(body.longitude) < -180 || Number(body.longitude) > 180)) {
    return "Longitude must be between -180 and 180.";
  }
  return null;
}

/** Turns the comma-separated amenities input into a clean array. */
export function parseAmenities(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
