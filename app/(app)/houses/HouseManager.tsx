"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, ErrorNote, Field, buttonClass, inputClass } from "@/components/ui";

export function HouseManager({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [create, setCreate] = useState({ name: "", address: "", area: "" });
  const [joinId, setJoinId] = useState("");
  const [requested, setRequested] = useState(false);

  async function post(url: string, payload: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Request failed");
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {canCreate ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Create a house</h2>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await post("/api/houses", create)) setCreate({ name: "", address: "", area: "" });
            }}
          >
            <Field label="House name">
              <input
                className={inputClass}
                value={create.name}
                onChange={(e) => setCreate({ ...create, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Address">
              <input
                className={inputClass}
                value={create.address}
                onChange={(e) => setCreate({ ...create, address: e.target.value })}
                required
              />
            </Field>
            <Field label="Area">
              <input
                className={inputClass}
                value={create.area}
                onChange={(e) => setCreate({ ...create, area: e.target.value })}
                placeholder="Bashundhara"
              />
            </Field>
            <button type="submit" className={buttonClass} disabled={busy}>
              Create house
            </button>
          </form>
        </Card>
      ) : (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Want to list a property?</h2>
          <p className="text-sm text-slate-600">
            Switch your role to <strong>Landlord / House admin</strong> on the profile page, then
            come back here to create a house.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Request to join a house</h2>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await post("/api/houses/join", { house_id: joinId.trim() })) {
              setJoinId("");
              setRequested(true);
            }
          }}
        >
          <Field
            label="House id"
            hint="Ask your house admin for this — it's on their houses page. Your request needs their approval before you get access."
          >
            <input
              className={inputClass}
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              required
            />
          </Field>
          <button type="submit" className={buttonClass} disabled={busy}>
            Send request
          </button>
          {requested ? (
            <p className="text-sm text-slate-600">
              Request sent — it's pending until a house admin approves it.
            </p>
          ) : null}
        </form>
      </Card>

      {error ? (
        <div className="sm:col-span-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
    </div>
  );
}
