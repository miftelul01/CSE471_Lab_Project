import { NextResponse } from "next/server";

import { badRequest, withUser } from "@/lib/api";
import { requireActiveHouseId } from "@/lib/authz";
import {
  TILE_STYLE_PATH,
  TILE_UPSTREAM_BASE,
  barikoiKey,
  enforceRateLimit,
  hasTileProvider,
} from "@/lib/mapProviders";

type Params = { params: { path: string[] } };

/**
 * M2.4 — the map tile proxy.
 *
 * MapLibre GL JS itself needs no key, but the tiles, glyphs and sprites it
 * draws do, and a style document handed straight to the browser carries that
 * key in every URL inside it. So the browser is pointed at this route instead:
 * it fetches the style server-side, rewrites every upstream URL to come back
 * through here, and strips any key that survived the rewrite. The client ends
 * up with a working map and no credential.
 *
 * This is also why the map cannot simply be given a public tile URL. There is
 * no such thing as a "public" key on a metered account — only one that has not
 * been found yet.
 */

export const dynamic = "force-dynamic";

/** Browser-side caching. Tiles are immutable for practical purposes, and every
 * tile served from the browser's own cache is an upstream request not made. */
const TILE_CACHE_CONTROL = "private, max-age=86400";
const STYLE_CACHE_CONTROL = "private, max-age=3600";

export const GET = withUser(async (user, req: Request, { params }: Params) => {
  await requireActiveHouseId(user);

  const segments = params.path ?? [];
  if (segments.length === 0) return badRequest("No tile path given.");
  // The path is interpolated into an upstream URL, so it must not be able to
  // climb out of the tile host's namespace.
  if (segments.some((segment) => segment.includes("..") || segment.includes("\\"))) {
    return badRequest("Invalid tile path.");
  }

  if (!hasTileProvider()) {
    return NextResponse.json(
      { error: "Map tiles are not configured. Add BARIKOI_API_KEY to the server environment." },
      { status: 503 }
    );
  }

  const path = segments.join("/");
  const isStyle = path === TILE_STYLE_PATH;

  await enforceRateLimit(user.id, "tiles");

  const upstream = new URL(`${TILE_UPSTREAM_BASE}/${path}`);
  // Any query the style asked for is carried through, minus a key — a caller
  // must not be able to substitute their own, or blank ours out.
  for (const [name, value] of new URL(req.url).searchParams) {
    if (name !== "key" && name !== "api_key") upstream.searchParams.set(name, value);
  }
  upstream.searchParams.set("key", barikoiKey());

  const response = await fetch(upstream, { headers: { Accept: "*/*" } });
  if (!response.ok) {
    return NextResponse.json(
      { error: `Map tiles are unavailable right now (${response.status}).` },
      { status: 503 }
    );
  }

  if (isStyle) {
    const origin = new URL(req.url).origin;
    const proxyBase = `${origin}/api/neighborhood/tiles`;

    const rewritten = (await response.text())
      // Point sources, sprites and glyphs back at this route.
      .split(`${TILE_UPSTREAM_BASE}/`)
      .join(`${proxyBase}/`)
      // Belt and braces: if the provider embedded the key anywhere the rewrite
      // did not touch, it does not leave this server.
      .replace(/([?&])(key|api_key)=[^&"'\\]*/gi, "$1");

    return new NextResponse(rewritten, {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": STYLE_CACHE_CONTROL },
    });
  }

  return new NextResponse(await response.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": TILE_CACHE_CONTROL,
    },
  });
});
