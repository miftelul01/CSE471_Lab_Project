/**
 * The single source of truth for "who owns what".
 *
 * This registry drives the navigation bar, the dashboard checklist, and the
 * banner on every unimplemented page. When you finish a feature, flip its
 * `status` to "done" here — that is the whole handover ritual.
 */

import type { UserRole } from "@prisma/client";

export type FeatureStatus = "done" | "in-progress" | "todo";

export type Feature = {
  /** Requirement id, e.g. "M1.2" = Module 1, second row of the table. */
  id: string;
  module: 0 | 1 | 2 | 3;
  title: string;
  owner: string;
  summary: string;
  /** Page route. */
  href: string;
  /** Route handlers backing it. */
  api: string[];
  /** Tables it owns in supabase/migrations/. */
  tables: string[];
  status: FeatureStatus;
  /** Hide from the nav and dashboard unless the user holds this role. */
  requiresRole?: UserRole;
};

export const OWNERS = {
  miftelul: "Miftelul Mehebub",
  mahia: "Mahia Tanzin",
  araf: "Md. Mahidul Alam Araf",
  shared: "Shared",
} as const;

export const MODULE_NAMES: Record<Feature["module"], string> = {
  0: "Common",
  1: "Module 1",
  2: "Module 2",
  3: "Module 3",
};

