"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "./Icon";
import { navFor, type NavGroup, type Persona } from "@/lib/navigation";

/**
 * Primary navigation.
 *
 * A Client Component only so it can highlight the current route with
 * usePathname; the group list itself is static.
 */
const SUBTITLE: Record<Persona, string> = {
  LANDLORD: "Property operations",
  FLAT_HEAD: "Running your flat",
  MEMBER: "Your household",
};

export function Sidebar({ persona, platformName }: { persona: Persona; platformName: string }) {
  const pathname = usePathname();
  const groups: NavGroup[] = navFor(persona);

  const isCurrent = (href: string) => {
    const base = href.split("?")[0];
    if (base === "/dashboard") return pathname === "/dashboard";
    return pathname === base || pathname.startsWith(`${base}/`);
  };

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-bark-800 lg:flex">
      <div className="flex items-center gap-3 px-6 py-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-bark-900">
          <Icon name="building" className="h-[18px] w-[18px]" />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-white">{platformName}</span>
          <span className="block text-xs text-white/50">{SUBTITLE[persona]}</span>
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {groups.map((group) => (
          <div key={group.heading} className="mb-5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
              {group.heading}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const current = isCurrent(item.href);
                return (
                  <li key={item.label}>
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
