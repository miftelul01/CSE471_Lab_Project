import { FeatureStub } from "@/components/FeatureStub";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Shared wallet — Smart Mess" };

/** another area Shared Wallet & Bill-Splitting Engine. */
export default async function WalletPage() {
  await requireUser();

  return (
    <FeatureStub
      featureId="another area"
      checklist={[
        "Render the balance summary from the house_balances view — one query gives you owed / paid / outstanding per housemate.",
        "List recent expenses from GET /api/expenses with each person's share and status.",
        "Build the add-expense form: title, amount, category, split method, and (for CUSTOM) a per-person amount input.",
        "In POST /api/expenses, insert the expense then insert one expense_shares row per active house member. For EQUAL, watch the rounding — distribute the leftover paisa rather than letting the shares miss the total.",
        "Add a 'mark as paid' button for your own share. Card/bKash payment is another area and flips the same rows via webhook.",
        "another area (meal attendance) writes adjustments against these shares — agree the shape with Araf before you finalise the split logic.",
      ]}
    />
  );
}
