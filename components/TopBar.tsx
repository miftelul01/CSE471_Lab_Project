import Link from "next/link";

import { Icon } from "./Icon";
import { SignOutButton } from "./SignOutButton";
import type { SessionUser } from "@/lib/auth";
import { PERSONA_LABEL, type Persona } from "@/lib/navigation";

/** Initials for the avatar chip, e.g. "Nusrat Jahan" -> "NJ". */
function initials(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function TopBar({
  user,
  persona,
  houseName,
}: {
  user: SessionUser;
  persona: Persona;
  houseName: string | null;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      {persona === "LANDLORD" ? (
        <Link
          href="/properties"
          className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 sm:flex"
        >
          <Icon name="building" className="h-4 w-4 text-slate-400" />
          My portfolio
        </Link>
      ) : houseName ? (
        <span className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 sm:flex">
          <Icon name="building" className="h-4 w-4 text-slate-400" />
          {houseName}
        </span>
      ) : (
        <Link
          href="/houses"
          className="hidden items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800 sm:flex"
        >
          <Icon name="building" className="h-4 w-4" />
          Join a house
        </Link>
      )}

      <form action="/listings" className="relative min-w-0 flex-1">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          name="q"
          placeholder="Search rooms by title or description…"
          aria-label="Search rooms"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </form>

      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-right leading-tight sm:block">
          <span className="block text-sm font-medium text-slate-800">
            {user.profile.name || user.email}
          </span>
          <span className="block text-xs text-slate-500">{PERSONA_LABEL[persona]}</span>
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
          {initials(user.profile.name, user.email)}
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}
