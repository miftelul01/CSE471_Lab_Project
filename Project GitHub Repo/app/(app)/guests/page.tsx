import { GuestLogTable } from "@/Araf/M1.3-Guests/GuestLogTable";
import { GuestCheckInForm } from "@/Araf/M1.3-Guests/GuestCheckInForm";
import { PageHeader } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Guest log — Smart Mess" };

/** M1.3 Guest Registration & Accountability Log — Md. Mahidul Alam Araf. */
export default async function GuestsPage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  const guests = houseId
    ? await prisma.guestLog.findMany({
        where: { houseId },
        include: { host: { select: { name: true } } },
        orderBy: { checkedInAt: "desc" },
      })
    : [];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Guest Registration & Accountability Log"
        subtitle="Log guest check-ins and check-outs. The house admin is notified automatically. This maintains a permanent, secure log per house for safety and accountability."
      />

      {!houseId ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-medium text-slate-700">Join a house to use the guest log</p>
          <p className="mt-1 text-sm text-slate-500">
            Go to the Houses page to create or join a house first.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <GuestCheckInForm />
          <GuestLogTable guests={guests} />
        </div>
      )}
    </div>
  );
}
