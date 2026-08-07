"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AdminUserRow } from "./page";
import { Card, EmptyState, ErrorNote, SuccessNote, inputClass } from "@/components/ui";
import type { UserRole } from "@prisma/client";

const ROLES: UserRole[] = ["RESIDENT", "LANDLORD", "ADMIN"];

export function UserRoleTable({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = users.filter((user) => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return true;
    return (
      user.email.toLowerCase().includes(needle) ||
      (user.name ?? "").toLowerCase().includes(needle)
    );
  });

  async function setRole(id: string, role: UserRole) {
    setBusy(id);
    setError(null);
    setNotice(null);

    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role }),
    });
    const body = await response.json().catch(() => ({}));

    setBusy(null);
    if (!response.ok) {
      setError(body.error ?? "Could not change the role");
      return;
    }
    setNotice(`${body.name || body.email} is now ${body.role.toLowerCase()}.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <input
        className={`${inputClass} max-w-sm`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name or email"
      />

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {notice ? <SuccessNote>{notice}</SuccessNote> : null}

      {visible.length === 0 ? (
        <EmptyState title="No users match" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium text-slate-600">Name</th>
                <th className="px-4 py-2 font-medium text-slate-600">Email</th>
                <th className="px-4 py-2 font-medium text-slate-600">Joined</th>
                <th className="px-4 py-2 font-medium text-slate-600">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id}>
                    <td className="px-4 py-2 text-slate-900">
                      {user.name || "—"}
                      {isSelf ? <span className="ml-2 text-xs text-slate-400">(you)</span> : null}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{user.email}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className={inputClass}
                        value={user.role}
                        disabled={busy === user.id || isSelf}
                        onChange={(e) => setRole(user.id, e.target.value as UserRole)}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role.charAt(0) + role.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-slate-500">
        Your own role is locked here. Removing the last admin would leave nobody able to reach this
        page, and the only way back would be an SQL console.
      </p>
    </div>
  );
}
