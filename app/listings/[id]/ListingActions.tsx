"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, ErrorNote, SuccessNote, buttonClass, secondaryButtonClass } from "@/components/ui";
import type { JoinRequestStatus } from "@prisma/client";

/**
 * Actions on a listing detail page. The owner gets edit/delist; everyone else
 * gets save-to-favourites and request-to-join (M1.2's entry points).
 */
export function ListingActions({
  listingId,
  isOwner,
  isActive,
  isFavorited,
  existingRequestStatus,
}: {
  listingId: string;
  isOwner: boolean;
  isActive: boolean;
  isFavorited: boolean;
  existingRequestStatus: JoinRequestStatus | null;
}) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(isFavorited);
  const [requestStatus, setRequestStatus] = useState(existingRequestStatus);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Request failed");
      return null;
    }
    return body;
  }

  async function toggleFavorite() {
    if (favorited) {
      const result = await call(`/api/favorites?listing_id=${listingId}`, { method: "DELETE" });
      if (result) setFavorited(false);
      return;
    }
    const result = await call("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: listingId }),
    });
    if (result) setFavorited(true);
  }

  async function requestToJoin() {
    const result = await call("/api/join-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: listingId }),
    });
    if (result) {
      setRequestStatus("PENDING");
      setNotice("Request sent — the landlord will see it on their join requests page.");
    }
  }

  async function setListed(active: boolean) {
    const result = active
      ? await call(`/api/listings/${listingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        })
      : await call(`/api/listings/${listingId}`, { method: "DELETE" });

    if (result) router.refresh();
  }

  if (isOwner) {
    return (
      <div className="space-y-2">
        <a href={`/listings/${listingId}/edit`} className={`${buttonClass} w-full`}>
          Edit listing
        </a>

        {isActive ? (
          <button
            type="button"
            className={`${secondaryButtonClass} w-full`}
            disabled={busy}
            onClick={() => setListed(false)}
          >
            Delist
          </button>
        ) : (
          <button
            type="button"
            className={`${secondaryButtonClass} w-full`}
            disabled={busy}
            onClick={() => setListed(true)}
          >
            Re-list
          </button>
        )}

        <p className="text-xs text-slate-500">
          Delisting hides it from search but keeps saved shortlists and past applications intact.
        </p>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={`${secondaryButtonClass} w-full`}
        disabled={busy}
        onClick={toggleFavorite}
      >
        {favorited ? "Saved ✓ — remove" : "Save to shortlist"}
      </button>

      {requestStatus === "PENDING" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
          Request pending
        </div>
      ) : requestStatus === "ACCEPTED" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-800">
          Accepted — you&apos;re in this house
        </div>
      ) : (
        <button
          type="button"
          className={`${buttonClass} w-full`}
          disabled={busy || !isActive}
          onClick={requestToJoin}
        >
          {isActive ? "Request to join" : "Not available"}
        </button>
      )}

      {requestStatus === "REJECTED" ? <Badge tone="red">Previously rejected</Badge> : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {notice ? <SuccessNote>{notice}</SuccessNote> : null}
    </div>
  );
}
