import { NextResponse } from "next/server";

/**
 * M3.5 Mess Court — 48-hour auto-escalation job (Md. Mahidul Alam Araf).
 *
 * This is the piece that makes the Mess Court a real state machine rather than
 * a CRUD table: a dispute that stalls in VOTING escalates on its own, without
 * anyone clicking anything.
 *
 * TODO:
 *  1. Reject unless the request carries your CRON_SECRET header.
 *  2. With createAdminClient() (no session on a cron request), select disputes
 *     where state = 'VOTING' and voting_deadline < now(). The partial index
 *     disputes_voting_deadline_idx exists for exactly this query.
 *  3. For each: tally dispute_votes. Consensus -> update state to 'RESOLVED'
 *     with a resolution note; otherwise -> 'ESCALATED' for the landlord.
 *  4. Do not write dispute_events or escalated_at — both triggers handle it.
 *  5. Return a count of what you moved so the cron log is useful.
 *
 * Schedule it in vercel.json:
 *   { "crons": [{ "path": "/api/disputes/escalate", "schedule": "0 * * * *" }] }
 */
export async function POST() {
  return NextResponse.json(
    { error: "Dispute auto-escalation is not built yet — see the TODO in this route handler." },
    { status: 501 }
  );
}
