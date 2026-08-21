import { forbidden, notFound, ok, withUser } from "@/lib/api";
import { checkFreeBusy } from "@/lib/google";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 enhancement B — smart rescheduling around calendar conflicts.
 *
 * Live read-IN of the viewing resident's OWN Google Calendar busy blocks on
 * their due date, via a separately-granted calendar.freebusy scope. This is
 * categorically different from teammate Araf's M3.6 (which writes house
 * events OUT to a shared calendar) — this route never reads or writes
 * calendar_events, and never touches anyone's calendar but the assignee's
 * own. Fails open (lib/google.ts's checkFreeBusy) — a Calendar hiccup must
 * never break the chores page, since this only backs a nice-to-have hint.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (user, _req: Request, { params }: { params: { assignmentId: string } }) => {
  const assignment = await prisma.choreAssignment.findUnique({
    where: { id: params.assignmentId },
    select: { userId: true, dueDate: true },
  });
  if (!assignment) return notFound("No such assignment");
  if (assignment.userId !== user.id) return forbidden("You can only check your own calendar.");

  const dayStart = new Date(assignment.dueDate);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const result = await checkFreeBusy(user.id, dayStart, dayEnd);
  return ok({
    connected: result.connected,
    hasConflict: result.connected && result.busy.length > 0,
    busy: result.busy,
  });
});
