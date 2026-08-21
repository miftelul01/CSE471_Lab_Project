import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { badRequest, withUser } from "@/lib/api";
import { GOOGLE_SCOPES, type RequiredScope } from "@/lib/google";

/**
 * M3.4 — the start of the incremental-consent flow. Deliberately NOT
 * NextAuth's signIn("google", ...): that would land tokens in NextAuth's own
 * Account table (not GoogleCredential), risk silently linking a Google
 * account onto a Credentials-provider user (auth.ts has
 * allowDangerousEmailAccountLinking: true), and churn the session JWT for
 * what's supposed to be a narrow, disclosed, separate consent action. This
 * is a small hand-rolled OAuth2 authorization-code flow instead, the same
 * shape of work lib/mapProviders.ts already does for its own providers.
 *
 * The in-app disclosure ("this creates a Household Chores list and
 * adds/updates/removes tasks there") lives in the UI, immediately before the
 * link to this route — Google's own consent screen is generic and doesn't
 * substitute for it.
 */

export const dynamic = "force-dynamic";

const STATE_COOKIE = "google_oauth_state";
const STATE_TTL_SECONDS = 10 * 60;

function scopeParam(value: string | null): RequiredScope | null {
  if (value === "tasks" || value === "calendar") return value === "calendar" ? "calendarFreebusy" : "tasks";
  return null;
}

export const GET = withUser(async (user, req: NextRequest) => {
  const requested = scopeParam(new URL(req.url).searchParams.get("scope"));
  if (!requested) return badRequest("scope must be tasks or calendar");

  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId) {
    return badRequest("Google sign-in isn't configured for this deployment yet.");
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = new URL("/api/google/connect/callback", req.url).toString();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SCOPES[requested]);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);
  // Google echoes this back verbatim; carries who + what through the
  // redirect so the callback doesn't have to guess.
  authUrl.searchParams.set("login_hint", user.email ?? "");

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set(STATE_COOKIE, `${state}:${requested}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_TTL_SECONDS,
    path: "/api/google/connect",
  });
  return response;
});
