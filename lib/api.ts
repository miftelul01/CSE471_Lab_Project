import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getSessionUser, type SessionUser } from "@/lib/auth";
import { AuthzError } from "@/lib/authz";

/**
 * Shared helpers for the route handlers under app/api/.
 *
 * Every endpoint returns the same shapes:
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

/**
 * An error a route handler (or the library behind it) wants turned into a
 * specific status code.
 *
 * AuthzError already does this for 403/404. This is the same idea for the
 * cases that aren't about permission — "that meal is already locked" is a 400,
 * and throwing a bare Error for it turns a user mistake into a 500.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Strips the parts of a Postgres error that describe stored data.
 *
 * Our triggers raise messages meant to be read (the Mess Court state machine
 * names the illegal transition), so the message itself is worth surfacing. The
 * DETAIL line is not: on a CHECK violation Postgres appends the entire failing
 * row, which put house ids, user ids and amounts into an HTTP response body.
 */
function scrubDatabaseMessage(message: string): string {
  const line =
    message
      .split("\n")
      .map((part) => part.trim())
      .filter(Boolean)
      .pop() ?? "Database rejected that change.";

  return line
    .replace(/Failing row contains \([^)]*\)\.?/gi, "")
    .replace(/DETAIL:[\s\S]*$/i, "")
    .trim()
    .slice(0, 300);
}

/** Turns a Prisma error into the right HTTP response. */
export function fromPrismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": // unique constraint
        return badRequest("That already exists.", { code: error.code, target: error.meta?.target });
      case "P2003": // foreign key constraint
        return badRequest("That refers to something which doesn't exist.", { code: error.code });
      case "P2025": // record not found
        return notFound("Not found");
      default:
        return serverError(error.message, { code: error.code });
    }
  }
  // Raised by our own CHECK constraints and triggers — most importantly the
  // Mess Court state machine, whose message names the illegal transition.
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return badRequest(scrubDatabaseMessage(error.message));
  }
  // A bad enum value or an Invalid Date reaches Prisma as a validation error.
  // That is the caller's mistake, not ours, and the full message echoes the
  // whole generated query back at them.
  if (error instanceof Prisma.PrismaClientValidationError) {
    return badRequest("One of the values sent isn't valid for this request.");
  }
  return null;
}

/**
 * Wraps a handler so it always has a logged-in user, converts authorization
 * failures into the right status, and never leaks a stack trace.
 *
 *   export const GET = withUser(async (user, req) => ok({ ... }));
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
      // Thrown by lib/authz.ts — the application-level replacement for the
      // Row Level Security policies the database used to enforce.
      if (err instanceof AuthzError || err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      const prismaResponse = fromPrismaError(err);
      if (prismaResponse) return prismaResponse;

      console.error("[api]", err);
      return serverError(err instanceof Error ? err.message : "Unexpected error");
    }
  };
}

/** Like withUser, but also requires the platform ADMIN role. */
export function withAdmin<Args extends unknown[]>(
  handler: (user: SessionUser, ...args: Args) => Promise<NextResponse>
) {
  return withUser<Args>(async (user, ...args) => {
    if (user.profile.role !== "ADMIN") {
      return forbidden("This area is restricted to platform administrators.");
    }
    return handler(user, ...args);
  });
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
