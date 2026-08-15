import { AddExpenseForm } from "./AddExpenseForm";
import { ExpenseLedger } from "./ExpenseLedger";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getActiveHouseId, requireUser } from "@/lib/auth";
import { isHouseAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  EXPENSE_INCLUDE,
  formatTaka,
  settlementPlan,
  summarizeLedger,
  toWalletExpense,
  type LedgerRow,
  type Settlement,
} from "@/lib/wallet";

export const metadata = { title: "Shared wallet — Smart Mess" };

const SUBTITLE =
  "Add a bill once and it splits across the house. The ledger below shows exactly who has paid and who is still pending.";

function Summary({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-600">{label}</p>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}

/** Per-housemate standing. Server-rendered — nothing here is interactive. */
function BalanceTable({ rows, currentUserId }: { rows: LedgerRow[]; currentUserId: string }) {
  return (
    <Card className="overflow-x-auto">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Where everyone stands</h2>
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-2 pr-3 font-medium">Housemate</th>
            <th className="pb-2 px-3 text-right font-medium">Paid upfront</th>
            <th className="pb-2 px-3 text-right font-medium">Charged</th>
            <th className="pb-2 px-3 text-right font-medium">Settled</th>
            <th className="pb-2 px-3 text-right font-medium">Still owes</th>
            <th className="pb-2 pl-3 text-right font-medium">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.userId}>
              <td className="py-2.5 pr-3 text-slate-800">
                {row.name || "Unnamed housemate"}
                {row.userId === currentUserId ? (
                  <span className="ml-1.5 text-xs text-slate-500">(you)</span>
                ) : null}
              </td>
              <td className="tabular py-2.5 px-3 text-right text-slate-600">
                {formatTaka(row.fronted)}
              </td>
              <td className="tabular py-2.5 px-3 text-right text-slate-600">
                {formatTaka(row.owed)}
              </td>
              <td className="tabular py-2.5 px-3 text-right text-slate-600">
                {formatTaka(row.paid)}
                {row.waived > 0 ? (
                  <span className="block text-xs text-slate-400">
                    {formatTaka(row.waived)} waived
                  </span>
                ) : null}
              </td>
              <td className="tabular py-2.5 px-3 text-right text-slate-600">
                {formatTaka(row.pending)}
              </td>
              <td
                className={`tabular py-2.5 pl-3 text-right font-medium ${
                  row.net > 0 ? "text-emerald-700" : row.net < 0 ? "text-rose-700" : "text-slate-400"
                }`}
              >
                {row.net === 0 ? "—" : `${row.net > 0 ? "+" : "−"}${formatTaka(Math.abs(row.net))}`}
                <span className="block text-xs font-normal text-slate-400">
                  {row.net > 0 ? "is owed" : row.net < 0 ? "owes" : "square"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/**
 * The answer to the question the raw ledger never quite gives: what payments
 * would actually clear the house.
 */
function SettleUp({ plan, currentUserId }: { plan: Settlement[]; currentUserId: string }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900">Settle up</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        {plan.length === 0
          ? "Nobody owes anybody."
          : `${plan.length} payment${plan.length === 1 ? "" : "s"} clears every debt in the house.`}
      </p>

      {plan.length === 0 ? null : (
        <ul className="mt-3 space-y-2">
          {plan.map((transfer) => {
            const mine = transfer.fromUserId === currentUserId || transfer.toUserId === currentUserId;
            return (
              <li
                key={`${transfer.fromUserId}-${transfer.toUserId}`}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                  mine ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-white"
                }`}
              >
                <span className="text-slate-800">
                  <span className="font-medium">
                    {transfer.fromUserId === currentUserId ? "You" : transfer.fromName}
                  </span>{" "}
                  {transfer.fromUserId === currentUserId ? "pay" : "pays"}{" "}
                  <span className="font-medium">
                    {transfer.toUserId === currentUserId ? "you" : transfer.toName}
                  </span>
                </span>
                <span className="tabular font-semibold text-slate-900">
                  {formatTaka(transfer.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** M2.1 Shared Wallet & Bill-Splitting Engine — Miftelul Mehebub. */
export default async function WalletPage() {
  const user = await requireUser();
  const houseId = await getActiveHouseId(user.id);

  if (!houseId) {
    return (
      <div>
        <PageHeader title="Shared wallet" subtitle={SUBTITLE} />
        <EmptyState
          title="Join a house to use the shared wallet"
          hint="Go to the Houses page to create or join a house first."
        />
      </div>
    );
  }

  const [rows, members, canManage] = await Promise.all([
    prisma.expense.findMany({
      where: { houseId },
      include: EXPENSE_INCLUDE,
      orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
    }),
    prisma.houseMember.findMany({
      where: { houseId, status: "ACTIVE" },
      select: { userId: true, user: { select: { name: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    isHouseAdmin(user.id, houseId),
  ]);

  // Prisma's Decimal is a class instance and cannot cross into a client
  // component, so the conversion to plain numbers happens once, here.
  const expenses = rows.map(toWalletExpense);
  const { rows: ledger, totals } = summarizeLedger(
    members.map((m) => ({ userId: m.userId, name: m.user.name })),
    expenses
  );

  const mine = ledger.find((row) => row.userId === user.id);
  const nameOf = new Map(ledger.map((row) => [row.userId, row.name]));
  const plan = settlementPlan(expenses, (id) => nameOf.get(id) ?? "Unknown");

  return (
    <div className="space-y-8">
      <PageHeader title="Shared wallet" subtitle={SUBTITLE} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary
          label="Total tracked"
          value={formatTaka(totals.spent)}
          hint={`${expenses.length} expense${expenses.length === 1 ? "" : "s"} on the wallet`}
        />
        <Summary
          label="Settled"
          value={formatTaka(totals.paid)}
          hint={totals.waived > 0 ? `plus ${formatTaka(totals.waived)} waived` : "Paid up across the house"}
        />
        <Summary
          label="Outstanding"
          value={formatTaka(totals.pending)}
          hint="Still owed to the house"
        />
        <Summary
          label="Your net position"
          value={
            mine && mine.net !== 0
              ? `${mine.net > 0 ? "+" : "−"}${formatTaka(Math.abs(mine.net))}`
              : formatTaka(0)
          }
          hint={
            !mine || mine.net === 0
              ? "You're square with the house"
              : mine.net > 0
                ? "The house owes you this"
                : "You owe the house this"
          }
        />
      </div>

      <SettleUp plan={plan} currentUserId={user.id} />

      <BalanceTable rows={ledger} currentUserId={user.id} />

      <AddExpenseForm
        members={members.map((m) => ({ id: m.userId, name: m.user.name }))}
        currentUserId={user.id}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Expense history</h2>
        <ExpenseLedger expenses={expenses} currentUserId={user.id} canManage={canManage} />
      </section>
    </div>
  );
}
