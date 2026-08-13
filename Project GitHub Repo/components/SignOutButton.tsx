"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  async function handleSignOut() {
    try {
      await signOut({ redirectTo: "/login" });
    } catch {
      // signOut() navigates away on success, so reaching here means the
      // request itself failed (e.g. a dev-server hiccup) — fall back to a
      // hard navigation rather than leaving the button looking dead.
      window.location.assign("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
    >
      Sign out
    </button>
  );
}
