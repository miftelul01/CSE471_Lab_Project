"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, ErrorNote, Field, buttonClass, inputClass } from "@/components/ui";
import {
  MAX_TICKET_DESCRIPTION,
  MAX_TICKET_TITLE,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
} from "@/lib/maintenance";

/** M3.1 — the resident's "something is broken" form. */
export function ReportTicketForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    priority: "MEDIUM",
    photoUrl: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const response = await fetch("/api/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        category: form.category || null,
        priority: form.priority,
        photoUrl: form.photoUrl || null,
      }),
    });
    const body = await response.json();

    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Could not report that problem");
      return;
    }

    setForm({ title: "", description: "", category: "", priority: "MEDIUM", photoUrl: "" });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        Report a problem
      </button>
    );
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Report a problem</h2>

        <Field label="What's wrong?" hint="A short summary — the details go below.">
          <input
            className={inputClass}
            value={form.title}
            onChange={(event) => set("title")(event.target.value)}
            maxLength={MAX_TICKET_TITLE}
            placeholder="Kitchen tap is leaking"
            required
          />
        </Field>

        <Field label="Details" hint="When it started, how bad it is, anything already tried.">
          <textarea
            className={inputClass}
            rows={3}
            value={form.description}
            onChange={(event) => set("description")(event.target.value)}
            maxLength={MAX_TICKET_DESCRIPTION}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select
              className={inputClass}
              value={form.category}
              onChange={(event) => set("category")(event.target.value)}
            >
              <option value="">Not sure</option>
              {TICKET_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Priority">
            <select
              className={inputClass}
              value={form.priority}
              onChange={(event) => set("priority")(event.target.value)}
            >
              {TICKET_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {TICKET_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Photo link (optional)"
          hint="This project has no file storage, so paste a link to an image rather than uploading one."
        >
          <input
            className={inputClass}
            type="url"
            value={form.photoUrl}
            onChange={(event) => set("photoUrl")(event.target.value)}
            placeholder="https://..."
          />
        </Field>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="flex gap-2">
          <button type="submit" className={buttonClass} disabled={busy || !form.title.trim()}>
            {busy ? "Reporting…" : "Report it"}
          </button>
          <button
            type="button"
            className="text-sm text-slate-600 hover:text-slate-900"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
