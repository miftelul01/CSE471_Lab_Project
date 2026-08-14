"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "./Icon";
import type { IconName } from "@/lib/navigation";

/**
 * Navigation for the system administrator — oversight of the whole platform,
 * not one household.
 */
const GROUPS: { heading: string; items: { label: string; href: string; icon: IconName }[] }[] = [
  {
    heading: "Overview",
    items: [{ label: "System dashboard", href: "/admin", icon: "dashboard" }],
  },
  {
    heading: "Moderation",
    items: [
      { label: "Rental listings", href: "/admin/listings", icon: "building" },
      { label: "Roommate posts", href: "/admin/roommate-posts", icon: "match" },
      { label: "Escalated cases", href: "/admin/disputes", icon: "gavel" },
      { label: "Profile complaints", href: "/admin/profile-complaints", icon: "gavel" },
      { label: "Verification requests", href: "/admin/verification", icon: "shield" },
      { label: "Reports", href: "/admin/reports", icon: "gavel" },
    ],
  },
  {
    heading: "Platform",
    items: [
      { label: "People & roles", href: "/admin/users", icon: "users" },
      { label: "Houses", href: "/admin/houses", icon: "guest" },
      { label: "Settings", href: "/admin/settings", icon: "shield" },
    ],
  },
];

export function AdminSidebar({ platformName }: { platformName: string }) {
  const pathname = usePathname();

  const isCurrent = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-bark-900 lg:flex">
      <div className="flex items-center gap-3 px-6 py-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-bark-900">
          <Icon name="shield" className="h-[18px] w-[18px]" />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-white">{platformName}</span>
          <span className="block text-xs text-white/50">System console</span>
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {GROUPS.map((group) => (
          <div key={group.heading} className="mb-5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
              {group.heading}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const current = isCurrent(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                        current
                          ? "bg-white/10 font-medium text-white"
                          : "text-white/65 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon name={item.icon} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
