import Link from "next/link";

import { AdminSidebar } from "@/components/AdminSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { requireRole } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/settings.server";

/**
 * Shell for the system administrator.
 *
 * Deliberately a separate route group from (app): an administrator runs the
 * platform rather than living in a house, so a sidebar full of "my wallet" and
 * "my meals" would be meaningless to them. requireRole here protects every
 * page beneath it, including any added later.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ADMIN");
  const settings = await getPlatformSettings();

  return (
    <div className="flex min-h-screen bg-canvas">
      <AdminSidebar platformName={settings.platform_name} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <span className="rounded-full bg-bark-800 px-3 py-1 text-xs font-medium text-brand-200">
            System administration
          </span>
          <span className="ml-auto flex items-center gap-3">
            <span className="hidden text-right leading-tight sm:block">
              <span className="block text-sm font-medium text-slate-800">
                {user.profile.name || user.email}
              </span>
              <span className="block text-xs text-slate-500">Platform administrator</span>
            </span>
            <Link
              href="/listings"
              className="hidden rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 sm:block"
            >
              View site
            </Link>
            <SignOutButton />
          </span>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
