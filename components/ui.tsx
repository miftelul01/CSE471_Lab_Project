import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Tiny shared UI kit. Deliberately plain Tailwind — use these so all nine
 * features look like one app instead of nine assignments stapled together.
 */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

const BADGE_TONES = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-brand-100 text-brand-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
  blue: "bg-sky-100 text-sky-800",
  brand: "bg-brand-50 text-brand-700 ring-1 ring-brand-200",
} as const;

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
      {children}
    </p>
  );
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {children}
    </p>
  );
}

/** Labelled form control wrapper. Pass any input as children. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm " +
  "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 " +
  "disabled:bg-slate-100 disabled:text-slate-500";

export const buttonClass =
  "inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm " +
  "font-medium text-white shadow-card transition hover:bg-brand-800 disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 " +
  "text-sm font-medium text-slate-700 shadow-card transition hover:bg-slate-50 disabled:opacity-50";

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass}>
      {children}
    </Link>
  );
}
