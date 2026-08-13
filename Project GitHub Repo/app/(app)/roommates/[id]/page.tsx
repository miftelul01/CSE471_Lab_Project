import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicantList } from "./ApplicantList";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isHouseAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Roommate post — Smart Mess" };

/** A spare-seat advert, with its applicants if you are the flat admin. */
export default async function RoommatePostPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const post = await prisma.roommatePost.findUnique({
    where: { id: params.id },
    include: {
      house: { select: { id: true, name: true, area: true } },
      postedBy: { select: { name: true } },
      applications: {
        include: { user: { select: { id: true, name: true, email: true, phone: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!post) notFound();

  const runsTheFlat = await isHouseAdmin(user.id, post.houseId);

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/roommates" className="text-sm text-slate-600 hover:underline">
        ← All spare seats
      </Link>

      <PageHeader
        title={post.title}
        subtitle={`${post.house.name}${post.house.area ? ` · ${post.house.area}` : ""} · posted by ${post.postedBy.name}`}
        action={
          post.status === "REMOVED" ? (
            <Badge tone="red">Removed by an administrator</Badge>
          ) : post.isActive ? (
            <Badge tone="green">Open</Badge>
          ) : (
            <Badge tone="amber">Closed</Badge>
          )
        }
      />

      <Card>
        <p className="tabular text-2xl font-semibold tracking-tight text-slate-900">
          ৳{Number(post.monthlyShare).toLocaleString()}
          <span className="text-base font-normal text-slate-500">/month share</span>
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {post.seatsAvailable} seat{post.seatsAvailable === 1 ? "" : "s"} free
          {post.availableFrom
            ? ` · from ${post.availableFrom.toLocaleDateString("en-GB", { dateStyle: "medium" })}`
            : ""}
        </p>
        {post.description ? (
          <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{post.description}</p>
        ) : null}

        {post.status === "REMOVED" && post.removedReason ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            Removed by an administrator: {post.removedReason}
          </p>
        ) : null}
      </Card>

      {runsTheFlat ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            Applicants ({post.applications.length})
          </h2>
          <ApplicantList
            postId={post.id}
            applicants={post.applications.map((a) => ({
              id: a.id,
              name: a.user.name || a.user.email,
              email: a.user.email,
              phone: a.user.phone,
              message: a.message,
              status: a.status,
            }))}
          />
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Only the flat admin can see who has applied.
        </p>
      )}
    </div>
  );
}
