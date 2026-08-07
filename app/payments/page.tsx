import { FeatureStub } from "@/components/FeatureStub";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Payments — Smart Mess" };

/** M3.2 Payment Integration (bKash / Stripe) — Miftelul Mehebub. */
export default async function PaymentsPage() {
  await requireUser();

  return (
    <FeatureStub
      featureId="M3.2"
      checklist={[
        "List your pending expense_shares from M2.1 with a Pay button next to each.",
        "POST /api/payments creates an INITIATED payment row and returns the gateway's checkout URL (Stripe Checkout session, or bKash create-payment).",
        "The gateway calls /api/payments/webhook. VERIFY THE SIGNATURE there before trusting anything, then set status to SUCCEEDED using the service-role client — a webhook has no session, so it cannot go through RLS.",
        "You never update expense_shares yourself: the payments_apply_to_ledger trigger flips the share to PAID when a payment reaches SUCCEEDED.",
        "Note there is no RLS update policy on payments for logged-in users. That's on purpose — otherwise anyone could mark their own payment successful from the browser.",
        "Use test keys only. Keep STRIPE_SECRET_KEY and the bKash credentials in .env.local, never in the repo.",
      ]}
    />
  );
}
