"use client";

import { ListingsMapCanvas, type ListingPoint } from "../../map/ListingsMapCanvas";
import { Card } from "@/components/ui";

/**
 * Single-marker preview for a listing's own page — gated the same way as the
 * discovery map (M3.3): a stranger sees a fuzzed pin, the landlord/admin/an
 * active-inquiry viewer sees the exact one. `coords` arrives already resolved
 * to the right one server-side; this component never chooses between them.
 */
export function ListingLocationCard({
  styleUrl,
  locationUnlocked,
  coords,
}: {
  styleUrl: string;
  locationUnlocked: boolean;
  coords: { lat: number; lng: number };
}) {
  const point: ListingPoint = {
    id: "this-listing",
    title: "",
    rent: 0,
    roomType: "",
    lat: coords.lat,
    lng: coords.lng,
    locationUnlocked,
    commuteMinutes: null,
  };

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Location</h2>
      <ListingsMapCanvas listings={[point]} styleUrl={styleUrl} className="h-48" />
      <p className="mt-2 text-xs text-slate-500">
        {locationUnlocked
          ? "Exact location — unlocked because you have an active inquiry, or this is your own listing."
          : "Approximate location, blurred for privacy. It sharpens once you send a join request."}
      </p>
    </Card>
  );
}
