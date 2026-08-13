import type { UserRole } from "@prisma/client";

/**
 * Sidebar navigation.
 *
 * Grouped by what a resident is trying to DO, not by how the coursework is
 * split. Module numbers and feature owners live in lib/features.ts for our own
 * tracking and are deliberately never rendered anywhere in the product.
 */

export type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  /** Hide unless the signed-in user holds this role. */
  requiresRole?: UserRole;
  /** Hide from residents (landlords and admins only). */
  landlordOnly?: boolean;
};

export type NavGroup = { heading: string; items: NavItem[] };

export type IconName =
  | "dashboard"
  | "search"
  | "match"
  | "building"
  | "users"
  | "guest"
  | "wallet"
  | "card"
  | "vote"
  | "meal"
  | "wrench"
  | "rotate"
  | "gavel"
  | "map"
  | "calendar"
  | "shield";

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard" }],
  },
  {
    heading: "Discover",
    items: [
      { label: "Find a room", href: "/listings", icon: "search" },
      { label: "Roommate matching", href: "/matches", icon: "match" },
      { label: "Map view", href: "/map", icon: "map" },
    ],
  },
  {
    heading: "House management",
    items: [
      { label: "Properties", href: "/properties", icon: "building", landlordOnly: true },
      { label: "Members & requests", href: "/join-requests", icon: "users" },
      { label: "My houses", href: "/houses", icon: "building" },
      { label: "Guest log", href: "/guests", icon: "guest" },
    ],
  },
  {
    heading: "Finance",
    items: [
      { label: "Shared wallet", href: "/wallet", icon: "wallet" },
      { label: "Payments", href: "/payments", icon: "card" },
    ],
  },
  {
    heading: "Meals",
    items: [
      { label: "Menu voting", href: "/menu", icon: "vote" },
      { label: "Meal attendance", href: "/meals", icon: "meal" },
    ],
  },
  {
    heading: "Operations",
    items: [
      { label: "Maintenance", href: "/maintenance", icon: "wrench" },
      { label: "Chore rotation", href: "/chores", icon: "rotate" },
      { label: "House calendar", href: "/calendar", icon: "calendar" },
    ],
  },
  {
    heading: "Governance",
    items: [
      { label: "Mess Court", href: "/mess-court", icon: "gavel" },
      { label: "Administration", href: "/admin", icon: "shield", requiresRole: "ADMIN" },
    ],
  },
];

/** Filters the nav for a role. Presentation only — pages enforce access. */
export function navFor(role: UserRole | null): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    heading: group.heading,
    items: group.items.filter((item) => {
      if (item.requiresRole && item.requiresRole !== role) return false;
      if (item.landlordOnly && role === "RESIDENT") return false;
      return true;
    }),
  })).filter((group) => group.items.length > 0);
}
