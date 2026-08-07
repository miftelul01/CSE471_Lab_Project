import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { getSessionUser, type SessionUser } from "@/lib/auth";

/**
 * Shared helpers for Route Handlers under app/api/.
 *
 * Every endpoint in this project returns the same shapes so the frontend can
 * handle them uniformly:
 *   success -> the payload as JSON
 *   failure -> { error: string, details?: unknown }
 */

export const ok = <T>(data: T, status = 200) => NextResponse.json(data, { status });

export const badRequest = (error: string, details?: unknown) =>
  NextResponse.json({ error, details }, { status: 400 });

export const unauthorized = (error = "You must be signed in") =>
  NextResponse.json({ error }, { status: 401 });

export const forbidden = (error = "You don't have access to this resource") =>
  NextResponse.json({ error }, { status: 403 });

export const notFound = (error = "Not found") => NextResponse.json({ error }, { status: 404 });

export const serverError = (error = "Something went wrong", details?: unknown) =>
  NextResponse.json({ error, details }, { status: 500 });

/** Placeholder for a route handler nobody has written yet. Delete when you do. */
export const notImplemented = (feature: string) =>
  NextResponse.json(
    { error: `${feature} is not built yet — see the TODO in this route handler.` },
    { status: 501 }
  );

/** Turns a Supabase error into the right HTTP response. */
export function fromPostgrestError(error: PostgrestError) {
  // 23505 = unique_violation, 23503 = foreign_key_violation, 23514 = check_violation
  if (["23505", "23503", "23514"].includes(error.code)) {
    return badRequest(error.message, { code: error.code, hint: error.hint });
  }
  // 42501 = insufficient_privilege — almost always a Row Level Security policy.
  if (error.code === "42501") {
    return forbidden("Blocked by a Row Level Security policy — check supabase/migrations/");
  }
  return serverError(error.message, { code: error.code });
}

/**
 * Wraps a handler so it always has a logged-in user and never leaks a stack
 * trace. Use it for every authenticated endpoint:
 *
 *   export const GET = withUser(async (user, req) => {
 *     const supabase = createClient();
 *     ...
 *     return ok({ items });
 *   });
 */
export function withUser<Args extends unknown[]>(
  handler: (user: SessionUser, ...args: Args) => Promise<NextResponse>
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      const user = await getSessionUser();
      if (!user) return unauthorized();
      return await handler(user, ...args);
    } catch (err) {
      console.error("[api]", err);
      return serverError(err instanceof Error ? err.message : "Unexpected error");
    }
  };
}

/** Reads and JSON-parses a request body, returning null on malformed input. */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Returns the names of any fields that are missing/empty on `body`. */
export function missingFields<T extends object>(body: T, required: (keyof T)[]): string[] {
  return required
    .filter((key) => body[key] === undefined || body[key] === null || body[key] === "")
    .map(String);
}
