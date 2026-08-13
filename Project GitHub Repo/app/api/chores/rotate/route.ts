import { NextResponse } from "next/server";

/**
 * M3.4 Chore rotation job — Mahia Tanzin.
 *
 * Meant to run on a schedule (Vercel Cron: add a `crons` entry in vercel.json
 * pointing at /api/chores/rotate), so there is no logged-in user. Use
 * createAdminClient() and gate it with a shared secret.
 *
 * TODO:
 *  1. Reject unless the request carries your CRON_SECRET header. Without that
 *     anyone can force-rotate every house's chores.
 *  2. For every active chore whose next occurrence is due:
 *       nextIndex = (last_assigned_index + 1) % rotation_order.length
 *       assignee  = rotation_order[nextIndex]
 *       dueDate   = next date implied by `frequency`
 *  3. Insert into chore_assignments. The unique index on (chore_id, due_date)
 *     means a duplicate run is a harmless conflict, not a double assignment —
 *     use upsert with ignoreDuplicates.
 *  4. Write last_assigned_index back to the chore.
 *  5. Push each assignment to the assignee's Google Tasks and store the
 *     returned task id in google_task_id. Skip assignees with no row in
 *     google_credentials rather than failing the whole run.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Chore rotation is not built yet — see the TODO in this route handler." },
    { status: 501 }
  );
}
