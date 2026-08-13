"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote, buttonClass, secondaryButtonClass } from "@/components/ui";
import type { JoinRequestStatus } from "@prisma/client";

export function RoommateActions({
  postId,
  isMine,
  existingStatus,
}: {
  postId: string;
  isMine: boolean;
  existingStatus: JoinRequestStatus | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(existingStatus);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/roommate-posts/${postId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "I'd like to take the spare seat." }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not apply");
      return;
    }
    setStatus("PENDING");
    router.refresh();
  }

  if (isMine) {
    return (
      <Link href={`/roommates/${postId}`} className={`${secondaryButtonClass} w-full`}>
        Review applicants
      </Link>
    );
  }

  if (status === "PENDING") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
        Application pending
      </div>
    );
  }

  if (status === "ACCEPTED") {
    return (
      <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-center text-sm text-brand-800">
        Accepted — you live here now
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button type="button" className={`${buttonClass} w-full`} disabled={busy} onClick={apply}>
        {busy ? "Sending…" : "Apply for this seat"}
      </button>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}
