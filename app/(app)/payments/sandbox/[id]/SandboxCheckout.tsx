"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote, buttonClass, secondaryButtonClass } from "@/components/ui";

/** M3.2 — the sandbox's two outcomes. Neither settles anything client-side. */
export function SandboxCheckout({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(outcome: "SUCCEEDED" | "FAILED") {
    setBusy(true);
    setError(null);

    const response = await fetch("/api/payments/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, outcome }),
    });
    const body = await response.json();

    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "The sandbox callback failed");
      return;
    }

    router.push(outcome === "SUCCEEDED" ? "/payments?paid=1" : "/payments?failed=1");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => confirm("SUCCEEDED")}
        >
          {busy ? "Processing…" : "Approve payment"}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={busy}
          onClick={() => confirm("FAILED")}
        >
          Simulate failure
        </button>
      </div>
    </div>
  );
}
