import Link from "next/link";

import { RoommateActions } from "./RoommateActions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Roommates — Smart Mess" };

/**
 * Spare seats advertised by the people who already live in a house.
 *
 * Separate from "Find a room": that is a landlord letting a property, this is
 * an existing household inviting someone in.
 */
export default async function RoommatesPage() {
  const user = await requireUser();

  const [posts, myAdminHouses] = await Promise.all([
    prisma.roommatePost.findMany({
      where: { isActive: true, status: "PUBLISHED" },
      include: {
        house: { select: { id: true, name: true, area: true } },
        postedBy: { select: { id: true, name: true } },
        applications: { where: { userId: user.id }, select: { id: true, status: true } },
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.houseMember.findMany({
      where: { userId: user.id, status: "ACTIVE", isHouseAdmin: true },
      select: { houseId: true },
    }),
  ]);

  const adminHouseIds = new Set(myAdminHouses.map((m) => m.houseId));

  return (
    <div>
      <PageHeader
        title="Rooms in shared flats"
        subtitle="Spare seats advertised by the people already living there. Accepting an applicant moves them into the household."
        action={
          adminHouseIds.size > 0 ? (
            <Link
              href="/roommates/new"
              className="inline-flex items-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-card transition hover:bg-brand-800"
            >
              Advertise a spare seat
            </Link>
          ) : null
        }
      />

      {posts.length === 0 ? (
        <EmptyState
          title="No spare seats advertised right now"
          hint={
            adminHouseIds.size > 0
              ? "You run a flat — you can advertise a seat above."
              : "Only someone who runs a flat can advertise a seat in it."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => {
            const mine = adminHouseIds.has(post.houseId);
            const applied = post.applications[0];

            return (
              <Card key={post.id} className="flex h-full flex-col">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h2 className="font-medium text-slate-900">{post.title}</h2>
                  {mine ? <Badge tone="brand">Your flat</Badge> : null}
                </div>

                <p className="tabular text-sm font-medium text-slate-900">
                  ৳{Number(post.monthlyShare).toLocaleString()}
                  <span className="font-normal text-slate-500">/month share</span>
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {post.house.name}
                  {post.house.area ? ` · ${post.house.area}` : ""}
                </p>

                {post.description ? (
                  <p className="mt-2 line-clamp-3 text-sm text-slate-500">{post.description}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  <Badge>
                    {post.seatsAvailable} seat{post.seatsAvailable === 1 ? "" : "s"}
                  </Badge>
                  {post.sleepSchedule ? (
                    <Badge>{post.sleepSchedule.toLowerCase().replace("_", " ")}</Badge>
                  ) : null}
                  {post.cleanliness ? (
                    <Badge>{post.cleanliness.toLowerCase().replace("_", " ")}</Badge>
                  ) : null}
                  {post.petsOk ? <Badge>pets ok</Badge> : null}
                </div>

                <p className="mt-3 text-xs text-slate-400">
                  Posted by {post.postedBy.name} · {post._count.applications} applied
                </p>

                <div className="mt-auto pt-4">
                  <RoommateActions
                    postId={post.id}
                    isMine={mine}
                    existingStatus={applied?.status ?? null}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
