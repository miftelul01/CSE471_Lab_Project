"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, ErrorNote } from "@/components/ui";
import { ROOM_TYPE_LABELS } from "@/lib/listings";
import type { RoomType } from "@prisma/client";

export type PropertyRow = {
  id: string;
  title: string;
  area: string;
  roomType: RoomType;
  rent: number;
  capacity: number;
  isActive: boolean;
  houseName: string | null;
  applicants: number;
  saves: number;
};

/**
 * Portfolio table with inline delist / re-list.
 *
 * Both actions hit the same endpoints the detail page uses, so there is one
 * implementation of "delist" rather than two that can drift.
 */
export function PropertyTable({ listings }: { listings: PropertyRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setListed(id: string, active: boolean) {
    setBusy(id);
    setError(null);

    const response = active
      ? await fetch(`/api/listings/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        })
      : await fetch(`/api/listings/${id}`, { method: "DELETE" });

    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not update that listing");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr className="text-slate-600">
              <th className="px-5 py-3 font-medium">Property</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 text-right font-medium">Rent</th>
              <th className="px-5 py-3 text-right font-medium">Interest</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {listings.map((listing) => (
              <tr key={listing.id} className={listing.isActive ? "" : "bg-slate-50/60"}>
                <td className="px-5 py-3">
                  <Link
                    href={`/listings/${listing.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {listing.title}
                  </Link>
                  <span className="block text-xs text-slate-500">
                    {listing.area}
                    {listing.houseName ? ` · ${listing.houseName}` : ""}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {ROOM_TYPE_LABELS[listing.roomType]}
                  <span className="block text-xs text-slate-400">Sleeps {listing.capacity}</span>
                </td>
                <td className="tabular px-5 py-3 text-right font-medium text-slate-900">
                  ৳{listing.rent.toLocaleString()}
                </td>
                <td className="tabular px-5 py-3 text-right text-slate-600">
                  {listing.applicants} applied
                  <span className="block text-xs text-slate-400">{listing.saves} saved</span>
                </td>
                <td className="px-5 py-3">
                  {listing.isActive ? (
                    <Badge tone="green">Listed</Badge>
                  ) : (
                    <Badge tone="amber">Delisted</Badge>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/listings/${listing.id}/edit`}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      disabled={busy === listing.id}
                      onClick={() => setListed(listing.id, !listing.isActive)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busy === listing.id
                        ? "Working…"
                        : listing.isActive
                          ? "Delist"
                          : "Re-list"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Delisting hides a room from search but keeps it — along with anyone&apos;s saved shortlist
        and past applications. Re-list to put it back.
      </p>
    </div>
  );
}
