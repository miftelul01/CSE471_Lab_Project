import "server-only";

import { HttpError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { DAY_MS, type Coords, type RouteProfile } from "@/lib/neighborhood";

/**
 * Server-side access to the paid map providers, for M2.4.
 *
 * ── WHY EVERY PROVIDER CALL GOES THROUGH THIS FILE ──────────────────────────
 * Two reasons, and the second is the one that bites.
 *
 * KEYS. Barikoi and OpenRouteService keys are bearer credentials billed to this
 * project. A key in NEXT_PUBLIC_* is readable by anyone who opens devtools and
 * usable by anyone who copies it, so no key is ever sent to the browser — not
 * for search, not for routing, and not for map tiles, which is why even the
 * MapLibre style document is fetched through a proxy route here and rewritten
 * to point back at ourselves.
 *
 * QUOTA. The free allowances are small and a single careless component can eat
 * a month of them in an afternoon. An autocomplete box firing one request per
 * keystroke turns "kacha bazar" into eleven calls, and six residents doing that
 * daily is thousands a month for a handful of distinct queries. So: the client
 * debounces and holds off until three characters, and every answer this file
 * gets back is cached by exactly the question that produced it. A house
 * searching for "bazar" all week costs one upstream call.
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ── Configuration ──────────────────────────────────────────────────────── */

/**
 * Endpoints live in one place because they are the part most likely to move.
 * Verify the paths, the current free quota and the coordinate-retention terms
 * in the Barikoi console before relying on them.
 */
const BARIKOI_AUTOCOMPLETE_URL = "https://barikoi.xyz/v2/api/search/autocomplete/place";
const BARIKOI_ROUTING_URL = "https://barikoi.xyz/v2/api/route";
const ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions";

/** Upstream host for map tiles, sprites and glyphs. */
export const TILE_UPSTREAM_BASE = process.env.BARIKOI_TILE_BASE ?? "https://map.barikoi.com";

/** Path of the style document within that host. */
export const TILE_STYLE_PATH = process.env.BARIKOI_STYLE_PATH ?? "styles/osm-liberty/style.json";

export const barikoiKey = () => process.env.BARIKOI_API_KEY ?? "";
export const orsKey = () => process.env.OPENROUTESERVICE_API_KEY ?? "";

export const hasTileProvider = () => barikoiKey().length > 0;
export const hasSearchProvider = () => barikoiKey().length > 0;
export const hasRoutingProvider = () => orsKey().length > 0 || barikoiKey().length > 0;

/* ── Cache ──────────────────────────────────────────────────────────────── */

export const AUTOCOMPLETE_TTL_MS = DAY_MS;
export const ROUTE_TTL_MS = 7 * DAY_MS;

/**
 * Reads a cached provider response.
 *
 * Expiry is checked in the query rather than after loading, so an expired row
 * is simply a miss — the sweep that deletes it is housekeeping, not
 * correctness.
 */
async function cacheGet<T>(key: string): Promise<T | null> {
  const row = await prisma.mapApiCache.findFirst({
    where: { key, expiresAt: { gt: new Date() } },
    select: { payload: true },
  });
  return row ? (row.payload as T) : null;
}

async function cacheSet(key: string, payload: unknown, ttlMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.mapApiCache.upsert({
    where: { key },
    create: { key, payload: payload as object, expiresAt },
    update: { payload: payload as object, expiresAt },
  });
}

/** Coordinates rounded so that two clicks on the same shop share a cache entry.
 * Five decimal places is about a metre — finer than any route would differ by. */
const coordKey = (c: Coords) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;

export const autocompleteCacheKey = (query: string) =>
  `autocomplete:${query.trim().toLowerCase().replace(/\s+/g, " ")}`;

export const routeCacheKey = (origin: Coords, destination: Coords, profile: RouteProfile) =>
  `route:${coordKey(origin)}:${coordKey(destination)}:${profile}`;

/* ── Rate limiting ──────────────────────────────────────────────────────── */

/**
 * Per-resident hourly budgets.
 *
 * 60/hour is the figure the feature was specified with, and it is the right
 * one for the two routes that actually spend quota. Tiles are metered
 * separately and far higher: panning a map once fetches dozens of them, so
 * charging tiles against the same 60 would lock a resident out of the map
 * within one gesture while protecting nothing — tile requests are cheap, and
 * the ones that matter are already bounded by the viewport.
 */
export const HOURLY_LIMITS = {
  autocomplete: 60,
  directions: 60,
  tiles: 1200,
} as const;

export type MeteredRoute = keyof typeof HOURLY_LIMITS;

/**
 * Records one upstream-facing request and refuses it if the resident is over
 * budget. Cache hits never reach here, so a house that keeps searching the same
 * things is never rate limited for it.
 */
export async function enforceRateLimit(userId: string, route: MeteredRoute): Promise<void> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const used = await prisma.mapApiCall.count({
    where: { userId, route, createdAt: { gte: since } },
  });

  if (used >= HOURLY_LIMITS[route]) {
    throw new HttpError(
      `You've used this map service ${HOURLY_LIMITS[route]} times in the last hour. Try again shortly.`,
      429
    );
  }

  await prisma.mapApiCall.create({ data: { userId, route } });
}

/* ── Place autocomplete ─────────────────────────────────────────────────── */

