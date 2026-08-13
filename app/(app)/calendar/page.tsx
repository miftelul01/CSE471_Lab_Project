import { FeatureStub } from "@/components/FeatureStub";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "House calendar — Smart Mess" };

/** another area Google Calendar API Integration. */
export default async function CalendarPage() {
  await requireUser();

  return (
    <FeatureStub
      featureId="another area"
      checklist={[
        "List upcoming house events from GET /api/calendar, with a badge showing which feature each came from.",
        "Collect the events worth syncing: rent due dates, guest check-in windows, dispute deadlines, chore due dates.",
        "Write them into calendar_events with source_type + source_id. The unique index on that pair is what makes re-syncing update rather than duplicate.",
        "OAuth: request https://www.googleapis.com/auth/calendar and store the refresh token in google_credentials — same table and same second-consent flow Mahia needs for Google Tasks, so build it once together.",
        "Create a shared house calendar, save its id on houses.google_calendar_id, and insert events there.",
        "Store the returned google_event_id and set synced_at. On the next run, patch existing events instead of creating new ones.",
      ]}
    />
  );
}
