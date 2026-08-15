"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, EmptyState, secondaryButtonClass } from "@/components/ui";
import { DEAL_STATUS_LABELS, formatDhakaDate, type DealView } from "@/lib/neighborhood";

/**
 * Deals across the house, soonest expiry first.
 *
 * Every status on this page was derived from timestamps when the page
 * rendered — none of it was read out of `cached_status`. That is what makes the
 * feed safe to trust on a morning when the nightly job did not run.
 */

const TONE: Record<DealView["status"], "green" | "amber" | "slate" | "red"> = {
  ACTIVE: "green",
  EXPIRING_SOON: "amber",
  EXPIRED: "slate",
  RETIRED: "slate",
  ARCHIVED: "slate",
};

export function DealFeed({ deals }: { deals: DealView[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const live = deals.filter((deal) => deal.status === "ACTIVE" || deal.status === "EXPIRING_SOON");
  const past = deals.filter((deal) => deal.status === "EXPIRED" || deal.status === "RETIRED");

  async function report(dealId: string, verdict: "STILL_THERE" | "GONE") {
    setBusyId(dealId);
    setMessage(null);

    const response = await fetch(`/api/neighborhood/deals/${dealId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict }),
    });
    const body = await response.json();
    setBusyId(null);

    if (!response.ok) {
      setMessage(body.error ?? "Could not save that.");
      return;
    }
    if (body.message) setMessage(body.message);
    router.refresh();
  }

  function DealCard({ deal }: { deal: DealView }) {
    return (
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">{deal.title}</span>
              <Badge tone={TONE[deal.status]}>{DEAL_STATUS_LABELS[deal.status]}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-slate-600">
              at{" "}
              <Link
                href={`/neighborhood/places/${deal.bookmarkId}`}
                className="hover:text-brand-700"
              >
                {deal.bookmarkName}
              </Link>
            </p>
            {deal.discountNote ? (
              <p className="mt-1 text-sm font-medium text-brand-700">{deal.discountNote}</p>
            ) : null}
            {deal.description ? (
              <p className="mt-1 text-sm text-slate-700">{deal.description}</p>
            ) : null}
          </div>

          <div className="shrink-0 text-right text-xs text-slate-500">
            {deal.validUntil ? (
              <>until {formatDhakaDate(deal.validUntil)}</>
            ) : (
              <>no end date</>
            )}
            <span className="mt-0.5 block text-slate-400">posted by {deal.postedByName}</span>
          </div>
        </div>

        {deal.needsReconfirmation ? (
          <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            Nobody has confirmed this one in a month. Is the shop still honouring it?
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => report(deal.id, "STILL_THERE")}
            disabled={busyId === deal.id}
          >
            Still honoured
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => report(deal.id, "GONE")}
            disabled={busyId === deal.id}
          >
            Not honoured
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {message ? <p className="text-sm text-amber-700">{message}</p> : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Live now ({live.length})
        </h2>
        {live.length === 0 ? (
          <EmptyState
            title="No live deals"
            hint="Post one from any place on the house map when a shop offers the flat something."
          />
        ) : (
          <div className="space-y-3">
            {live.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Recently ended</h2>
          <p className="mb-3 text-xs text-slate-500">
            Kept for a month so the house can see which shops actually honour what they advertise.
          </p>
          <div className="space-y-3">
            {past.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
