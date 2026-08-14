"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, ErrorNote, buttonClass, secondaryButtonClass } from "@/components/ui";
import type { ReportTargetType } from "@prisma/client";

type Report = { id: string; targetType: ReportTargetType; targetId: string; reason: string; reporterName: string };

export function ReportsTable({ reports }: { reports: Report[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, status: "DISMISSED" | "ACTIONED") {
    setBusy(id);
    setError(null);
    const res = await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Could not update the report");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {reports.map((r) => (
        <Card key={r.id}>
          <div className="mb-1 flex items-center gap-2">
            <Badge>{r.targetType.toLowerCase().replace("_", " ")}</Badge>
            <span className="font-mono text-xs text-slate-400">{r.targetId}</span>
          </div>
          <p className="text-sm text-slate-700">{r.reason}</p>
          <p className="mt-1 text-xs text-slate-500">Reported by {r.reporterName}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={busy === r.id}
              onClick={() => decide(r.id, "ACTIONED")}
            >
              Mark actioned
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy === r.id}
              onClick={() => decide(r.id, "DISMISSED")}
            >
              Dismiss
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
