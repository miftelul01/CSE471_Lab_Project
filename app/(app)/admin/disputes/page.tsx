import { EscalatedDisputes } from "./EscalatedDisputes";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { Dispute, DisputeVote } from "@prisma/client";

export const metadata = { title: "Escalated disputes — Smart Mess" };

export type EscalatedDispute = Dispute & {
  house: { id: string; name: string } | null;
  votes: Pick<DisputeVote, "vote">[];
};

/**
 * Common Workflow 2 — "resolve escalated disputes".
 *
 * A dispute lands here when its house could not settle it: either voting hit
 * the 48-hour deadline without consensus, or someone escalated it deliberately.
 * The ADMIN role is enforced by app/admin/layout.tsx.
 */
export default async function AdminDisputesPage() {
  const disputes = await prisma.dispute.findMany({
    where: { state: "ESCALATED" },
    include: { house: { select: { id: true, name: true } }, votes: { select: { vote: true } } },
    orderBy: { escalatedAt: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Escalated disputes"
        subtitle="Cases the house could not settle themselves. Resolving one closes it for everyone; archiving files it without a ruling."
      />
      <EscalatedDisputes disputes={disputes} loadError={null} />
    </div>
  );
}
