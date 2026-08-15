import type { BookmarkCategory, DealStatus, Verdict, Visibility } from "@prisma/client";

/**
 * Shared domain logic for M2.4 Shared House Map & Neighbourhood Knowledge Base
 * — Miftelul Mehebub.
 *
 * ── WHY SO MUCH OF THIS IS PURE ─────────────────────────────────────────────
 * Two rules in this feature are easy to get subtly wrong in a way nobody
 * notices for months:
 *
 *   1. A deal's status is DERIVED FROM TIMESTAMPS AT READ TIME. It is never
 *      read out of a column. `deals.cached_status` exists only so SQL can
 *      filter on it; if the nightly job stops running, that column goes stale
 *      and every screen is still correct, because every screen calls
 *      deriveDealStatus() on the timestamps.
 *
 *   2. Distances shown in a list are straight-line, computed here from cached
 *      coordinates at a cost of zero API calls. Road distance costs a request
 *      and is only ever fetched for one destination the resident explicitly
 *      asked to be directed to.
 *
 * Both live here rather than in a route handler so the server and the client
 * components agree by construction instead of by coincidence.
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ── Vocabulary ─────────────────────────────────────────────────────────── */

export const BOOKMARK_CATEGORIES: BookmarkCategory[] = [
  "KACHA_BAZAR",
  "GROCERY",
  "BUTCHER",
  "FISH",
  "PHARMACY",
  "BARBER",
  "TAILOR",
  "LAUNDRY",
  "HARDWARE",
  "ACCESSORIES",
  "GAS_CYLINDER",
  "WATER",
  "RESTAURANT",
  "ATM",
  "TRANSPORT",
  "SERVICE",
  "OTHER",
];

export const CATEGORY_LABELS: Record<BookmarkCategory, string> = {
  KACHA_BAZAR: "Kacha bazar",
  GROCERY: "Grocery",
  BUTCHER: "Butcher",
  FISH: "Fish market",
  PHARMACY: "Pharmacy",
  BARBER: "Barber",
  TAILOR: "Tailor",
  LAUNDRY: "Laundry",
  HARDWARE: "Hardware",
  ACCESSORIES: "Accessories",
  GAS_CYLINDER: "Gas cylinder",
  WATER: "Water supplier",
  RESTAURANT: "Restaurant",
  ATM: "ATM",
  TRANSPORT: "Transport",
  SERVICE: "Service",
  OTHER: "Other",
};

/**
 * Pin and chip colour per category, as hex because MapLibre wants a paint
 * value, not a Tailwind class. Chosen so the categories a resident confuses
 * most in a hurry — the four food ones — are furthest apart in hue.
 */
export const CATEGORY_COLORS: Record<BookmarkCategory, string> = {
  KACHA_BAZAR: "#16a34a",
  GROCERY: "#65a30d",
  BUTCHER: "#be123c",
  FISH: "#0891b2",
  PHARMACY: "#dc2626",
  BARBER: "#7c3aed",
  TAILOR: "#c026d3",
  LAUNDRY: "#0284c7",
  HARDWARE: "#a16207",
  ACCESSORIES: "#db2777",
  GAS_CYLINDER: "#ea580c",
  WATER: "#0ea5e9",
  RESTAURANT: "#f59e0b",
  ATM: "#334155",
  TRANSPORT: "#4f46e5",
  SERVICE: "#475569",
  OTHER: "#64748b",
};

/**
 * What a resident might actually type when they have a need, mapped to the
 * category that answers it.
 *
 * This is the "type a need" half of the need finder, and it is why categories
 * are a closed enum. People search for the errand, not the taxonomy: "gas
 * shesh", "chal kinte hobe", "haircut". Bangla, English and Banglish spellings
 * all appear because all three are what gets typed — the same reason the SQL
 * search behind this uses trigrams and no language model at all.
 */
