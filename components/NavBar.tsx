import Link from "next/link";

import type { SessionUser } from "@/lib/auth";
import { FEATURES, MODULE_NAMES, type Feature } from "@/lib/features";

/**
 * Top navigation, generated from lib/features.ts so a new feature shows up
 * here the moment it is registered — nobody has to edit this file.
 */
export function NavBar({ user }: { user: SessionUser | null }) {
  const modules: Feature["module"][] = [0, 1, 2, 3];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link href="/" className="font-semibold text-slate-900">
          Smart Mess
        </Link>

        {user ? (
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {modules.map((module) => (
              <div key={module} className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-slate-400">
                  {MODULE_NAMES[module]}
                </span>
                {FEATURES.filter((f) => f.module === module).map((feature) => (
                  <Link
                    key={feature.id}
                    href={feature.href}
                    title={`${feature.id} — ${feature.owner}`}
                    className={
                      feature.status === "done"
                        ? "text-sm text-slate-600 hover:text-slate-900"
                        : "text-sm text-slate-400 hover:text-slate-700"
                    }
                  >
                    {shortLabel(feature)}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="text-slate-500">{user.profile.full_name || user.email}</span>
              <form action="/auth/signout" method="post">
                <button type="submit" className="text-slate-600 hover:text-slate-900">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** Nav needs short labels; the registry stores the full requirement titles. */
function shortLabel(feature: Feature): string {
  const overrides: Record<string, string> = {
    C1: "Profile",
    C2: "Houses",
    "M1.1": "Listings",
    "M1.2": "Matching",
    "M1.3": "Guests",
    "M2.1": "Wallet",
    "M2.2": "Menu",
    "M2.3": "Meals",
    "M3.1": "Maintenance",
    "M3.2": "Payments",
    "M3.3": "Map",
    "M3.4": "Chores",
    "M3.5": "Mess Court",
    "M3.6": "Calendar",
  };
  return overrides[feature.id] ?? feature.title;
}
