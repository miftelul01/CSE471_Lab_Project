"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, ErrorNote, inputClass } from "@/components/ui";
import type { PostStatus } from "@prisma/client";

export type ModerationRow = {
  id: string;
  title: string;
  owner: string;
  context: string;
  amount: number;
  isActive: boolean;
  status: PostStatus;
  removedReason: string | null;
  removedBy: string | null;
};

/**
 * Shared by rental listings and roommate posts — the moderation decision is
 * identical for both, only the target differs.
 */
export function ModerationTable({
  kind,
  rows,
}: {
  kind: "listing" | "roommatePost";
  rows: ModerationRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function moderate(id: string, action: "remove" | "restore") {
    setBusy(id);
    setError(null);

    const response = await fetch("/api/admin/moderate", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, action, reason: reasons[id] ?? "" }),
    });

    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not update that post");
      return;
    }
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
        Nothing posted yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-5 py-3 font-medium">Post</th>
              <th className="px-5 py-3 font-medium">Owner</th>
              <th className="px-5 py-3 text-right font-medium">Amount</th>
              <th className="px-5 py-3 font-medium">State</th>
              <th className="px-5 py-3 font-medium">Moderation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const removed = row.status === "REMOVED";
              return (
                <tr key={row.id} className={removed ? "bg-rose-50/40" : ""}>
                  <td className="px-5 py-3">
                    <span className="block font-medium text-slate-900">{row.title}</span>
                    <span className="block text-xs text-slate-500">{row.context}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{row.owner}</td>
                  <td className="tabular px-5 py-3 text-right text-slate-900">
                    ৳{row.amount.toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    {removed ? (
                      <Badge tone="red">Removed</Badge>
                    ) : row.isActive ? (
                      <Badge tone="green">Live</Badge>
                    ) : (
                      <Badge tone="amber">Delisted by owner</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {removed ? (
                      <div className="space-y-1">
                        <p className="text-xs text-slate-600">
                          &ldquo;{row.removedReason}&rdquo;
                          {row.removedBy ? ` — ${row.removedBy}` : ""}
                        </p>
                        <button
                          type="button"
                          disabled={busy === row.id}
                          onClick={() => moderate(row.id, "restore")}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Restore
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          className={`${inputClass} w-44 py-1.5 text-xs`}
                          placeholder="Reason"
                          value={reasons[row.id] ?? ""}
                          onChange={(e) => setReasons({ ...reasons, [row.id]: e.target.value })}
                        />
                        <button
                          type="button"
                          disabled={busy === row.id}
                          onClick={() => moderate(row.id, "remove")}
                          className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        &ldquo;Delisted by owner&rdquo; is the landlord&apos;s own decision and is left alone.
        Removing is a moderation action and is recorded against your account.
      </p>
    </div>
  );
}