const CATEGORY_KEYWORDS: Record<BookmarkCategory, string[]> = {
  KACHA_BAZAR: ["kacha", "bazar", "bazaar", "vegetable", "veg", "sabji", "shabji", "কাঁচা", "বাজার", "market"],
  GROCERY: ["grocery", "shop", "store", "dokan", "mudi", "chal", "rice", "daal", "dal", "oil", "মুদি", "দোকান"],
  BUTCHER: ["butcher", "meat", "mangsho", "gosht", "beef", "mutton", "chicken", "murgi", "মাংস"],
  FISH: ["fish", "mach", "machh", "maach", "ilish", "hilsa", "মাছ"],
  PHARMACY: ["pharmacy", "medicine", "chemist", "osud", "ousud", "farmesi", "ঔষধ", "ফার্মেসি"],
  BARBER: ["barber", "salon", "haircut", "hair", "shave", "nappit", "সেলুন"],
  TAILOR: ["tailor", "darji", "stitch", "alter", "sew", "দর্জি"],
  LAUNDRY: ["laundry", "dhopa", "iron", "wash", "dry clean", "লন্ড্রি"],
  HARDWARE: ["hardware", "tools", "paint", "nails", "plumbing", "electric", "bulb", "হার্ডওয়্যার"],
  ACCESSORIES: ["accessories", "mobile", "charger", "cable", "stationery", "phone"],
  GAS_CYLINDER: ["gas", "cylinder", "lpg", "silinder", "গ্যাস", "সিলিন্ডার"],
  WATER: ["water", "jar", "pani", "mineral", "filter", "পানি"],
  RESTAURANT: ["restaurant", "food", "hotel", "biryani", "biriyani", "tehari", "khabar", "খাবার", "রেস্টুরেন্ট"],
  ATM: ["atm", "cash", "bank", "booth", "এটিএম"],
  TRANSPORT: ["cng", "rickshaw", "bus", "uber", "pathao", "stand", "transport", "সিএনজি", "রিকশা"],
  SERVICE: ["service", "repair", "mechanic", "cobbler", "photocopy", "courier", "servicing"],
  OTHER: [],
};

/**
 * Best-guess category for a free-text need, or null when nothing matches and
 * the search should simply run as text.
 *
 * Substring matching in both directions, because "gas" should hit the "gas
 * cylinder" keyword and typing "cylinder lagbe" should hit "cylinder".
 */
export function categoryForNeed(need: string): BookmarkCategory | null {
  const text = need.trim().toLowerCase();
  if (!text) return null;

  for (const category of BOOKMARK_CATEGORIES) {
    if (CATEGORY_LABELS[category].toLowerCase() === text) return category;
  }
  for (const category of BOOKMARK_CATEGORIES) {
    if (CATEGORY_KEYWORDS[category].some((word) => text.includes(word))) return category;
  }
  return null;
}

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  HOUSE: "Whole house",
  PRIVATE: "Only me",
};

export const VERDICT_LABELS: Record<Verdict, string> = {
  STILL_THERE: "Still there",
  GONE: "Gone",
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  ACTIVE: "Active",
  EXPIRING_SOON: "Ending soon",
  EXPIRED: "Expired",
  RETIRED: "Pulled",
  ARCHIVED: "Archived",
};

/* ── Limits ─────────────────────────────────────────────────────────────── */

export const MAX_NAME_LENGTH = 120;
export const MAX_ADDRESS_LENGTH = 300;
export const MAX_NOTE_LENGTH = 1000;
export const MAX_DEAL_TITLE_LENGTH = 120;
export const MAX_DEAL_TEXT_LENGTH = 600;
export const MAX_URL_LENGTH = 500;

/** Most bookmarks one read returns, however many are asked for. */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

/** Notes shown on a bookmark card before the list has to be expanded. */
export const NOTES_PREVIEW_COUNT = 5;

/* ── Distance ───────────────────────────────────────────────────────────── */

export type Coords = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in kilometres.
 *
 * Every distance in a list comes from here and costs nothing. The provider's
 * routing endpoint is never called to sort a list — a house with forty pins
 * would burn its daily allowance on one page load, and the answer would not
 * change the order anyway.
 */
export function haversineKm(from: Coords, to: Coords): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * How a straight-line distance is allowed to be written.
 *
 * Always hedged, always labelled. A resident who reads "1.2 km" and walks into
 * a dead-end alley learned the wrong thing from this screen; the walk is
 * usually longer than the crow flies and sometimes much longer.
 */
export function formatStraightLine(km: number): string {
  if (km < 1) return `~${Math.round(km * 1000)} m straight-line`;
  return `~${km.toFixed(1)} km straight-line`;
}