export type PlaceSuggestion = {
  externalPlaceId: string | null;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

/** Minimum characters before a query is worth an upstream call. */
export const MIN_AUTOCOMPLETE_CHARS = 3;

type BarikoiPlace = {
  id?: number | string;
  place_code?: string;
  business_name?: string;
  name?: string;
  Address?: string;
  address?: string;
  area?: string;
  city?: string;
  latitude?: number | string;
  longitude?: number | string;
};

const num = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Normalises whatever shape the provider returns into the four fields this
 * feature stores. Written defensively on purpose: the response has carried
 * `Address` and `address` at different times, and a rename upstream should
 * degrade a suggestion to "no address", not throw on a resident mid-search.
 */
function normalizePlaces(payload: unknown): PlaceSuggestion[] {
  const places =
    (payload as { places?: BarikoiPlace[] })?.places ??
    (payload as { data?: BarikoiPlace[] })?.data ??
    [];
  if (!Array.isArray(places)) return [];

  return places
    .map((place): PlaceSuggestion => {
      const id = place.place_code ?? place.id;
      return {
        externalPlaceId: id === undefined || id === null ? null : String(id),
        name: place.business_name || place.name || place.Address || place.address || "Unnamed place",
        address:
          place.Address ??
          place.address ??
          [place.area, place.city].filter(Boolean).join(", ") ??
          null,
        lat: num(place.latitude),
        lng: num(place.longitude),
      };
    })
    .filter((place) => place.name.trim().length > 0);
}

/**
 * Place suggestions for a typed query, cached for 24 hours by the query string.
 *
 * The cache is checked before the rate limiter deliberately: a repeat of a
 * question already answered costs the provider nothing, so it should not cost
 * the resident part of their hourly budget either.
 */
export async function searchPlaces(
  userId: string,
  query: string
): Promise<{ suggestions: PlaceSuggestion[]; cached: boolean }> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_AUTOCOMPLETE_CHARS) {
    return { suggestions: [], cached: false };
  }

  const key = autocompleteCacheKey(trimmed);
  const hit = await cacheGet<PlaceSuggestion[]>(key);
  if (hit) return { suggestions: hit, cached: true };

  if (!hasSearchProvider()) {
    throw new HttpError(
      "Place search is not configured. Add BARIKOI_API_KEY to the server environment.",
      503
    );
  }

  await enforceRateLimit(userId, "autocomplete");

  const url = new URL(BARIKOI_AUTOCOMPLETE_URL);
  url.searchParams.set("api_key", barikoiKey());
  url.searchParams.set("q", trimmed);

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new HttpError(`Place search is unavailable right now (${response.status}).`, 503);
  }

  const suggestions = normalizePlaces(await response.json());

  // Cached even when empty: "no such place" is an answer, and re-asking it
  // every time somebody types the same typo is exactly the waste this exists
  // to prevent.
  await cacheSet(key, suggestions, AUTOCOMPLETE_TTL_MS);
  return { suggestions, cached: false };
}

/* ── Routing ────────────────────────────────────────────────────────────── */

export type RouteResult = {
  distanceMetres: number;
  durationSeconds: number;
  /** [lng, lat] pairs, as MapLibre wants them. */
  geometry: [number, number][];
  profile: RouteProfile;
};

type OrsResponse = {
  features?: {
    geometry?: { coordinates?: [number, number][] };
    properties?: { summary?: { distance?: number; duration?: number } };
  }[];
};

/**
 * Road distance, duration and geometry for ONE destination.
 *
 * Only ever called from an explicit "Get directions" click. Nothing here runs
 * on render, nothing precomputes routes for a list of pins, and no caller may
 * loop over bookmarks calling this — a house with forty pins would spend its
 * entire daily allowance drawing one page it did not ask for.
 *
 * Cached for seven days per (origin, destination, profile). The road network
 * between a flat and its bazar does not change weekly, and the origin is a
 * single fixed point, so the hit rate is close to total after the first use.
 */
export async function fetchRoute(
  userId: string,
  origin: Coords,
  destination: Coords,
  profile: RouteProfile
): Promise<{ route: RouteResult; cached: boolean }> {
  const key = routeCacheKey(origin, destination, profile);
  const hit = await cacheGet<RouteResult>(key);
  if (hit) return { route: hit, cached: true };

  if (!orsKey()) {
    throw new HttpError(
      "Directions are not configured. Add OPENROUTESERVICE_API_KEY to the server environment.",
      503
    );
  }

  await enforceRateLimit(userId, "directions");

  const response = await fetch(`${ORS_DIRECTIONS_URL}/${profile}/geojson`, {
    method: "POST",
    headers: {
      Authorization: orsKey(),
      "Content-Type": "application/json",
      Accept: "application/geo+json",
    },
    body: JSON.stringify({
      coordinates: [
        [origin.lng, origin.lat],
        [destination.lng, destination.lat],
      ],
    }),
  });

  if (!response.ok) {
    throw new HttpError(`Directions are unavailable right now (${response.status}).`, 503);
  }

  const body = (await response.json()) as OrsResponse;
  const feature = body.features?.[0];
  const summary = feature?.properties?.summary;
  const coordinates = feature?.geometry?.coordinates;

  if (!summary || !coordinates || coordinates.length === 0) {
    throw new HttpError("No route could be found to that place.", 503);
  }

  const route: RouteResult = {
    distanceMetres: summary.distance ?? 0,
    durationSeconds: summary.duration ?? 0,
    geometry: coordinates,
    profile,
  };

  await cacheSet(key, route, ROUTE_TTL_MS);
  return { route, cached: false };
}

/** Barikoi's routing endpoint, kept for reference — ORS is the configured
 * provider because its free tier documents both a foot and a car profile. */
export const BARIKOI_ROUTING_ENDPOINT = BARIKOI_ROUTING_URL;
