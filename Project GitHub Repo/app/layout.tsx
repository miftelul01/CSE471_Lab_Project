import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Mess — shared-house management",
  description:
    "Listings, roommate matching, shared expenses, meals, chores and formal conflict resolution for shared houses.",
};

/**
 * Root layout stays deliberately bare. The signed-in shell (sidebar + top bar)
 * lives in app/(app)/layout.tsx so the public landing page and the login screen
 * can render full-bleed without it.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
