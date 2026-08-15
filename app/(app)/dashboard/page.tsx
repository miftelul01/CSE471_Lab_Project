import { redirect } from "next/navigation";

import { FlatHeadDashboard } from "./FlatHeadDashboard";
import { LandlordDashboard } from "./LandlordDashboard";
import { MemberDashboard } from "./MemberDashboard";
import { getMyHouses, requireUser } from "@/lib/auth";
import { personaFor } from "@/lib/navigation";

export const metadata = { title: "Dashboard — Smart Mess" };

/**
 * Three roles, three genuinely different dashboards.
 *
 * A landlord owns flats but lives in none, so showing him "your balance due"
 * or "toggle meal" is meaningless. A flat head runs a household. A member
 * lives in one. This file only decides which of the three to render.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  // System administrators run the platform and get their own console.
  if (user.profile.role === "ADMIN") redirect("/admin");

  const houses = await getMyHouses(user.id);
  const isFlatHead = houses.some((h) => h.isHouseAdmin && h.role === "RESIDENT");
  const persona = personaFor(user.profile.role, isFlatHead);

  if (persona === "LANDLORD") return <LandlordDashboard userId={user.id} name={user.profile.name} />;

  const home = houses.find((h) => h.isHouseAdmin && h.role === "RESIDENT") ?? houses[0] ?? null;

  if (persona === "FLAT_HEAD" && home) {
    return (
      <FlatHeadDashboard
        userId={user.id}
        name={user.profile.name}
        houseId={home.houseId}
        houseName={home.house.name}
      />
    );
  }

  return (
    <MemberDashboard
      userId={user.id}
      name={user.profile.name}
      houseId={home?.houseId ?? null}
      houseName={home?.house.name ?? null}
    />
  );
}
