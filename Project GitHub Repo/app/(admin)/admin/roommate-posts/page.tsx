import { ModerationTable } from "../listings/ModerationTable";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Roommate posts — Administration" };

/** Moderation of spare-seat adverts posted by flat admins. */
export default async function AdminRoommatePostsPage() {
  const posts = await prisma.roommatePost.findMany({
    include: {
      postedBy: { select: { name: true, email: true } },
      house: { select: { name: true, area: true } },
      removedBy: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Roommate posts"
        subtitle="Spare seats advertised by the people living in a flat. These invite someone into a home, so they are held to the same standard as rentals."
      />
      <ModerationTable
        kind="roommatePost"
        rows={posts.map((post) => ({
          id: post.id,
          title: post.title,
          owner: post.postedBy.name || post.postedBy.email,
          context: post.house.area ? `${post.house.name} · ${post.house.area}` : post.house.name,
          amount: Number(post.monthlyShare),
          isActive: post.isActive,
          status: post.status,
          removedReason: post.removedReason,
          removedBy: post.removedBy?.name ?? null,
        }))}
      />
    </div>
  );
}
