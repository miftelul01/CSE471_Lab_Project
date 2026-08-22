"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Card, ErrorNote, buttonClass, secondaryButtonClass } from "@/components/ui";
import { type Coords, haversineKm } from "@/lib/neighborhood";

/**
 * M2.4 — "I'm on my way" — Miftelul Mehebub.
 *
 * Tracks the resident's own position while they walk to a place and shows the
 * distance closing in real time. Everything here happens in the browser: the
 * coordinates are read from the device, compared against the destination that
 * is already on the page, and thrown away when tracking stops. None of it is
 * sent anywhere, stored, or shared with the house.
 *
 * That is a deliberate limit, not an unfinished one. A live location that
 * reached the server would be the single most sensitive thing this project
 * holds — it is a log of where a named resident was, minute by minute — and
 * the feature works without it, so it does not collect it.
 *
 * Arriving matters for a second reason. The map's whole premise is that
 * entries rot: shops close, move a lane over, become a phone repair counter.
 * Standing in front of one is the only moment somebody actually knows whether
 * it is still there, so that is when this offers to confirm it.
 */

/** Close enough to call it arrival. GPS in a dense area is good to ~20-30m,
 * so anything tighter would mean never arriving; much wider and you "arrive"
 * across the road from a different shop. */
const ARRIVAL_RADIUS_M = 60;

/** Below this, a reading is too vague to reason about and is shown as such
 * rather than quietly moving the dot around. */
const POOR_ACCURACY_M = 100;

/** Typical walking pace, for the estimate. The map already uses this figure
 * for its straight-line "x min" labels, so the two agree. */
const WALK_METRES_PER_MIN = 80;

export type LiveFix = Coords & { accuracyM: number | null };

export function TripTracker({
  destination,
  destinationName,
  bookmarkId,
  onFix,
}: {
  destination: Coords;
  destinationName: string;
  bookmarkId: string;
  /** Lifts the current position to the parent so the map can draw it. */
  onFix: (fix: LiveFix | null) => void;
}) {
  const [tracking, setTracking] = useState(false);
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrived, setArrived] = useState(false);
  const [confirmState, setConfirmState] = useState<"idle" | "saving" | "done">("idle");
  const watchId = useRef<number | null>(null);

  // Held in a ref as well as state: the geolocation callback is registered
  // once and would otherwise close over the first render's value forever.
  const report = useRef(onFix);
  report.current = onFix;

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setTracking(false);
    setFix(null);
    report.current(null);
  }, []);

  // Watching the device position is a battery and privacy cost that must not
  // outlive the page. Navigating away, closing the panel or unmounting all
  // land here.
  useEffect(() => stop, [stop]);

  function start() {
    setError(null);
    setArrived(false);
    setConfirmState("idle");

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This browser can't share a location.");
      return;
    }

    setTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const next: LiveFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        };
        setFix(next);
        report.current(next);
        // A good fix clears whatever the last bad one complained about.
        setError(null);

        const metres = haversineKm(next, destination) * 1000;
        // Arrival has to survive a wandering reading, so it latches: once you
        // have been within the radius the panel stays arrived even if the next
        // fix drifts back out.
        if (metres <= ARRIVAL_RADIUS_M) setArrived(true);
      },
      (geoError) => {
        /**
         * Only a refused permission is fatal.
         *
         * watchPosition reports a dropped fix the same way it reports a
         * refusal, and treating them alike was wrong in a way that showed:
         * walking under a bridge — or, in testing, any change of position —
         * raised POSITION_UNAVAILABLE, and tearing down the UI on it left the
         * button reading "Start" while the watch was still registered and
         * still firing. The panel said stopped, the battery said otherwise.
         *
         * A lost fix is a normal event on a walk and the next one usually
         * arrives seconds later, so it is a warning that clears itself. A
         * refusal is permanent: the watch will never produce anything, so it
         * is cleared properly.
         */
        if (geoError.code === geoError.PERMISSION_DENIED) {
          stop();
          setError("Location permission was refused. Allow it in your browser to track the walk.");
          return;
        }

        setError(
          geoError.code === geoError.POSITION_UNAVAILABLE
            ? "Lost the location fix — still trying."
            : "Waiting for a stronger location fix…"
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }

  async function confirmStillThere() {
    setConfirmState("saving");
    try {
      const response = await fetch(`/api/neighborhood/bookmarks/${bookmarkId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict: "STILL_THERE" }),
      });
      if (!response.ok) {
        const raw = await response.text();
        let body: { error?: string } = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          body = {};
        }
        setError(body.error ?? "Could not record that confirmation.");
        setConfirmState("idle");
        return;
      }
      setConfirmState("done");
    } catch {
      setError("Could not reach the server to confirm that.");
      setConfirmState("idle");
    }
  }

  const metres = fix ? haversineKm(fix, destination) * 1000 : null;
  const minutes = metres === null ? null : Math.max(1, Math.round(metres / WALK_METRES_PER_MIN));
  const vague = fix?.accuracyM != null && fix.accuracyM > POOR_ACCURACY_M;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">On my way</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Tracks the distance to {destinationName} as you walk. Your location stays on this
            device.
          </p>
        </div>
        <button
          type="button"
          className={tracking ? secondaryButtonClass : buttonClass}
          onClick={tracking ? stop : start}
        >
          {tracking ? "Stop" : "Start"}
        </button>
      </div>

      {error ? (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}

      {tracking && !fix && !error ? (
        <p className="mt-3 text-sm text-slate-600">Waiting for a location fix…</p>
      ) : null}

      {fix && metres !== null ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-baseline gap-3">
            <span className="tabular text-2xl font-semibold tracking-tight text-slate-900">
              {metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(2)} km`}
            </span>
            <span className="text-sm text-slate-500">
              {arrived ? "you're here" : `about ${minutes} min on foot`}
            </span>
          </div>

          {vague ? (
            <p className="text-xs text-amber-700">
              Signal is weak — this fix is only accurate to about{" "}
              {Math.round(fix.accuracyM as number)} m.
            </p>
          ) : null}
        </div>
      ) : null}

      {arrived ? (
        <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-3">
          <p className="text-sm text-emerald-900">
            You&apos;ve reached {destinationName}. Is it still here?
          </p>
          {confirmState === "done" ? (
            <p className="mt-2 text-xs text-emerald-800">
              Thanks — the house map now shows this as confirmed today.
            </p>
          ) : (
            <button
              type="button"
              className={`${buttonClass} mt-2`}
              disabled={confirmState === "saving"}
              onClick={confirmStillThere}
            >
              {confirmState === "saving" ? "Saving…" : "Yes, it's still here"}
            </button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
