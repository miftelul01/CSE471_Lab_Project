import Link from "next/link";

import { requireRole } from "@/lib/auth";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/disputes", label: "Escalated disputes" },
  { href: "/admin/users", label: "Users & roles" },
  { href: "/admin/settings", label: "Platform settings" },
];

/**
 * Guards the whole admin console in one place. requireRole redirects anyone
 * who isn't a platform ADMIN, so no page below needs its own check — and a new
 * admin page added later is protected by default rather than by remembering.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");

  return (
    <div>
      <div className="mb-6 border-b border-slate-200">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Platform administration
        </p>
        <nav className="flex flex-wrap gap-4">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="-mb-px border-b-2 border-transparent pb-2 text-sm text-slate-600 hover:border-slate-400 hover:text-slate-900"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
