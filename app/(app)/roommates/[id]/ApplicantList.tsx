"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, EmptyState, ErrorNote, buttonClass, secondaryButtonClass } from "@/components/ui";
import type { JoinRequestStatus } from "@prisma/client";

type Applicant = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: JoinRequestStatus;
};

const TONE: Record<JoinRequestStatus, "amber" | "green" | "red" | "slate"> = {
  PENDING: "amber",
  ACCEPTED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
  EXPIRED: "slate",
};

export function ApplicantList({
  postId,
  applicants,
}: {
  postId: string;
  applicants: Applicant[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(applicationId: string, status: "ACCEPTED" | "REJECTED") {
    setBusy(applicationId);
    setError(null);

    const response = await fetch(`/api/roommate-posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, status }),
    });

    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not update that application");
      return;
    }
    router.refresh();
  }

  if (applicants.length === 0) {
    return <EmptyState title="Nobody has applied yet" />;
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {applicants.map((applicant) => (
        <Card key={applicant.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{applicant.name}</p>
              <p className="text-sm text-slate-500">
                {applicant.email}
                {applicant.phone ? ` · ${applicant.phone}` : ""}
              </p>
              {applicant.message ? (
                <p className="mt-2 text-sm text-slate-600">&ldquo;{applicant.message}&rdquo;</p>
              ) : null}
            </div>
            <Badge tone={TONE[applicant.status]}>{applicant.status.toLowerCase()}</Badge>
          </div>

          {applicant.status === "PENDING" ? (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={busy === applicant.id}
                onClick={() => decide(applicant.id, "ACCEPTED")}
              >
                {busy === applicant.id ? "Working…" : "Accept — they move in"}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={busy === applicant.id}
                onClick={() => decide(applicant.id, "REJECTED")}
              >
                Decline
              </button>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
