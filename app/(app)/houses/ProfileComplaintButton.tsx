"use client";

import { useState } from "react";

import { buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

/** M1.2 — Post-Move-In Feedback Window entry point (Mahia Tanzin). */
export function ProfileComplaintButton({ subjectUserId, subjectName }: { subjectUserId: string; subjectName: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/matches/profile-complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectUserId, title, description }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not file the complaint");
      return;
    }
    setSent(true);
  }

  if (sent) return <span className="text-xs text-emerald-700">Complaint filed</span>;

  if (!open) {
    return (
      <button type="button" className="text-xs text-rose-600 underline" onClick={() => setOpen(true)}>
        Report a profile issue
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 w-full space-y-2 rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">
        Reality doesn&apos;t match what {subjectName} declared in their preferences? This goes to the
        Mess Court.
      </p>
      <input
        className={inputClass}
        placeholder="Short title, e.g. Not tidy as declared"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <textarea
        className={inputClass}
        rows={3}
        placeholder="What's the mismatch?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
      />
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Filing…" : "File complaint"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
