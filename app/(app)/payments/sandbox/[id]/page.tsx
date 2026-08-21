import { notFound, redirect } from "next/navigation";

import { SandboxCheckout } from "./SandboxCheckout";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { hasRealGateway } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { asTaka } from "@/lib/wallet";

export const metadata = { title: "Sandbox checkout — Smart Mess" };
export const dynamic = "force-dynamic";

/**
 * M3.2 — the sandbox's stand-in for a gateway-hosted card page.
 *
 * Exists so the payment flow is demonstrable without a merchant account. It
 * settles nothing by itself: the buttons call /api/payments/sandbox, which
 * signs a callback server-side and posts it to the real webhook.
 *
 * The payment is re-checked against the signed-in user here as well as in that
 * route, so a guessed id in the URL shows nothing.
 */
export default async function SandboxCheckoutPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  // With a real gateway configured this page should never be reachable.
  if (hasRealGateway()) redirect("/payments");

  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    include: { expenseShare: { select: { expense: { select: { title: true } } } } },
  });

  if (!payment || payment.userId !== user.id) notFound();

  if (payment.status === "SUCCEEDED") redirect("/payments?paid=1");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Sandbox checkout"
        subtitle="Standing in for the gateway's card form. Nothing is really charged."
      />

      <Card>
        <p className="text-sm text-slate-600">Paying for</p>
        <p className="mt-1 font-medium text-slate-900">
          {payment.expenseShare?.expense.title ?? "Your share"}
        </p>

        <p className="mt-4 text-sm text-slate-600">Amount</p>
        <p className="tabular mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          ৳{asTaka(payment.amount).toLocaleString("en-BD", { minimumFractionDigits: 2 })}
        </p>

        <div className="mt-6">
          <SandboxCheckout paymentId={payment.id} />
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Both buttons post a server-signed callback to the same webhook a real gateway would call.
          The signature is verified there, and a success updates the ledger through the database
          trigger — exactly the path a live payment takes.
        </p>
      </Card>
    </div>
  );
}
