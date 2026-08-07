"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, ErrorNote, Field, SuccessNote, buttonClass, inputClass } from "@/components/ui";
import type { Profile, UserRole } from "@/lib/supabase/types";

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: "RESIDENT", label: "Resident", hint: "Living in a mess" },
  { value: "LANDLORD", label: "Landlord / House admin", hint: "Owns or manages property" },
];

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: profile.full_name,
    phone: profile.phone ?? "",
    role: profile.role,
    emergency_contact_name: profile.emergency_contact_name ?? "",
    emergency_contact_phone: profile.emergency_contact_phone ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json();

    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not save your profile");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name">
          <input
            className={inputClass}
            value={form.full_name}
            onChange={(e) => set("full_name")(e.target.value)}
            required
          />
        </Field>

        <Field label="Email" hint="Managed by your login provider — change it in Supabase Auth.">
          <input className={inputClass} value={profile.email} disabled />
        </Field>

        <Field label="Phone">
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
            placeholder="01XXXXXXXXX"
          />
        </Field>

        <Field
          label="I am a"
          hint="Landlords can post listings and manage maintenance tickets. Joining a house can also grant house-admin rights."
        >
          <select
            className={inputClass}
            value={form.role}
            onChange={(e) => set("role")(e.target.value)}
            // Platform admins are promoted in the database, not from this form.
            disabled={profile.role === "ADMIN"}
          >
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label} — {role.hint}
              </option>
            ))}
            {profile.role === "ADMIN" ? <option value="ADMIN">Platform admin</option> : null}
          </select>
        </Field>

        <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium text-slate-700">Emergency contact</legend>
          <Field label="Name">
            <input
              className={inputClass}
              value={form.emergency_contact_name}
              onChange={(e) => set("emergency_contact_name")(e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputClass}
              value={form.emergency_contact_phone}
              onChange={(e) => set("emergency_contact_phone")(e.target.value)}
            />
          </Field>
        </fieldset>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {saved ? <SuccessNote>Profile saved.</SuccessNote> : null}

        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
    </Card>
  );
}
