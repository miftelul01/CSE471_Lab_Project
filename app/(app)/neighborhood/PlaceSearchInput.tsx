"use client";

import { useEffect, useRef, useState } from "react";

import { inputClass } from "@/components/ui";

/**
 * Debounced place autocomplete for M2.4.
 *
 * ── WHY THE DEBOUNCE IS NOT A POLISH DETAIL ─────────────────────────────────
 * This box is the single largest quota risk in the feature. Typing "kacha
 * bazar" is eleven keystrokes; firing a request per keystroke turns one search
 * into eleven upstream calls, and a house of six doing that a few times a day
 * exhausts a free monthly allowance inside a fortnight — for a handful of
 * distinct queries.
 *
 * So: nothing is sent until typing pauses for 350ms, and nothing is sent below
 * three characters (a two-letter prefix matches half of Dhaka anyway). The
 * server caches every answer for 24 hours on top of this, and an in-flight
 * request is aborted when the query moves on, so a slow response for "kach"
 * cannot land after and overwrite the results for "kacha bazar".
 * ────────────────────────────────────────────────────────────────────────────
 */

const DEBOUNCE_MS = 350;
const MIN_CHARS = 3;

export type PlaceSuggestion = {
  externalPlaceId: string | null;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

export function PlaceSearchInput({
  value,
  onValueChange,
  onSelect,
  placeholder = "Search for a shop, market or landmark",
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (place: PlaceSuggestion) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<"idle" | "typing" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Held in a ref rather than state: aborting is a side effect on the previous
  // render's request, and putting it in state would re-render on every change.
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = value.trim();

    if (query.length < MIN_CHARS) {
      setSuggestions([]);
      setStatus("idle");
      setMessage(null);
      return;
    }

    setStatus("typing");
    const timer = setTimeout(async () => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      setStatus("loading");
      try {
        const response = await fetch(
          `/api/neighborhood/places?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        const body = await response.json();

        if (!response.ok) {
          setStatus("error");
          setMessage(body.error ?? "Could not search for places.");
          setSuggestions([]);
          return;
        }

        setStatus("idle");
        setMessage(null);
        setSuggestions(body.suggestions ?? []);
        setOpen(true);
      } catch (error) {
        // An abort is the expected outcome of typing another character, not a
        // failure worth showing anybody.
        if ((error as Error).name === "AbortError") return;
        setStatus("error");
        setMessage("Could not reach the place search.");
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => () => inFlight.current?.abort(), []);

  return (
    <div className="relative">
      <input
        className={inputClass}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />

      <p className="mt-1 text-xs text-slate-500">
        {status === "loading"
          ? "Searching…"
          : status === "error"
            ? message
            : value.trim().length > 0 && value.trim().length < MIN_CHARS
              ? `Type ${MIN_CHARS - value.trim().length} more character${
                  MIN_CHARS - value.trim().length === 1 ? "" : "s"
                } to search`
              : "Pick a result to save its exact location, or just type a name and drop the pin yourself."}
      </p>

      {open && suggestions.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((place, index) => (
            <li key={`${place.externalPlaceId ?? place.name}-${index}`}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onSelect(place);
                  setOpen(false);
                }}
              >
                <span className="block font-medium text-slate-800">{place.name}</span>
                {place.address ? (
                  <span className="block truncate text-xs text-slate-500">{place.address}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
