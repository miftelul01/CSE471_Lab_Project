import { NextResponse, type NextRequest } from "next/server";

import { withUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/**
 * M3.4 — token exchange for the incremental-consent flow started in
 * app/api/google/connect/route.ts. Upserts GoogleCredential, merging
 * `scopes` as a set-union rather than replacing — a resident who connects
 * Tasks today and Calendar next month (or the other way around, for
 * teammate Araf's M3.6) must keep both, and a re-consent that doesn't
 * return a fresh refresh_token (Google only issues one on the FIRST
 * consent for a given client+user unless prompt=consent forces a new one,
 * which app/api/google/connect/route.ts already sets) must never overwrite
 * a good token with null.
 */

export const dynamic = "force-dynamic";

const STATE_COOKIE = "google_oauth_state";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function redirectToChores(req: NextRequest, status: "connected" | "error"): NextResponse {
  const url = new URL("/chores", req.url);
  url.searchParams.set("google", status);
  const response = NextResponse.redirect(url.toString());
  response.cookies.delete(STATE_COOKIE);
  return response;
}

export const GET = withUser(async (user, req: NextRequest) => {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const returnedState = params.get("state");
  const cookieValue = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !returnedState || !cookieValue) return redirectToChores(req, "error");

  const [expectedState] = cookieValue.split(":");
  if (returnedState !== expectedState) return redirectToChores(req, "error");

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) return redirectToChores(req, "error");

  const redirectUri = new URL("/api/google/connect/callback", req.url).toString();

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) return redirectToChores(req, "error");

  const body = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  const grantedScopes = body.scope.split(" ").filter(Boolean);
  const existing = await prisma.googleCredential.findUnique({ where: { userId: user.id } });
  const mergedScopes = Array.from(new Set([...(existing?.scopes ?? []), ...grantedScopes]));

  await prisma.googleCredential.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: new Date(Date.now() + body.expires_in * 1000),
      scopes: mergedScopes,
    },
    update: {
      accessToken: body.access_token,
      // Never clobber a good refresh token with null just because this
      // particular exchange didn't return a new one.
      refreshToken: body.refresh_token ?? existing?.refreshToken,
      expiresAt: new Date(Date.now() + body.expires_in * 1000),
      scopes: mergedScopes,
      needsReconnectAt: null,
    },
  });

  return redirectToChores(req, "connected");
});
