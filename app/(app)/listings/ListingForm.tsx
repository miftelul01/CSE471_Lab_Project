"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Card,
  ErrorNote,
  Field,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";
import { ROOM_TYPES, ROOM_TYPE_LABELS, SLEEP_SCHEDULES, parseAmenities } from "@/lib/listings";
import type { House, Listing, RoomType, SleepSchedule } from "@prisma/client";

const SLEEP_LABELS: Record<SleepSchedule, string> = {
  EARLY_BIRD: "Early bird",
  NIGHT_OWL: "Night owl",
  FLEXIBLE: "Flexible",
};

/**
 * Create/edit form for M1.1. One component for both so the two can't drift —
 * `listing` being present is what switches it to edit mode.
 */
export function ListingForm({
  houses,
  listing,
}: {
  houses: House[];
  listing?: Listing;
}) {
  const router = useRouter();
  const isEdit = Boolean(listing);

  const [form, setForm] = useState({
    title: listing?.title ?? "",
    description: listing?.description ?? "",
    rent: listing?.rent?.toString() ?? "",
    area: listing?.area ?? "",
    address: listing?.address ?? "",
    roomType: (listing?.roomType ?? "SINGLE") as RoomType,
    capacity: listing?.capacity?.toString() ?? "1",
    amenities: listing?.amenities?.join(", ") ?? "",
    latitude: listing?.latitude?.toString() ?? "",
    longitude: listing?.longitude?.toString() ?? "",
    houseId: listing?.houseId ?? "",
    sleepSchedule: (listing?.sleepSchedule ?? "") as SleepSchedule | "",
    cleanlinessLevel: listing?.cleanlinessLevel?.toString() ?? "",
    allowsSmoking: listing?.allowsSmoking ?? false,
    allowsPets: listing?.allowsPets ?? false,
  });

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocodeMatches, setGeocodeMatches] = useState<
    { name: string; address: string | null; lat: number | null; lng: number | null }[]
  >([]);

  async function findOnMap() {
    const query = [form.address, form.area].filter(Boolean).join(", ");
    if (!query.trim()) {
      setGeocodeError("Fill in area or address first.");
      return;
    }
    setGeocoding(true);
    setGeocodeError(null);
    setGeocodeMatches([]);

    const response = await fetch(`/api/map/geocode?q=${encodeURIComponent(query)}`);
    const body = await response.json();
    setGeocoding(false);

    if (!response.ok) {
      setGeocodeError(body.error ?? "Could not look that address up.");
      return;
    }
    const matches = (body.suggestions ?? []).filter(
      (s: { lat: number | null; lng: number | null }) => s.lat != null && s.lng != null
    );
    if (matches.length === 0) {
      setGeocodeError("No matches found — enter coordinates manually.");
      return;
    }
    if (matches.length === 1) {
      setForm((f) => ({ ...f, latitude: String(matches[0].lat), longitude: String(matches[0].lng) }));
      return;
    }
    setGeocodeMatches(matches);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      title: form.title,
      description: form.description,
      rent: Number(form.rent),
      area: form.area,
      address: form.address || undefined,
      roomType: form.roomType,
      capacity: Number(form.capacity),
      amenities: parseAmenities(form.amenities),
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      sleepSchedule: form.sleepSchedule || null,
      cleanlinessLevel: form.cleanlinessLevel ? Number(form.cleanlinessLevel) : null,
      allowsSmoking: form.allowsSmoking,
      allowsPets: form.allowsPets,
      // Only sent on create: moving a listing between houses after people have
      // been admitted would silently strip their membership basis.
      ...(isEdit ? {} : { houseId: form.houseId || null }),
    };

    const response = await fetch(isEdit ? `/api/listings/${listing!.id}` : "/api/listings", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();

    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Could not save the listing");
      return;
    }

    router.push(`/listings/${body.id}`);
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Title">
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Single room near BRAC University"
            required
          />
        </Field>

        <Field label="Description">
          <textarea
            className={inputClass}
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Furnished, attached bath, 24/7 generator…"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rent (BDT/month)">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.rent}
              onChange={(e) => setForm({ ...form, rent: e.target.value })}
              required
            />
          </Field>
          <Field label="Capacity" hint="How many people can live here.">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Area">
            <input
              className={inputClass}
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="Bashundhara"
              required
            />
          </Field>
          <Field label="Full address">
            <input
              className={inputClass}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="House 12, Road 5, Block B"
            />
          </Field>
        </div>

        <Field label="Room type">
          <select
            className={inputClass}
            value={form.roomType}
            onChange={(e) => setForm({ ...form, roomType: e.target.value as RoomType })}
          >
            {ROOM_TYPES.map((type) => (
              <option key={type} value={type}>
                {ROOM_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Amenities"
          hint="Comma separated, e.g. wifi, attached bath, generator, lift"
        >
          <input
            className={inputClass}
            value={form.amenities}
            onChange={(e) => setForm({ ...form, amenities: e.target.value })}
          />
        </Field>

        {isEdit ? null : (
          <Field
            label="House"
            hint="Accepting a join request admits the applicant into this house. Leave blank and a new house is created from this listing."
          >
            <select
              className={inputClass}
              value={form.houseId}
              onChange={(e) => setForm({ ...form, houseId: e.target.value })}
            >
              <option value="">Create a new house for this listing</option>
              {houses.map((house) => (
                <option key={house.id} value={house.id}>
                  {house.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium text-slate-700">
            Map location (optional)
          </legend>
          <Field label="Latitude">
            <input
              type="number"
              step="any"
              className={inputClass}
              value={form.latitude}
              onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              placeholder="23.8103"
            />
          </Field>
          <Field label="Longitude">
            <input
              type="number"
              step="any"
              className={inputClass}
              value={form.longitude}
              onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              placeholder="90.4125"
            />
          </Field>
          <p className="text-xs text-slate-500 sm:col-span-2">
            Filling these in puts the property on the map view.
          </p>

          <div className="sm:col-span-2">
            <button type="button" className={secondaryButtonClass} onClick={findOnMap} disabled={geocoding}>
              {geocoding ? "Looking up…" : "Find on map"}
            </button>
            {geocodeError ? <p className="mt-1 text-xs text-rose-700">{geocodeError}</p> : null}
            {geocodeMatches.length > 0 ? (
              <ul className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-white p-2">
                {geocodeMatches.map((m, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-50"
                      onClick={() => {
                        setForm((f) => ({ ...f, latitude: String(m.lat), longitude: String(m.lng) }));
                        setGeocodeMatches([]);
                      }}
                    >
                      <span className="font-medium">{m.name}</span>
                      {m.address ? <span className="block text-slate-500">{m.address}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </fieldset>

        <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium text-slate-700">
            House lifestyle (optional)
          </legend>
          <p className="text-xs text-slate-500 sm:col-span-2">
            Used to rank this property for compatible residents. Leave blank if unsure.
          </p>

          <Field label="Sleep schedule">
            <select
              className={inputClass}
              value={form.sleepSchedule}
              onChange={(e) =>
                setForm({ ...form, sleepSchedule: e.target.value as SleepSchedule | "" })
              }
            >
              <option value="">Not specified</option>
              {SLEEP_SCHEDULES.map((value) => (
                <option key={value} value={value}>
                  {SLEEP_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Cleanliness" hint="1 = relaxed, 5 = very tidy. Leave blank if unsure.">
            <select
              className={inputClass}
              value={form.cleanlinessLevel}
              onChange={(e) => setForm({ ...form, cleanlinessLevel: e.target.value })}
            >
              <option value="">Not specified</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.allowsSmoking}
              onChange={(e) => setForm({ ...form, allowsSmoking: e.target.checked })}
            />
            Smoking allowed
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.allowsPets}
              onChange={(e) => setForm({ ...form, allowsPets: e.target.checked })}
            />
            Pets allowed
          </label>
        </fieldset>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="flex gap-2">
          <button type="submit" className={buttonClass} disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Post listing"}
          </button>
          <button type="button" className={secondaryButtonClass} onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
