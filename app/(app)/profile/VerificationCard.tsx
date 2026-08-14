"use client";

import { useEffect, useState } from "react";

import { Badge, Card, buttonClass, inputClass } from "@/components/ui";
import type { VerificationRequest } from "@prisma/client";

/** M1.2 — Verified Profile Badge, self-service submission (Mahia Tanzin). */
export function VerificationCard() {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [verified, setVerified] = useState(false);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/verification");
      const body = await res.json();
      setLoading(false);
      if (res.ok) {
        setRequests(body.requests ?? []);
        setVerified(body.verified ?? false);
      }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, note }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not submit");
      return;
    }
    setRequests([body, ...requests]);
    setPhone("");
    setNote("");
  }

  if (loading) return null;

  const latest = requests[0];
  const hasPending = latest?.status === "PENDING";

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Verified badge</h2>
        {verified ? <Badge tone="green">Verified</Badge> : null}
      </div>
      <p className="text-xs text-slate-500">
        An admin reviews your phone / university ID and marks your profile verified, so other
        residents can trust it during match discovery.
      </p>

      {hasPending ? (
        <p className="mt-3 text-sm text-amber-700">Awaiting admin review.</p>
      ) : verified ? null : (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <input
            className={inputClass}
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <input
            className={inputClass}
            placeholder="Note (optional) — e.g. university ID number"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          <button type="submit" className={buttonClass} disabled={busy}>
            {busy ? "Submitting…" : "Request verification"}
          </button>
        </form>
      )}
    </Card>
  );
}