export function formatRoadDistance(metres: number, seconds: number): string {
  const km = metres / 1000;
  const distance = km < 1 ? `${Math.round(metres)} m` : `${km.toFixed(1)} km`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${distance} · ${minutes} min`;
}

/** ORS profiles offered. Deliberately not rickshaw — ORS has no such profile,
 * and inventing a travel time for one would be a made-up number on a screen
 * people plan errands from. */
export const ROUTE_PROFILES = ["foot-walking", "driving-car"] as const;
export type RouteProfile = (typeof ROUTE_PROFILES)[number];

export const ROUTE_PROFILE_LABELS: Record<RouteProfile, string> = {
  "foot-walking": "Walking",
  "driving-car": "Driving",
};

/* ── Deduplication ──────────────────────────────────────────────────────── */

/**
 * Soft-warning radius for "you may be pinning a place that is already here".
 *
 * 50 m is about the width of a bazar's frontage: two stalls that close together
 * in the same category are usually one place remembered twice, and further
 * apart they usually are not.
 */
export const DUPLICATE_RADIUS_M = 50;

/**
 * Bounding box half-width used to PREFILTER candidates in SQL before the exact
 * haversine runs in application code.
 *
 * 0.00045 degrees is a little over 50 m of latitude, and more than 50 m of
 * longitude everywhere in Bangladesh. Deliberately generous: the box only has
 * to avoid missing a true duplicate, since everything it returns is then
 * measured properly. This is also the whole reason PostGIS is not needed.
 */
export const DUPLICATE_BBOX_DEGREES = 0.00045;

export function isWithinDuplicateRadius(a: Coords, b: Coords): boolean {
  return haversineKm(a, b) * 1000 <= DUPLICATE_RADIUS_M;
}

/* ── Freshness and decay ────────────────────────────────────────────────── */

/** A confirmation older than this stops counting as reassurance. */
export const STALE_AFTER_DAYS = 120;
/** Below this, the entry reads as freshly checked. */
export const FRESH_WITHIN_DAYS = 30;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a soft-deleted bookmark can still be restored. */
export const RESTORE_WINDOW_DAYS = 30;
/** One report per resident per bookmark per this many hours. */
export const REPORT_COOLDOWN_HOURS = 24;
/** A departing resident's PRIVATE bookmarks are purged this long after they go. */
export const PRIVATE_PURGE_AFTER_DAYS = 14;

/**
 * How many distinct residents must report a place gone before it disappears.
 *
 * In a house of two, insisting on two reports means one person living alone
 * with a flatmate who travels can never clean up the map. Above that, one
 * person's mistake — or one person's grudge against a shop — should not delete
 * something the whole household relies on.
 */
export function goneThreshold(activeResidentCount: number): number {
  return activeResidentCount <= 2 ? 1 : 2;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/** "3 days", "8 months" — the age half of a freshness label. */
export function formatAge(from: Date, now: Date = new Date()): string {
  const days = Math.max(0, daysBetween(from, now));
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"}`;
}

export type Freshness = {
  label: string;
  tone: "green" | "slate" | "amber";
  /** Distinct residents who confirmed, excluding whoever added the pin. */
  confirmCount: number;
  confirmLabel: string | null;
  isStale: boolean;
};

/**
 * The line under every entry telling a resident how much to trust it.
 *
 * A map of the neighbourhood is only worth having if it admits when it might be
 * wrong. Shops here close, move one lane over, or turn into a phone repair
 * counter, and the failure this label prevents is someone walking twenty
 * minutes to a pharmacy that shut last winter.
 */
export function freshness(
  input: { lastConfirmedAt: Date | null; createdAt: Date; confirmCount: number },
  now: Date = new Date()
): Freshness {
  const { lastConfirmedAt, createdAt, confirmCount } = input;

  const confirmLabel =
    confirmCount > 0 ? `confirmed by ${confirmCount} resident${confirmCount === 1 ? "" : "s"}` : null;

  if (!lastConfirmedAt) {
    const age = daysBetween(createdAt, now);
    // Nobody but the person who pinned it has ever vouched for this. That is
    // normal for a day-old entry and a warning on a year-old one.
    if (age >= STALE_AFTER_DAYS) {
      return {
        label: `not checked in ${formatAge(createdAt, now)} — may be out of date`,
        tone: "amber",
        confirmCount,
        confirmLabel,
        isStale: true,
      };
    }
    return {
      label: `added ${formatAge(createdAt, now)} ago, not confirmed yet`,
      tone: "slate",
      confirmCount,
      confirmLabel,
      isStale: false,
    };
  }

  const age = daysBetween(lastConfirmedAt, now);
  if (age >= STALE_AFTER_DAYS) {
    return {
      label: `not checked in ${formatAge(lastConfirmedAt, now)} — may be out of date`,
      tone: "amber",
      confirmCount,
      confirmLabel,
      isStale: true,
    };
  }
  return {
    label: age === 0 ? "confirmed today" : `confirmed ${formatAge(lastConfirmedAt, now)} ago`,
    tone: age <= FRESH_WITHIN_DAYS ? "green" : "slate",
    confirmCount,
    confirmLabel,
    isStale: false,
  };
}

/* ── Deal status, derived at read time ──────────────────────────────────── */