export const FEATURES: Feature[] = [
  // ── Common workflows ──────────────────────────────────────────────────────
  {
    id: "C1",
    module: 0,
    title: "Profile & Account",
    owner: OWNERS.shared,
    summary:
      "Registration, login and Google SSO, plus profile management (contact info, emergency details).",
    href: "/profile",
    api: ["app/api/profile/route.ts"],
    tables: ["profiles"],
    status: "done",
  },
  {
    id: "C2",
    module: 0,
    title: "My Houses",
    owner: OWNERS.shared,
    summary:
      "Create or join a house. Accepting a join request automatically admits the applicant, which is what scopes every other feature's data to them.",
    href: "/houses",
    api: ["app/api/houses/route.ts", "app/api/houses/join/route.ts"],
    tables: ["houses", "house_members"],
    status: "done",
  },
  {
    id: "C3",
    module: 0,
    title: "Admin Console",
    owner: OWNERS.shared,
    summary:
      "Platform monitoring across every house, resolution of escalated Mess Court disputes, user role management, and overarching platform settings.",
    href: "/admin",
    api: [
      "app/api/admin/users/route.ts",
      "app/api/admin/disputes/route.ts",
      "app/api/admin/settings/route.ts",
    ],
    tables: ["platform_settings", "profiles", "disputes"],
    status: "done",
    requiresRole: "ADMIN",
  },

  // ── Module 1 ──────────────────────────────────────────────────────────────
  {
    id: "M1.1",
    module: 1,
    title: "Property & Room Listing Engine",
    owner: OWNERS.miftelul,
    summary:
      "Landlords post rooms with rent, location, type and amenities. Residents search and filter. Full CRUD including delisting.",
    href: "/listings",
    api: ["app/api/listings/route.ts", "app/api/listings/[id]/route.ts"],
    tables: ["listings"],
    status: "done",
  },
  {
    id: "M1.2",
    module: 1,
    title: "Smart Roommate & House Matching",
    owner: OWNERS.mahia,
    summary:
      "Lifestyle preference profile, compatibility scoring plus stable matching, saved favourites and formal join requests.",
    href: "/matches",
    api: [
      "app/api/preferences/route.ts",
      "app/api/matches/route.ts",
      "app/api/favorites/route.ts",
      "app/api/join-requests/route.ts",
    ],
    tables: ["preferences", "matches", "favorites", "join_requests"],
    status: "done",
  },
  {
    id: "M1.3",
    module: 1,
    title: "Guest Registration & Accountability Log",
    owner: OWNERS.araf,
    summary:
      "Residents log guest check-in/check-out with name, duration and purpose. House admin is notified. Permanent log per house.",
    href: "/guests",
    api: ["app/api/guests/route.ts"],
    tables: ["guest_logs"],
    status: "done",
  },

  // ── Module 2 ──────────────────────────────────────────────────────────────
  {
    id: "M2.1",
    module: 2,
    title: "Shared Wallet & Bill-Splitting",
    owner: OWNERS.miftelul,
    summary:
      "Any resident adds a shared expense; it splits equally or by custom ratio into a per-person ledger showing paid vs pending.",
    href: "/wallet",
    api: ["app/api/expenses/route.ts"],
    tables: ["expenses", "expense_shares"],
    status: "done",
  },
  {
    id: "M2.2",
    module: 2,
    title: "Weekly Menu Proposal & Voting",
    owner: OWNERS.mahia,
    summary:
      "Residents propose next week's meal plan, housemates vote, and the highest-voted proposal becomes the official menu.",
    href: "/menu",
    api: ["app/api/menu-proposals/route.ts", "app/api/menu-proposals/[id]/vote/route.ts"],
    tables: ["menu_proposals", "menu_proposal_items", "menu_votes"],
    status: "done",
  },
  {
    id: "M2.3",
    module: 2,
    title: "Meal Attendance & Auto-Quantity",
    owner: OWNERS.araf,
    summary:
      "Residents toggle attend/skip per meal. Quantities recalculate for the cook and skipped costs come off the absent resident's share.",
    href: "/meals",
    api: ["app/api/meals/route.ts"],
    tables: ["meals", "meal_attendance"],
    status: "done",
  },
  {
    id: "M2.4",
    module: 2,
    title: "Shared House Map & Neighbourhood Knowledge Base",
    owner: OWNERS.miftelul,
    summary:
      "The household's own map of the neighbourhood — bazar, pharmacy, gas cylinder, tailor — with the house's notes, how recently each was confirmed accurate, distance from the house pin, directions, and an optional deals layer. A resident who joins inherits the whole map.",
    href: "/neighborhood",
    api: [
      "app/api/neighborhood/bookmarks/route.ts",
      "app/api/neighborhood/bookmarks/[id]/route.ts",
      "app/api/neighborhood/bookmarks/[id]/notes/route.ts",
      "app/api/neighborhood/bookmarks/[id]/confirm/route.ts",
      "app/api/neighborhood/deals/route.ts",
      "app/api/neighborhood/deals/[id]/route.ts",
      "app/api/neighborhood/deals/[id]/report/route.ts",
      "app/api/neighborhood/search/route.ts",
      "app/api/neighborhood/house-pin/route.ts",
      "app/api/neighborhood/places/route.ts",
      "app/api/neighborhood/directions/route.ts",
      "app/api/neighborhood/tiles/[...path]/route.ts",
      "app/api/cron/neighborhood/route.ts",
    ],
    tables: [
      "bookmarks",
      "bookmark_notes",
      "confirmations",
      "deals",
      "deal_reports",
      "map_api_cache",
      "map_api_calls",
    ],
    status: "done",
  },

  // ── Module 3 ──────────────────────────────────────────────────────────────
  {
    id: "M3.1",
    module: 3,
    title: "Maintenance Ticket System",
    owner: OWNERS.miftelul,
    summary:
      "Residents report issues; the landlord moves them open -> in progress -> resolved. Full history log per house.",
    href: "/maintenance",
    api: ["app/api/maintenance/route.ts"],
    tables: ["maintenance_tickets", "maintenance_ticket_events"],
    status: "todo",
  },
  {
    id: "M3.2",
    module: 3,
    title: "Payment Integration (bKash / Stripe)",
    owner: OWNERS.miftelul,
    summary:
      "Pay your calculated share from inside the app. On success the wallet ledger flips to paid automatically.",
    href: "/payments",
    api: ["app/api/payments/route.ts", "app/api/payments/webhook/route.ts"],
    tables: ["payments"],
    status: "todo",
  },
  {
    id: "M3.3",
    module: 3,
    title: "Listings Map & Commute Evaluation",
    owner: OWNERS.mahia,
    summary:
      "Rental listings plotted on an embedded map for PROSPECTIVE tenants, with commute distance to a typed destination. Property discovery only — the map of places a household already uses is M2.4.",
    href: "/map",
    api: [],
    tables: ["listings (latitude/longitude)"],
    status: "todo",
  },
  {
    id: "M3.4",
    module: 3,
    title: "Automated Chore Rotation (Google Tasks)",
    owner: OWNERS.mahia,
    summary:
      "Weekly chores rotate through residents automatically and each assignment is pushed to that person's Google Tasks.",
    href: "/chores",
    api: ["app/api/chores/route.ts", "app/api/chores/rotate/route.ts"],
    tables: ["chores", "chore_assignments", "google_credentials"],
    status: "todo",
  },
  {
    id: "M3.5",
    module: 3,
    title: "Mess Court (Conflict Resolution)",
    owner: OWNERS.araf,
    summary:
      "Formal dispute state machine — Raised -> Voting -> Resolved / Escalated -> Archived — with a 48-hour auto-escalation timeout.",
    href: "/mess-court",
    api: ["app/api/disputes/route.ts", "app/api/disputes/escalate/route.ts"],
    tables: ["disputes", "dispute_votes", "dispute_events"],
    status: "todo",
  },
  {
    id: "M3.6",
    module: 3,
    title: "Google Calendar Integration",
    owner: OWNERS.araf,
    summary:
      "Pushes rent due dates, guest check-in windows and dispute deadlines to a shared house Google Calendar.",
    href: "/calendar",
    api: ["app/api/calendar/route.ts"],
    tables: ["calendar_events", "google_credentials"],
    status: "todo",
  },
];

export function getFeature(id: string): Feature {
  const feature = FEATURES.find((f) => f.id === id);
  if (!feature) throw new Error(`Unknown feature id "${id}" — check lib/features.ts`);
  return feature;
}

export function featuresByModule(module: Feature["module"]): Feature[] {
  return FEATURES.filter((f) => f.module === module);
}

/**
 * Features a given role may see. This is presentation only — hiding a link is
 * not access control. The admin console is guarded server-side by
 * requireRole("ADMIN") in app/admin/layout.tsx and by withAdmin() on its routes.
 */
export function visibleFeatures(role: UserRole | null): Feature[] {
  return FEATURES.filter((feature) => !feature.requiresRole || feature.requiresRole === role);
}
