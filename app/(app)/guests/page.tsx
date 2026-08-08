import { FeatureStub } from "@/components/FeatureStub";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Guest log — Smart Mess" };

/** another area Guest Registration & Accountability Log. */
export default async function GuestsPage() {
  await requireUser();

  return (
    <FeatureStub
      featureId="another area"
      checklist={[
        "Render the house's guest log from GET /api/guests — newest first, with an 'currently in the house' section on top.",
        "Build the check-in form: guest name, phone, purpose, expected check-out. POST it.",
        "Add a check-out button that PATCHes status to CHECKED_OUT and stamps checked_out_at.",
        "Notify the landlord/house admin on check-in, then set notified_admin_at so it only fires once. Simplest version: insert a row the admin's page reads; nicer version: Supabase Realtime.",
        "There is deliberately no delete policy on guest_logs — an erasable accountability log isn't one. Handle mistakes with a CANCELLED status instead.",
        "Optional: push guest check-in windows into calendar_events so another area syncs them to the house calendar.",
      ]}
    />
  );
}
