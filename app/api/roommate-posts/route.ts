import { badRequest, forbidden, missingFields, ok, readJson, withUser } from "@/lib/api";
import { isHouseAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { Prisma, SleepSchedule } from "@prisma/client";

/**
 * Roommate posts — a flat admin advertising a spare seat in the house they
 * live in.
 *
 * Distinct from listings: a listing is a landlord renting out property to a
 * tenant; this invites someone into an existing household, so only somebody
 * who actually lives there and runs the place may post one.
 */

export const dynamic = "force-dynamic";

export const GET = withUser(async (_user, req: Request) => {
  const params = new URL(req.url).searchParams;

  const filters: Prisma.RoommatePostWhereInput[] = [
    { isActive: true },
    // Anything a system administrator has taken down stays out of search.
    { status: "PUBLISHED" },
  ];

  const maxShare = params.get("max_share");
  const area = params.get("area");
  if (maxShare) filters.push({ monthlyShare: { lte: Number(maxShare) } });
  if (area) filters.push({ house: { area: { contains: area, mode: "insensitive" } } });

  const posts = await prisma.roommatePost.findMany({
    where: { AND: filters },
    include: {
      house: { select: { id: true, name: true, area: true } },
      postedBy: { select: { id: true, name: true } },
      _count: { select: { applications: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return ok({ posts });
});

type RoommatePostBody = {
  houseId: string;
  title: string;
  description?: string;
  monthlyShare: number;
  seatsAvailable?: number;
  availableFrom?: string | null;
  sleepSchedule?: SleepSchedule | null;
  cleanlinessLevel?: number | null;
  smokingOk?: boolean | null;
  petsOk?: boolean | null;
};

export const POST = withUser(async (user, req: Request) => {
  const body = await readJson<RoommatePostBody>(req);
  if (!body) return badRequest("Invalid JSON body");

  const missing = missingFields(body, ["houseId", "title", "monthlyShare"]);
  if (missing.length > 0) return badRequest(`Missing required fields: ${missing.join(", ")}`);

  if (Number(body.monthlyShare) < 0) return badRequest("Monthly share cannot be negative.");
  if (body.seatsAvailable !== undefined && Number(body.seatsAvailable) < 1) {
    return badRequest("There must be at least one seat available.");
  }

  // Only the flat admin (or the landlord/platform admin) may advertise a seat
  // in a house — this is an invitation into a home, not a property to let.
  if (!(await isHouseAdmin(user.id, body.houseId)) && user.profile.role !== "ADMIN") {
    return forbidden("Only the flat admin of that house can advertise a spare seat.");
  }

  const post = await prisma.roommatePost.create({
    data: {
      houseId: body.houseId,
      postedById: user.id,
      title: body.title,
      description: body.description ?? "",
      monthlyShare: Number(body.monthlyShare),
      seatsAvailable: Number(body.seatsAvailable ?? 1),
      availableFrom: body.availableFrom ? new Date(body.availableFrom) : null,
      sleepSchedule: body.sleepSchedule ?? null,
      cleanlinessLevel: body.cleanlinessLevel ?? null,
      smokingOk: body.smokingOk ?? null,
      petsOk: body.petsOk ?? null,
    },
  });

  return ok(post, 201);
});
