"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { HouseMap } from "./HouseMap";
import { PlaceSearchInput, type PlaceSuggestion } from "./PlaceSearchInput";
import { Card, ErrorNote, Field, buttonClass } from "@/components/ui";
import type { Coords } from "@/lib/neighborhood";

/**
 * The required one-time step: place the house origin point.
 *
 * Everything distance-related in M2.4 is switched off until this is done, and
 * the page says so rather than quietly ranking the map around a coordinate
 * nobody has checked. A list confidently ordered around the wrong building is
 * worse than one that admits it is not ready.
 *
 * Note what this does NOT offer: a "use my current location" button. Browser
 * geolocation answers "where is this phone", and a resident setting this up on
 * the bus would pin the house to a bus stop for everyone, permanently.
 */
export function HousePinSetup({
  suggested,
  canSetPin,
  styleUrl,
}: {
  suggested: Coords | null;
  canSetPin: boolean;
  styleUrl: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Coords | null>(suggested);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);

    const response = await fetch("/api/neighborhood/house-pin", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const body = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(body.error ?? "Could not save the house pin.");
      return;
    }
    router.refresh();
  }

  function selectPlace(place: PlaceSuggestion) {
    setSearch(place.name);
    if (place.lat !== null && place.lng !== null) {
      setDraft({ lat: place.lat, lng: place.lng });
    }
  }

  if (!canSetPin) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <h2 className="font-medium text-amber-900">Your house map isn&apos;t set up yet</h2>
        <p className="mt-1 text-sm text-amber-800">
          Your house admin needs to drop the house pin before distances, ranking and directions can
          work. You can still add places and notes in the meantime — they&apos;ll start ranking by
          distance as soon as the pin is set.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200">
      <h2 className="font-medium text-slate-900">Set your house pin</h2>
      <p className="mt-1 text-sm text-slate-600">
        Every distance and route on this map is measured from one point. Search for your building or
        long-press the map to place it exactly at your gate.
        {suggested ? " We've suggested the location from your listing — check it before saving." : ""}
      </p>

      <div className="mt-4 space-y-4">
        <Field label="Search for your building">
          <PlaceSearchInput
            value={search}
            onValueChange={setSearch}
            onSelect={selectPlace}
            placeholder="House 12, Road 5, Dhanmondi"
          />
        </Field>

        <HouseMap
          pin={null}
          draftPin={draft}
          markers={[]}
          styleUrl={styleUrl}
          onLongPress={setDraft}
          className="h-80"
        />

        <p className="text-xs text-slate-600">
          {draft
            ? `Pin at ${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}`
            : "No pin placed yet — long-press the map or pick a search result."}
        </p>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <button type="button" className={buttonClass} onClick={save} disabled={busy || !draft}>
          {busy ? "Saving…" : "Save house pin"}
        </button>
      </div>
    </Card>
  );
}
