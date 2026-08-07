"use client";

import { useEffect, useState } from "react";
import { useCurrentUserId } from "@/lib/useCurrentUserId";
import { UserIdBanner } from "@/components/UserIdBanner";

interface RequestRow {
  id: string;
  status: string;
  createdAt: string;
  listing: { id: string; title: string; area: string };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  WITHDRAWN: "bg-slate-100 text-slate-600",
};

export default function JoinRequestsPage() {
  const { userId } = useCurrentUserId();
  const [requests, setRequests] = useState<RequestRow[]>([]);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/join-requests?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => setRequests(data.requests ?? []));
  }, [userId]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">My Join Requests</h1>
      <UserIdBanner />

      {userId && requests.length === 0 && (
        <p className="text-sm text-slate-500">
          No join requests sent yet — send one from the Suggested Matches page.
        </p>
      )}

      <ul className="space-y-3">
        {requests.map((r) => (
          <li key={r.id} className="rounded border bg-white p-4 flex justify-between items-center">
            <div>
              <p className="font-medium">{r.listing.title}</p>
              <p className="text-sm text-slate-600">{r.listing.area}</p>
            </div>
            <span className={`rounded px-2 py-1 text-xs font-medium ${STATUS_COLORS[r.status]}`}>
              {r.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
