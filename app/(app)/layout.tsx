import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getMyHouses, requireUser } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/settings.server";

/**
 * Shell for every signed-in page: dark sidebar, sticky top bar, content well.
 *
 * A route group, so it wraps these pages without appearing in any URL — the
 * public landing page and /login stay outside it and render full-bleed.
 *
 * requireUser() here means every page below is authenticated by default,
 * rather than each one remembering to check.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [houses, settings] = await Promise.all([getMyHouses(user.id), getPlatformSettings()]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar role={user.profile.role} platformName={settings.platform_name} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} houseName={houses[0]?.house.name ?? null} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
