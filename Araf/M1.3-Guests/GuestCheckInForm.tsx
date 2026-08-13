"use client";

import { useState, useTransition, useRef, type FormEvent } from "react";
import { Card, Field, ErrorNote, SuccessNote, inputClass, buttonClass } from "@/components/ui";

interface GuestCheckInFormProps {
  onSuccess?: () => void;
}

export function GuestCheckInForm({ onSuccess }: GuestCheckInFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    const guestName = formData.get("guestName") as string;
    const guestPhone = formData.get("guestPhone") as string;
    const purpose = formData.get("purpose") as string;
    const expectedCheckOut = formData.get("expectedCheckOut") as string;

    if (!guestName.trim()) {
      setError("Guest name is required.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/guests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestName: guestName.trim(),
            guestPhone: guestPhone.trim() || null,
            purpose: purpose.trim() || null,
            expectedCheckOut: expectedCheckOut || null,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Failed to check in guest.");
          return;
        }

        setSuccess(`${guestName} has been checked in successfully.`);
        formRef.current?.reset();
        onSuccess?.();
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Check in a guest</h2>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {success ? <SuccessNote>{success}</SuccessNote> : null}

        <Field label="Guest name" hint="Full name of the guest">
          <input
            type="text"
            name="guestName"
            placeholder="e.g. John Doe"
            className={inputClass}
            required
            disabled={isPending}
          />
        </Field>

        <Field label="Phone (optional)" hint="Guest's contact number">
          <input
            type="tel"
            name="guestPhone"
            placeholder="e.g. +880 1712-345678"
            className={inputClass}
            disabled={isPending}
          />
        </Field>

        <Field label="Purpose (optional)" hint="Reason for the visit">
          <input
            type="text"
            name="purpose"
            placeholder="e.g. Weekend visit, dinner, meeting"
            className={inputClass}
            disabled={isPending}
          />
        </Field>

        <Field label="Expected check-out (optional)" hint="When do you expect the guest to leave?">
          <input
            type="datetime-local"
            name="expectedCheckOut"
            className={inputClass}
            disabled={isPending}
          />
        </Field>

        <button type="submit" className={buttonClass} disabled={isPending}>
          {isPending ? "Checking in…" : "Check in guest"}
        </button>
      </form>
    </Card>
  );
}
