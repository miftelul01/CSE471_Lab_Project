import type { ReactNode } from "react";

import { Icon } from "./Icon";
import { getFeature } from "@/lib/features";
import type { IconName } from "@/lib/navigation";

/**
 * Placeholder for an area that isn't built yet.
 *
 * Deliberately shows NOTHING about how the coursework is divided — no module
 * numbers, no requirement ids, no owner names. Those live in lib/features.ts
 * for our own tracking; the product just says the area is coming.
 *
 * The `checklist` prop is never rendered — it stays in the page source as the
 * build order for whoever picks the work up. Rendering it (even hidden) would
 * put module numbers and owner names into the shipped HTML.
 */
export function FeatureStub({
  featureId,
  icon = "dashboard",
  checklist,
  children,
}: {
  /** Internal id, e.g. "M1.3" — used only to look up the description. */
  featureId: string;
  icon?: IconName;
  checklist: string[];
  children?: ReactNode;
}) {
  const feature = getFeature(featureId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{feature.title}</h1>
        <p className="mt-1 max-w-2xl text-slate-600">{feature.summary}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-card">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <h2 className="mt-4 font-medium text-slate-900">Coming soon</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
          This area is being built. The data model behind it already exists, so nothing here will
          need re-entering once it lands.
        </p>
      </div>


      {children}
    </div>
  );
}
