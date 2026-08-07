import type { Metadata } from "next";

import { NavBar } from "@/components/NavBar";
import { getSessionUser } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/settings.server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Mess & Property Management System",
  description:
    "House and mess management: listings, roommate matching, shared wallet, meals, chores and conflict resolution.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // getPlatformSettings never throws — it falls back to defaults — so an
  // unreachable settings table costs a custom name, not the whole app.
  const [user, settings] = await Promise.all([getSessionUser(), getPlatformSettings()]);

  return (
    <html lang="en">
      <body>
        <NavBar user={user} platformName={settings.platform_name} />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
