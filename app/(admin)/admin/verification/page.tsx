import { VerificationRequestsTable } from "./VerificationRequestsTable";
import { EmptyState, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Verification requests — Administration" };

/** M1.2 — Verified Profile Badge, admin review (Mahia Tanzin). */
export default async function AdminVerificationPage() {
  const requests = await prisma.verificationRequest.findMany({
    where: { status: "PENDING" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Verification requests"
        subtitle="Phone / university ID self-attestations awaiting review before the Verified badge shows on a profile."
      />
      {requests.length === 0 ? (
        <EmptyState title="Nothing pending" hint="No verification requests waiting for review." />
      ) : (
        <VerificationRequestsTable
          requests={requests.map((r) => ({
            id: r.id,
            userName: r.user.name || r.user.email,
            phone: r.phone,
            note: r.note,
          }))}
        />
      )}
    </div>
  );
}
