import { FeatureStub } from "@/components/FeatureStub";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Chores — Smart Mess" };

/** M3.4 Automated Chore Rotation (Google Tasks API) — Mahia Tanzin. */
export default async function ChoresPage() {
  await requireUser();

  return (
    <FeatureStub
      featureId="M3.4"
      checklist={[
        "List the house's chores and this week's assignments from GET /api/chores.",
        "House-admin form to create a chore: name, frequency, and rotation_order (an ordered array of housemate ids).",
        "Implement the rotation in POST /api/chores/rotate: next index = (last_assigned_index + 1) % rotation_order.length, insert the assignment, save the new cursor. The unique index on (chore_id, due_date) makes a double-run harmless.",
        "Google Tasks: Google SSO alone does NOT grant the tasks scope. Run a second consent flow for https://www.googleapis.com/auth/tasks and store the refresh token in google_credentials.",
        "Push each assignment as a task with a due date and keep the returned id in chore_assignments.google_task_id so you can update it later instead of duplicating.",
        "google_credentials has RLS on and no policies — it is only reachable through createAdminClient(). Do not add a select policy to make it easier.",
        "Run the rotation on a schedule with a Vercel Cron hitting /api/chores/rotate. Protect it with a shared secret header.",
      ]}
    />
  );
}
