import type { ReactNode } from "react";

import { getFeature } from "@/lib/features";
import { Badge, Card, PageHeader } from "@/components/ui";

/**
 * Placeholder body for a feature nobody has built yet.
 *
 * It renders the requirement text, the owner, and exactly which files to open.
 * When you start your feature: delete <FeatureStub /> from your page, build the
 * real UI, and flip your status to "done" in lib/features.ts.
 */
export function FeatureStub({
  featureId,
  checklist,
  children,
}: {
  featureId: string;
  /** The concrete steps for this feature, in the order they should be built. */
  checklist: string[];
  children?: ReactNode;
}) {
  const feature = getFeature(featureId);

  return (
    <div>
      <PageHeader
        title={feature.title}
        subtitle={feature.summary}
        action={<Badge tone="amber">Not built yet</Badge>}
      />

      <Card className="mb-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium text-slate-500">Requirement</dt>
            <dd className="mt-0.5 text-slate-900">{feature.id}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Owner</dt>
            <dd className="mt-0.5 text-slate-900">{feature.owner}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Tables</dt>
            <dd className="mt-0.5 font-mono text-xs text-slate-900">
              {feature.tables.join(", ")}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Build order</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
          {checklist.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Card>

      {feature.api.length > 0 ? (
        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Files to edit</h2>
          <ul className="space-y-1 font-mono text-xs text-slate-600">
            <li>{feature.href === "/" ? "app/page.tsx" : `app${feature.href}/page.tsx`}</li>
            {feature.api.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {children}
    </div>
  );
}
