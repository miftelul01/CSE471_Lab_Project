import { FeatureStub } from "@/components/FeatureStub";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Maintenance — Smart Mess" };

/** M3.1 Maintenance Ticket System — Miftelul Mehebub. */
export default async function MaintenancePage() {
  await requireUser();

  return (
    <FeatureStub
      featureId="M3.1"
      checklist={[
        "List the house's tickets from GET /api/maintenance, grouped by status with priority badges.",
        "Build the report form: title, description, category, priority, optional photo (Supabase Storage).",
        "Add the landlord's status control: OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED.",
        "Render the history timeline from maintenance_ticket_events. That table is written by a trigger on every status change, so you only ever read it.",
        "resolved_at is also stamped by a trigger — don't set it from the client.",
        "The RLS policies let the reporter edit details and the landlord/house admin drive the status. Mirror that in the UI so buttons aren't shown to people who'd get a 403.",
      ]}
    />
  );
}
