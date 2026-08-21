import { PageHeader, Card, Badge, EmptyState, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser, getActiveHouseId } from "@/lib/auth";
import { loadMessCourtData } from "@/Araf/M3.5-MessCourt/disputes";
import { MessCourtClient } from "./MessCourtClient";

export const metadata = { title: "Mess Court — Smart Mess" };

/** M3.5 Mess Court (Conflict-Resolution State Machine) — Md. Mahidul Alam Araf. */
export default async function MessCourtPage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mess Court"
          subtitle="A formalized engine for resolving household conflicts with strict state machine governance."
        />
        <EmptyState
          title="Join a house to use the Mess Court"
          hint="The Mess Court is available once you are part of a house."
        />
      </div>
    );
  }

  const data = await loadMessCourtData(user.id, houseId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mess Court"
        subtitle="A formalized engine for resolving household conflicts with strict state machine governance."
      />
      <MessCourtClient {...data} />
    </div>
  );
}
