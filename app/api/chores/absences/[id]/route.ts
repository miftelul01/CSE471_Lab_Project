import { forbidden, notFound, ok, withUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/** M3.4 — cancel your own upcoming absence. */

export const dynamic = "force-dynamic";

export const DELETE = withUser(async (user, _req: Request, { params }: { params: { id: string } }) => {
  const absence = await prisma.choreAbsence.findUnique({ where: { id: params.id }, select: { userId: true } });
  if (!absence) return notFound("No such absence");
  if (absence.userId !== user.id) return forbidden("You can only cancel your own absence.");

  await prisma.choreAbsence.delete({ where: { id: params.id } });
  return ok({ removed: true });
});
