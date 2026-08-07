import { HouseManager } from "./HouseManager";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getMyHouses, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

export const metadata = { title: "My houses — Smart Mess" };

type MemberRow = { user_id: string; is_house_admin: boolean; profiles: Profile | null };

/**
 * Common Workflow 2 — house membership.
 *
 * Every other feature scopes its data by house_id, so this page is the entry
 * point for the whole app: no house, nothing to manage.
 */
export default async function HousesPage() {
  const user = await requireUser();
  const memberships = await getMyHouses(user.id);
  const supabase = createClient();

  // Housemates for the primary house, so people can see who they're sharing with.
  let housemates: MemberRow[] = [];
  if (memberships[0]) {
    const { data } = await supabase
      .from("house_members")
      .select("user_id, is_house_admin, profiles(*)")
      .eq("house_id", memberships[0].house_id)
      .eq("status", "ACTIVE");
    housemates = (data as unknown as MemberRow[]) ?? [];
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="My houses"
        subtitle="Create a house if you're a landlord, or join one with the id your house admin shares with you."
      />

      <div className="space-y-4">
        {memberships.length === 0 ? (
          <EmptyState
            title="You're not in a house yet"
            hint="Create one below, or paste a house id to join."
          />
        ) : (
          memberships.map((membership) => (
            <Card key={membership.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium text-slate-900">{membership.houses?.name}</h2>
                  <p className="text-sm text-slate-600">{membership.houses?.address}</p>
                </div>
                {membership.is_house_admin ? <Badge tone="blue">House admin</Badge> : null}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                House id (share this so people can join):{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                  {membership.house_id}
                </code>
              </p>
            </Card>
          ))
        )}

        {housemates.length > 0 ? (
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Housemates</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {housemates.map((member) => (
                <li key={member.user_id} className="flex items-center justify-between py-2">
                  <span>{member.profiles?.full_name || member.profiles?.email}</span>
                  {member.is_house_admin ? <Badge tone="blue">Admin</Badge> : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <HouseManager canCreate={user.profile.role !== "RESIDENT"} />
      </div>
    </div>
  );
}
