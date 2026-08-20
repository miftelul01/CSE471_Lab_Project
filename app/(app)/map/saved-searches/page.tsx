import Link from "next/link";

import { SavedSearchesView } from "./SavedSearchesView";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Saved searches — Smart Mess" };
export const dynamic = "force-dynamic";

export default async function SavedSearchesPage() {
  await requireUser();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saved searches"
        subtitle="Commute budgets you're watching for new listings."
        action={
          <Link href="/map" className={secondaryButtonClass}>
            Back to map
          </Link>
        }
      />
      <SavedSearchesView />
    </div>
  );
}
