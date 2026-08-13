import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Houses — Administration" };

/** Read-only oversight of every household on the platform. */
export default async function AdminHousesPage() {
  const houses = await prisma.house.findMany({
    include: {
      landlord: { select: { name: true, email: true } },
      _count: {
        select: {
          members: true,
          listings: true,
          roommatePosts: true,
          disputes: true,
          tickets: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Houses"
        subtitle="Every household on the platform. Open one to inspect its members, rooms and open cases."
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-5 py-3 font-medium">House</th>
              <th className="px-5 py-3 font-medium">Landlord</th>
              <th className="px-5 py-3 text-right font-medium">Members</th>
              <th className="px-5 py-3 text-right font-medium">Rooms</th>
              <th className="px-5 py-3 text-right font-medium">Open cases</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {houses.map((house) => (
              <tr key={house.id}>
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/houses/${house.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {house.name}
                  </Link>
                  <span className="block text-xs text-slate-500">
                    {house.area ?? house.address}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {house.landlord?.name ?? <span className="text-slate-400">unassigned</span>}
                </td>
                <td className="tabular px-5 py-3 text-right text-slate-900">
                  {house._count.members}
                </td>
                <td className="tabular px-5 py-3 text-right text-slate-900">
                  {house._count.listings + house._count.roommatePosts}
                </td>
                <td className="tabular px-5 py-3 text-right text-slate-900">
                  {house._count.disputes + house._count.tickets}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
