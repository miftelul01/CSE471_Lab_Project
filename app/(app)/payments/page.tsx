import { CashClaims } from "./CashClaims";
import { PayableShares } from "./PayableShares";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  availableMethods,
  hasRealGateway,
  providerLabel,
} from "@/lib/payments";
import { cashClaimsFor } from "@/lib/payments.server";
import { prisma } from "@/lib/prisma";
import { asTaka, formatTaka } from "@/lib/wallet";

export const metadata = { title: "Payments — Smart Mess" };
export const dynamic = "force-dynamic";

/**
 * M3.2 Payment Integration (bKash / Stripe) — Miftelul Mehebub.
 *
 * The paying half of the shared wallet: every bill the signed-in resident still
 * owes, with a button that opens a real checkout. The ledger is not written
 * here — a payment reaching SUCCEEDED flips the share via the
 * payments_apply_to_ledger trigger, so this page only ever reads.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { paid?: string; cancelled?: string; failed?: string; error?: string };
}) {
  const user = await requireUser();

  const [shares, payments, cashClaims] = await Promise.all([
    prisma.expenseShare.findMany({
      where: { userId: user.id, status: "PENDING" },
      include: {
        expense: { select: { title: true, category: true, spentOn: true } },
        payments: {
          where: { status: { in: ["INITIATED", "PENDING"] } },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.payment.findMany({
      where: { userId: user.id },
      include: { expenseShare: { select: { expense: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    cashClaimsFor(user.id),
  ]);

  const methods = availableMethods();

  const outstanding = shares.reduce((sum, share) => sum + asTaka(share.amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        subtitle="Settle your share of the house bills. Paying here updates the wallet ledger automatically."
      />

      {searchParams.paid ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Payment received. The bill below has been marked paid in the wallet ledger.
        </p>
      ) : null}
      {searchParams.cancelled ? (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
          That payment was cancelled. Nothing was charged, and the bill is still open.
        </p>
      ) : null}
      {searchParams.failed || searchParams.error ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          That payment didn&apos;t go through, so the bill is still open. Nothing was charged —
          you can try again, or pick a different method.
        </p>
      ) : null}

      <CashClaims claims={cashClaims} />

      {!hasRealGateway() ? (
        <Card>
          <p className="text-sm text-slate-700">
            <span className="font-medium">Sandbox mode.</span> No payment gateway is configured, so
            checkout runs against a built-in simulator. The full flow is real — a signed callback,
            a verified webhook and the ledger trigger — only the bank is simulated. Add the{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">BKASH_*</code> credentials
            for bKash, or{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">STRIPE_SECRET_KEY</code> for
            card payments. Cash works either way.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-slate-600">You still owe</p>
          <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {formatTaka(outstanding)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across {shares.length} unpaid {shares.length === 1 ? "bill" : "bills"}.
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Ways to pay</p>
          <p className="mt-2 text-lg font-medium text-slate-900">
            {methods.map((option) => option.label).join(" · ")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Your share amount is always read from the ledger, never from the browser.
          </p>
        </Card>
      </div>

      {shares.length === 0 ? (
        <EmptyState
          title="Nothing to pay"
          hint="Every share charged to you is settled. New bills appear here as housemates add them."
        />
      ) : (
        <PayableShares
          methods={methods}
          shares={shares.map((share) => ({
            id: share.id,
            title: share.expense.title,
            category: share.expense.category,
            amount: asTaka(share.amount),
            spentOn: share.expense.spentOn.toISOString(),
            hasPendingAttempt: share.payments.length > 0,
          }))}
        />
      )}

      {payments.length > 0 ? (
        <Card className="overflow-x-auto">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Payment history</h2>
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-3 font-medium">Bill</th>
                <th className="pb-2 px-3 font-medium">Method</th>
                <th className="pb-2 px-3 text-right font-medium">Amount</th>
                <th className="pb-2 pl-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="py-2.5 pr-3 text-slate-800">
                    {payment.expenseShare?.expense.title ?? "—"}
                    <span className="block text-xs text-slate-500">
                      {payment.createdAt.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">{providerLabel(payment.provider)}</td>
                  <td className="tabular py-2.5 px-3 text-right text-slate-800">
                    {formatTaka(asTaka(payment.amount))}
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <Badge tone={PAYMENT_STATUS_TONES[payment.status]}>
                      {PAYMENT_STATUS_LABELS[payment.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
