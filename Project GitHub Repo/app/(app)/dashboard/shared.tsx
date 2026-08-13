import Link from "next/link";

import { Icon } from "@/components/Icon";
import type { IconName } from "@/lib/navigation";

/** Pieces the three dashboards share. Only the layout is shared — never the content. */

export function greeting() {
  const hour = (new Date().getUTCHours() + 6) % 24; // Dhaka is UTC+6
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function Heading({
  name,
  role,
  context,
  actions,
}: {
  name: string;
  role: string;
  context: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm text-slate-500">{role}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          {greeting()}, {name.split(" ")[0] || "there"}
        </h1>
        <p className="mt-1 text-slate-600">{context}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: IconName;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between">
        <p className="text-sm text-slate-600">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <p className="tabular mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export function Action({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 shadow-card transition hover:border-slate-300 hover:text-slate-900"
    >
      <Icon name={icon} className="h-4 w-4 text-slate-400" />
      {label}
    </Link>
  );
}

export function PrimaryLink({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-card transition hover:bg-brand-800"
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function Panel({
  icon,
  title,
  subtitle,
  children,
  className = "",
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-card ${className}`}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-sm font-medium text-slate-900">{title}</span>
          {subtitle ? <span className="block text-xs text-slate-500">{subtitle}</span> : null}
        </span>
      </div>
      {children}
    </section>
  );
}
