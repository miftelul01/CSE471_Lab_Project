"use client";

import { useCurrentUserId } from "@/lib/useCurrentUserId";

export function UserIdBanner() {
  const { userId, setUserId } = useCurrentUserId();

  return (
    <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
      <p className="mb-2 text-amber-800">
        Testing as user (replace with real login once the auth module is merged):
      </p>
      <input
        className="w-full rounded border border-amber-300 px-2 py-1"
        placeholder="Paste a User id from your database"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
      />
    </div>
  );
}