/** An open-ended deal goes stale this long after its last confirmation. */
export const OPEN_ENDED_EXPIRY_DAYS = 60;
/** ...and the UI starts asking for re-confirmation this early. */
export const OPEN_ENDED_RECONFIRM_DAYS = 30;
/** How long an expired or pulled deal stays visible before it is archived. */
export const ARCHIVE_AFTER_DAYS = 30;
/** A deal inside this window of its end date is "ending soon". */
export const EXPIRING_SOON_HOURS = 48;

export type DealTimestamps = {
  validFrom: Date;
  validUntil: Date | null;
  lastConfirmedAt: Date | null;
  retiredAt: Date | null;
  createdAt: Date;
};

/**
 * The one place a deal's status is decided.
 *
 * Nothing reads `deals.cached_status` to display anything. That column is
 * written nightly by a cron job so the same answer can be filtered in SQL, and
 * if the job never runs, nothing a resident sees is wrong — it just means a
 * query that wants "only active deals" has to fall back to a wider filter and
 * let this function do the final cut.
 *
 * Order of the rules is load-bearing and follows the spec exactly: a pulled
 * deal is pulled whatever its dates say, and an open-ended deal decays on the
 * age of its last confirmation rather than on a clock it does not have.
 */
export function deriveDealStatus(deal: DealTimestamps, now: Date = new Date()): DealStatus {
  const archived = (since: Date) => daysBetween(since, now) >= ARCHIVE_AFTER_DAYS;

  if (deal.retiredAt) {
    return archived(deal.retiredAt) ? "ARCHIVED" : "RETIRED";
  }

  if (deal.validUntil === null) {
    // Posting a deal is itself an assertion that it was true at the time, so an
    // unconfirmed one decays from when it was written rather than never.
    const vouchedAt = deal.lastConfirmedAt ?? deal.createdAt;
    const staleSince = new Date(vouchedAt.getTime() + OPEN_ENDED_EXPIRY_DAYS * DAY_MS);
    if (now >= staleSince) {
      return archived(staleSince) ? "ARCHIVED" : "EXPIRED";
    }
    return "ACTIVE";
  }

  if (now > deal.validUntil) {
    return archived(deal.validUntil) ? "ARCHIVED" : "EXPIRED";
  }

  if (deal.validUntil.getTime() - now.getTime() <= EXPIRING_SOON_HOURS * 60 * 60 * 1000) {
    return "EXPIRING_SOON";
  }

  return "ACTIVE";
}

/** The two the deal feed leads with. */
export const LIVE_DEAL_STATUSES: DealStatus[] = ["ACTIVE", "EXPIRING_SOON"];

/**
 * Whether an open-ended deal should be nagging someone to re-confirm it.
 * Distinct from being expired: it is still shown and still counted, the card
 * just asks whether the shopkeeper still honours it.
 */
export function needsReconfirmation(deal: DealTimestamps, now: Date = new Date()): boolean {
  if (deal.validUntil !== null || deal.retiredAt !== null) return false;
  const vouchedAt = deal.lastConfirmedAt ?? deal.createdAt;
  return daysBetween(vouchedAt, now) >= OPEN_ENDED_RECONFIRM_DAYS;
}

/* ── Dhaka rendering ────────────────────────────────────────────────────── */

/**
 * Every timestamp in the database is UTC. Every timestamp on screen is Dhaka.
 * Left to the browser's locale, the same deal would appear to end on different
 * days for a resident travelling abroad.
 */
const DHAKA = "Asia/Dhaka";

export function formatDhakaDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: DHAKA,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDhakaDateTime(value: Date | string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: DHAKA,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Shapes the API returns ─────────────────────────────────────────────── */

export type BookmarkNoteView = {
  id: string;
  body: string;
  authorName: string;
  authorId: string | null;
  createdAt: string;
};

export type DealView = {
  id: string;
  bookmarkId: string;
  bookmarkName: string;
  title: string;
  description: string | null;
  discountNote: string | null;
  validFrom: string;
  validUntil: string | null;
  status: DealStatus;
  needsReconfirmation: boolean;
  postedByName: string;
  postedById: string | null;
  lastConfirmedAt: string | null;
};

export type BookmarkView = {
  id: string;
  name: string;
  category: BookmarkCategory;
  visibility: Visibility;
  lat: number | null;
  lng: number | null;
  address: string | null;
  isOnline: boolean;
  onlineUrl: string | null;
  externalPlaceId: string | null;
  addedByName: string;
  addedById: string | null;
  createdAt: string;
  deletedAt: string | null;
  lastConfirmedAt: string | null;
  freshness: Freshness;
  notes: BookmarkNoteView[];
  noteCount: number;
  activeDealCount: number;
  /** Straight-line kilometres from the house pin; null when either end lacks coordinates. */
  distanceKm: number | null;
  canEdit: boolean;
};
