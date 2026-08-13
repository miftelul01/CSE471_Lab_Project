import { FeatureStub } from "@/components/FeatureStub";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Mess Court — Smart Mess" };

/** another area Mess Court (Conflict-Resolution State Machine). */
export default async function MessCourtPage() {
  await requireUser();

  return (
    <FeatureStub
      featureId="another area"
      checklist={[
        "List the house's disputes from GET /api/disputes, grouped by state.",
        "Raise-a-dispute form: title, description, category, optional against_user_id. New disputes start in RAISED.",
        "Add the transition buttons and show ONLY the legal next states — dispute_transition_allowed() in migration 0011 is the same table the DB enforces, so mirror it rather than inventing a second copy.",
        "Voting screen for state = VOTING: FOR / AGAINST / ABSTAIN, one vote per person, with the live tally.",
        "Resolution: when voting reaches consensus, move to RESOLVED with a resolution note. voting_deadline and resolved_at are stamped by the trigger.",
        "Build the 48-hour timeout job at /api/disputes/escalate — find VOTING disputes past their deadline without consensus and move them to ESCALATED for the landlord.",
        "Render the audit trail from dispute_events. Every transition is logged by a trigger, so this is your evidence the state machine actually ran.",
      ]}
    >
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          The state machine (enforced in the database)
        </h2>
        <pre className="overflow-x-auto rounded bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
{`RAISED ──> VOTING ──> RESOLVED ──> ARCHIVED
  │          │                         ^
  │          └──> ESCALATED ───────────┘
  │                  │
  │                  └──> RESOLVED
  └─────────────────────> ARCHIVED

ARCHIVED is terminal. Any other transition raises an
exception from the disputes_enforce_transition trigger —
you cannot bypass it from application code.`}
        </pre>
      </Card>
    </FeatureStub>
  );
}
