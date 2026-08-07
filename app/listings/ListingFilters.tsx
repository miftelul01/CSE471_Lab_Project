"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Card, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { ROOM_TYPES, ROOM_TYPE_LABELS } from "@/lib/listings";

/**
 * Search and filter bar for M1.1.
 *
 * Filters live in the URL rather than component state so a filtered search is
 * shareable and survives a refresh — and so the server component above can do
 * the filtering in the database instead of shipping every listing to the
 * browser and hiding some of them.
 */
export function ListingFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    q: searchParams.get("q") ?? "",
    area: searchParams.get("area") ?? "",
    min_rent: searchParams.get("min_rent") ?? "",
    max_rent: searchParams.get("max_rent") ?? "",
    room_type: searchParams.get("room_type") ?? "",
  });

  const [error, setError] = useState<string | null>(null);

  function apply(event: React.FormEvent) {
    event.preventDefault();

    const min = form.min_rent ? Number(form.min_rent) : null;
    const max = form.max_rent ? Number(form.max_rent) : null;
    if (min !== null && max !== null && min > max) {
      setError("Minimum budget can't be higher than the maximum.");
      return;
    }
    setError(null);

    const next = new URLSearchParams();
    // Preserve "my listings" mode across a filter change.
    if (searchParams.get("mine") === "true") next.set("mine", "true");
    for (const [key, value] of Object.entries(form)) {
      if (value.trim()) next.set(key, value.trim());
    }
    router.push(`/listings?${next.toString()}`);
  }

  function clear() {
    setForm({ q: "", area: "", min_rent: "", max_rent: "", room_type: "" });
    setError(null);
    router.push(searchParams.get("mine") === "true" ? "/listings?mine=true" : "/listings");
  }

  return (
    <Card>
      <form onSubmit={apply} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        <label className="lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">Search</span>
          <input
            className={inputClass}
            value={form.q}
            onChange={(e) => setForm({ ...form, q: e.target.value })}
            placeholder="Title or description"
          />
        </label>

        <label>
          <span className="mb-1 block text-xs font-medium text-slate-600">Area</span>
          <input
            className={inputClass}
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })}
            placeholder="Bashundhara"
          />
        </label>

        <label>
          <span className="mb-1 block text-xs font-medium text-slate-600">Min rent</span>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={form.min_rent}
            onChange={(e) => setForm({ ...form, min_rent: e.target.value })}
          />
        </label>

        <label>
          <span className="mb-1 block text-xs font-medium text-slate-600">Max rent</span>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={form.max_rent}
            onChange={(e) => setForm({ ...form, max_rent: e.target.value })}
          />
        </label>

        <label>
          <span className="mb-1 block text-xs font-medium text-slate-600">Room type</span>
          <select
            className={inputClass}
            value={form.room_type}
            onChange={(e) => setForm({ ...form, room_type: e.target.value })}
          >
            <option value="">Any</option>
            {ROOM_TYPES.map((type) => (
              <option key={type} value={type}>
                {ROOM_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" className={buttonClass}>
            Apply filters
          </button>
          <button type="button" onClick={clear} className={secondaryButtonClass}>
            Clear
          </button>
          {error ? <p className="self-center text-sm text-rose-700">{error}</p> : null}
        </div>
      </form>
    </Card>
  );
}
