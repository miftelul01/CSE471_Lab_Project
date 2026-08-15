import { ReportsTable } from "./ReportsTable";
import { EmptyState, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Reports — Administration" };

/** M1.2 — Report & Block Safety System, admin review (Mahia Tanzin). */
export default async function AdminReportsPage() {
  const reports = await prisma.report.findMany({
    where: { status: "OPEN" },
    include: { reporter: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Abuse/spam reports filed by residents against a user, listing, or roommate post."
      />
      {reports.length === 0 ? (
        <EmptyState title="No open reports" hint="Nothing waiting for review." />
      ) : (
        <ReportsTable
          reports={reports.map((r) => ({
            id: r.id,
            targetType: r.targetType,
            targetId: r.targetId,
            reason: r.reason,
            reporterName: r.reporter.name || r.reporter.email,
          }))}
        />
      )}
    </div>
  );
}
