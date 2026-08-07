import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { House, HouseMember, Profile, UserRole } from "@/lib/supabase/types";

/**
 * Session helpers shared by every feature. Use these instead of reading
 * `supabase.auth` directly — it keeps "who am I / which house am I in"
 * answered the same way across all nine features.
 */

export type SessionUser = {
  id: string;
  email: string;
  profile: Profile;
};

/** Current user, or null if signed out. Safe to call from anywhere server-side. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = createClient();

  // getUser() revalidates the JWT with Supabase. Don't switch this to
  // getSession(), which trusts a cookie the client could have tampered with.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return { id: user.id, email: user.email ?? profile.email, profile };
}

/** Same as getSessionUser but redirects to /login when signed out. Use in pages. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Redirects unless the user holds one of `roles`. Use in landlord/admin pages. */
export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.profile.role)) redirect("/");
  return user;
}

export type MembershipWithHouse = HouseMember & { houses: House | null };

/** Every house the current user actively belongs to. */
export async function getMyHouses(userId: string): Promise<MembershipWithHouse[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("house_members")
    .select("*, houses(*)")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("joined_at", { ascending: true });

  return (data as MembershipWithHouse[] | null) ?? [];
}

/**
 * The house a page should show data for. Most features are scoped to one
 * house; until a house-switcher UI exists, "first active membership" is the
 * agreed convention. Returns null if the user hasn't joined a house yet.
 */
export async function getActiveHouseId(userId: string): Promise<string | null> {
  const houses = await getMyHouses(userId);
  return houses[0]?.house_id ?? null;
}
