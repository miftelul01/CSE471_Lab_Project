import type { UserRole } from "@prisma/client";

/**
 * Navigation, keyed on what someone actually does here.
 *
 * Three personas, three different products:
 *
 *   LANDLORD   owns flats but lives in none. Property business only — rooms,
 *              applicants, tenants' maintenance, guest oversight. Deliberately
 *              NO wallet / meals / chores / menu: he is not in the household.
 *   FLAT_HEAD  a resident who runs one household. Everything a member has,
 *              plus the levers to run the place: members, roommate ads, money.
 *   MEMBER     lives in a flat. Their own share, their own meals and chores.
 *
 * System administrators get their own console entirely — see AdminSidebar.
 */

export type Persona = "LANDLORD" | "FLAT_HEAD" | "MEMBER";

export type NavItem = { label: string; href: string; icon: IconName };
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
  | "pin"
  | "calendar"
  | "shield"
  | "message";

const LANDLORD_NAV: NavGroup[] = [
  { heading: "Overview", items: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard" }] },
  {
    heading: "Portfolio",
    items: [
      { label: "Properties", href: "/properties", icon: "building" },
      { label: "Applications", href: "/join-requests", icon: "users" },
      { label: "My houses", href: "/houses", icon: "guest" },
      { label: "Messages", href: "/messages", icon: "message" },
    ],
  },
  {
    heading: "Oversight",
    items: [
      { label: "Maintenance", href: "/maintenance", icon: "wrench" },
      { label: "Guest log", href: "/guests", icon: "guest" },
      { label: "Escalated cases", href: "/mess-court", icon: "gavel" },
    ],
  },
];

const FLAT_HEAD_NAV: NavGroup[] = [
  { heading: "Overview", items: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard" }] },
  {
    heading: "My flat",
    items: [
      { label: "Members", href: "/houses", icon: "users" },
      { label: "Roommate ads", href: "/roommates", icon: "match" },
      { label: "Guest log", href: "/guests", icon: "guest" },
      { label: "Messages", href: "/messages", icon: "message" },
      { label: "Neighbourhood", href: "/neighborhood", icon: "pin" },
    ],
  },
  {
    heading: "Money",
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
  { heading: "Governance", items: [{ label: "Mess Court", href: "/mess-court", icon: "gavel" }] },
];

const MEMBER_NAV: NavGroup[] = [
  { heading: "Overview", items: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard" }] },
  {
    heading: "Find a place",
    items: [
      { label: "Find a room", href: "/listings", icon: "search" },
      { label: "Rooms in flats", href: "/roommates", icon: "guest" },
      { label: "Roommate matching", href: "/matches", icon: "match" },
      { label: "Listings map", href: "/map", icon: "map" },
      { label: "Messages", href: "/messages", icon: "message" },
    ],
  },
  {
    heading: "My flat",
    items: [
      { label: "Housemates", href: "/houses", icon: "users" },
      { label: "Guest log", href: "/guests", icon: "guest" },
      { label: "Neighbourhood", href: "/neighborhood", icon: "pin" },
    ],
  },
  {
    heading: "My money",
    items: [
      { label: "My share", href: "/wallet", icon: "wallet" },
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
      { label: "My chores", href: "/chores", icon: "rotate" },
    ],
  },
  { heading: "Governance", items: [{ label: "Mess Court", href: "/mess-court", icon: "gavel" }] },
];

/**
 * Landlord is decided by role. The split between flat head and member is
 * decided by whether they run the household they live in — exactly one member
 * per flat does.
 */
export function personaFor(role: UserRole, isFlatHead: boolean): Persona {
  if (role === "LANDLORD") return "LANDLORD";
  return isFlatHead ? "FLAT_HEAD" : "MEMBER";
}

export function navFor(persona: Persona): NavGroup[] {
  if (persona === "LANDLORD") return LANDLORD_NAV;
  if (persona === "FLAT_HEAD") return FLAT_HEAD_NAV;
  return MEMBER_NAV;
}

export const PERSONA_LABEL: Record<Persona, string> = {
  LANDLORD: "Landlord",
  FLAT_HEAD: "Flat head",
  MEMBER: "Resident",
};
