import Link from "next/link";
import { notFound } from "next/navigation";

import { BookmarkDetail } from "./BookmarkDetail";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";
import { bookmarkVisibilityFilter, isHouseAdmin } from "@/lib/authz";
import { hasTileProvider } from "@/lib/mapProviders";
import { CATEGORY_LABELS, freshness, haversineKm } from "@/lib/neighborhood";
import { getHousePin, listDeals } from "@/lib/neighborhood.server";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params) {
  // Just the id — resolving the name here would need the same authorised read
  // the page does, and a title is not worth doing it twice.
  return { title: `Place · ${params.id.slice(0, 8)} — Smart Mess` };
}

/** M2.4 — one place, with everything the house knows about it. */
export default async function BookmarkPage({ params }: Params) {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);
  if (!houseId) notFound();

  // The visibility filter is the access check: a pin in another house, or
  // another resident's private one, simply does not exist from here.
  const bookmark = await prisma.bookmark.findFirst({
    where: { id: params.id, ...bookmarkVisibilityFilter(user, houseId) },
    include: {
      notes: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      confirmations: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { resident: { select: { name: true } } },
      },
    },
  });
  if (!bookmark) notFound();

  const [pin, deals, canManage] = await Promise.all([
    getHousePin(houseId),
    listDeals(user, houseId, { bookmarkId: bookmark.id, includeArchived: true }),
    isHouseAdmin(user.id, houseId),
  ]);

  const vouchers = new Set(
    bookmark.confirmations
      .filter((row) => row.verdict === "STILL_THERE" && row.residentId !== bookmark.addedById)
      .map((row) => row.residentId)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={bookmark.name}
        subtitle={`${CATEGORY_LABELS[bookmark.category]} · on your house map`}
        action={
          <Link href="/neighborhood" className={secondaryButtonClass}>
            Back to need finder
          </Link>
        }
      />

      <BookmarkDetail
        bookmark={{
          id: bookmark.id,
          name: bookmark.name,
          category: bookmark.category,
          visibility: bookmark.visibility,
          address: bookmark.address,
          lat: bookmark.latitude,
          lng: bookmark.longitude,
          isOnline: bookmark.isOnline,
          onlineUrl: bookmark.onlineUrl,
          addedByName: bookmark.addedByName,
          createdAt: bookmark.createdAt.toISOString(),
          deletedAt: bookmark.deletedAt?.toISOString() ?? null,
          distanceKm:
            pin && !bookmark.isOnline && bookmark.latitude !== null && bookmark.longitude !== null
              ? haversineKm(pin, { lat: bookmark.latitude, lng: bookmark.longitude })
              : null,
          freshness: freshness({
            lastConfirmedAt: bookmark.lastConfirmedAt,
            createdAt: bookmark.createdAt,
            confirmCount: vouchers.size,
          }),
          canEdit: canManage || bookmark.addedById === user.id,
        }}
        notes={bookmark.notes.map((note) => ({
          id: note.id,
          body: note.body,
          authorId: note.authorId,
          authorName: note.authorName,
          createdAt: note.createdAt.toISOString(),
        }))}
        confirmations={bookmark.confirmations.map((row) => ({
          id: row.id,
          verdict: row.verdict,
          residentName: row.resident.name,
          createdAt: row.createdAt.toISOString(),
        }))}
        deals={deals}
        pin={pin}
        tilesEnabled={hasTileProvider()}
      />
    </div>
  );
}
