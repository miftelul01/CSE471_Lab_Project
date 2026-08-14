"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, ErrorNote, buttonClass, secondaryButtonClass } from "@/components/ui";

type Request = { id: string; userName: string; phone: string | null; note: string | null };

export function VerificationRequestsTable({ requests }: { requests: Request[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, status: "VERIFIED" | "REJECTED") {
    setBusy(id);
    setError(null);
    const res = await fetch("/api/admin/verification", {
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
      {requests.map((r) => (
        <Card key={r.id}>
          <h3 className="font-medium text-slate-900">{r.userName}</h3>
          <p className="text-sm text-slate-600">{r.phone}</p>
          {r.note ? <p className="mt-1 text-sm text-slate-500">{r.note}</p> : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={busy === r.id}
              onClick={() => decide(r.id, "VERIFIED")}
            >
              Verify
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy === r.id}
              onClick={() => decide(r.id, "REJECTED")}
            >
              Reject
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
