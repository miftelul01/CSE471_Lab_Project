"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PlaceSearchInput, type PlaceSuggestion } from "./PlaceSearchInput";
import { Card, ErrorNote, Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import {
  BOOKMARK_CATEGORIES,
  CATEGORY_LABELS,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  type Coords,
} from "@/lib/neighborhood";
import type { BookmarkCategory, Visibility } from "@prisma/client";

/**
 * Pin a place onto the house map.
 *
 * Two ways in, because both happen: search the provider for a place that exists
 * in its index, or type the name yourself and drop the pin — which is what
 * actually happens for the stall on the corner that no gazetteer has ever heard
 * of. Either way the coordinates are saved once, here, and never looked up
 * again on render.
 */

type DuplicateWarning = { id: string; name: string; message: string };

export function AddBookmarkForm({
  draftPin,
  onDraftPinChange,
  defaultCategory,
}: {
  /** Coordinates from a long-press on the map, if the resident used one. */
  draftPin: Coords | null;
  onDraftPinChange: (coords: Coords | null) => void;
  defaultCategory?: BookmarkCategory;
}) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    category: defaultCategory ?? ("GROCERY" as BookmarkCategory),
    visibility: "HOUSE" as Visibility,
    address: "",
    note: "",
    isOnline: false,
    onlineUrl: "",
  });
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);

  const [duplicate, setDuplicate] = useState<DuplicateWarning | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const effectiveCoords = coords ?? draftPin;

  function selectPlace(place: PlaceSuggestion) {
    setSearch(place.name);
    setForm((prev) => ({ ...prev, name: place.name, address: place.address ?? "" }));
    setPlaceId(place.externalPlaceId);
    if (place.lat !== null && place.lng !== null) {
      setCoords({ lat: place.lat, lng: place.lng });
      onDraftPinChange({ lat: place.lat, lng: place.lng });
    }
    // A fresh selection invalidates a warning about a different place.
    setDuplicate(null);
  }

  async function submit(confirmDuplicate: boolean) {
    setBusy(true);
    setError(null);

    const response = await fetch("/api/neighborhood/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        category: form.category,
        visibility: form.visibility,
        address: form.address || null,
        note: form.note || null,
        isOnline: form.isOnline,
        onlineUrl: form.isOnline ? form.onlineUrl || null : null,
        externalPlaceId: placeId,
        lat: form.isOnline ? null : (effectiveCoords?.lat ?? null),
        lng: form.isOnline ? null : (effectiveCoords?.lng ?? null),
        confirmDuplicate,
      }),
    });
    const body = await response.json();
    setBusy(false);

    if (!response.ok) {
      // The server distinguishes "this exact place is already pinned" (a hard
      // reject) from "something very close is already pinned" (a warning worth
      // overriding). Only the second offers a way through.
      if (body.details?.kind === "nearby") {
        setDuplicate({
          id: body.details.duplicateOf,
          name: body.details.duplicateName,
          message: body.error,
        });
        return;
      }
      setError(body.error ?? "Could not save that place.");
      return;
    }

    setForm({
      name: "",
      category: form.category,
      visibility: "HOUSE",
      address: "",
      note: "",
      isOnline: false,
      onlineUrl: "",
    });
    setSearch("");
    setPlaceId(null);
    setCoords(null);
    setDuplicate(null);
    onDraftPinChange(null);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        Add a place
      </button>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Add a place to the house map</h2>
        <button
          type="button"
          className="text-sm text-slate-500 hover:text-slate-800"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
      >
        {form.isOnline ? null : (
          <Field label="Find it on the map" hint="Optional — searching saves the exact location.">
            <PlaceSearchInput value={search} onValueChange={setSearch} onSelect={selectPlace} />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Bismillah Store"
              maxLength={MAX_NAME_LENGTH}
              required
            />
          </Field>

          <Field label="Category">
            <select
              className={inputClass}
              value={form.category}
              onChange={(event) =>
                setForm({ ...form, category: event.target.value as BookmarkCategory })
              }
            >
              {BOOKMARK_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Address" hint="Optional.">
          <input
            className={inputClass}
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
            placeholder="Road 8, Block C, Bashundhara"
          />
        </Field>

        <Field
          label="First note"
          hint="What should the house know? Opening hours, who to ask for, what's good here."
        >
          <textarea
            className={inputClass}
            rows={2}
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            maxLength={MAX_NOTE_LENGTH}
            placeholder="Ask for Rafiq — he gives the house rate. Closed 2–4pm."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who can see it">
            <select
              className={inputClass}
              value={form.visibility}
              onChange={(event) =>
                setForm({ ...form, visibility: event.target.value as Visibility })
              }
            >
              <option value="HOUSE">Whole house</option>
              <option value="PRIVATE">Only me</option>
            </select>
          </Field>

          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isOnline}
                onChange={(event) => setForm({ ...form, isOnline: event.target.checked })}
              />
              Online or delivery only
            </label>
          </div>
        </div>

        {form.isOnline ? (
          <Field
            label="Link"
            hint="Delivery services have no location, so they're listed separately and never ranked by distance."
          >
            <input
              className={inputClass}
              value={form.onlineUrl}
              onChange={(event) => setForm({ ...form, onlineUrl: event.target.value })}
              placeholder="https://…"
              type="url"
            />
          </Field>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {effectiveCoords
              ? `Location saved: ${effectiveCoords.lat.toFixed(5)}, ${effectiveCoords.lng.toFixed(5)}`
              : "No location yet — pick a search result above, or long-press the map to drop a pin. You can save without one, but it won't appear on the map or in distance ranking."}
          </p>
        )}

        {duplicate ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p>{duplicate.message}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={`/neighborhood/places/${duplicate.id}`} className={secondaryButtonClass}>
                Open {duplicate.name}
              </Link>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => void submit(true)}
                disabled={busy}
              >
                It&apos;s a different place — save anyway
              </button>
            </div>
          </div>
        ) : null}

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <button type="submit" className={buttonClass} disabled={busy || !form.name.trim()}>
          {busy ? "Saving…" : "Save to the house map"}
        </button>
      </form>
    </Card>
  );
}
