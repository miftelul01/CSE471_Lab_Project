import type { Metadata } from "next";

import { NavBar } from "@/components/NavBar";
import { getSessionUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Mess & Property Management System",
  description:
    "House and mess management: listings, roommate matching, shared wallet, meals, chores and conflict resolution.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <html lang="en">
      <body>
        <NavBar user={user} />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
