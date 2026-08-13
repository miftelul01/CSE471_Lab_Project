"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, ErrorNote, buttonClass, secondaryButtonClass } from "@/components/ui";
import type { JoinRequestStatus } from "@prisma/client";

// rent is a plain number here, not Prisma Decimal — Decimal instances cannot
// cross the Server -> Client Component boundary (see app/(app)/join-requests/page.tsx).
export type JoinRequestRow = {
  id: string;
  status: JoinRequestStatus;
  message: string | null;
  listing: { title: string; area: string; rent: number } | null;
};

const STATUS_TONE: Record<JoinRequestStatus, "amber" | "green" | "red" | "slate"> = {
  PENDING: "amber",
  ACCEPTED: "green",
  REJECTED: "red",
  WITHDRAWN: "slate",
};

export function JoinRequestList({
  requests,
  viewer,
}: {
  requests: JoinRequestRow[];
  viewer: "applicant" | "landlord";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: JoinRequestStatus) {
    setBusy(id);
    setError(null);
    const res = await fetch("/api/join-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Could not update the request");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {requests.map((request) => (
        <Card key={request.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-medium text-slate-900">
                {request.listing?.title ?? "Listing removed"}
              </h3>
              <p className="text-sm text-slate-600">
                {request.listing ? `${request.listing.area} · BDT ` : ""}
                {request.listing ? Number(request.listing.rent).toLocaleString() : ""}
              </p>
              {request.message ? (
                <p className="mt-2 text-sm text-slate-500">&ldquo;{request.message}&rdquo;</p>
              ) : null}
            </div>
            <Badge tone={STATUS_TONE[request.status]}>{request.status.toLowerCase()}</Badge>
          </div>

          {request.status === "PENDING" ? (
            <div className="mt-4 flex gap-2">
              {viewer === "applicant" ? (
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={busy === request.id}
                  onClick={() => setStatus(request.id, "WITHDRAWN")}
                >
                  Withdraw
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy === request.id}
                    onClick={() => setStatus(request.id, "ACCEPTED")}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={busy === request.id}
                    onClick={() => setStatus(request.id, "REJECTED")}
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
