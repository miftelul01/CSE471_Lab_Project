import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Mess & Property Management System",
  description: "Roommate & house matching, expenses, chores, and more.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b bg-white px-6 py-4 flex gap-6 items-center">
          <span className="font-semibold">Smart Mess</span>
          <Link href="/preferences" className="text-sm text-slate-600 hover:text-slate-900">
            My Preferences
          </Link>
          <Link href="/matches" className="text-sm text-slate-600 hover:text-slate-900">
            Suggested Matches
          </Link>
          <Link href="/favorites" className="text-sm text-slate-600 hover:text-slate-900">
            Favorites
          </Link>
          <Link href="/join-requests" className="text-sm text-slate-600 hover:text-slate-900">
            Join Requests
          </Link>
        </nav>
        <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
