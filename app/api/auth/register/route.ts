import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * Email/password sign-up.
 *
 * NextAuth handles signing *in*, not registration, so account creation lives
 * here. The password is hashed with bcrypt before it ever reaches the database
 * — nothing anywhere stores the plaintext.
 */

export const dynamic = "force-dynamic";

const MAX_NAME = 120;
const MAX_EMAIL = 254;
/** bcrypt only reads the first 72 bytes; longer input is a DoS vector, not a
 * stronger password. */
const MAX_PASSWORD = 72;

/** The one response an unauthenticated caller gets for "this address is
 * unusable", whatever the actual reason. See the note in POST. */
const AMBIGUOUS_EMAIL_ERROR = "That email can't be registered. Try signing in, or use Google.";

/**
 * Per-IP signup throttle.
 *
 * In-memory, so it is per server instance and resets on redeploy — on a
 * serverless host that makes it a speed bump rather than a wall. It is still
 * worth having: it stops a single script opening hundreds of accounts in a
 * burst, which is the realistic abuse of a coursework deployment. A durable
 * limiter would need its own table; that is the right fix if this ever runs
 * somewhere that matters.
 */
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_MAX_PER_WINDOW = 5;
const signupAttempts = new Map<string, number[]>();

function throttled(ip: string): boolean {
  const now = Date.now();
  const recent = (signupAttempts.get(ip) ?? []).filter((at) => now - at < SIGNUP_WINDOW_MS);
  recent.push(now);
  signupAttempts.set(ip, recent);

  // Opportunistic sweep so the map cannot grow without bound.
  if (signupAttempts.size > 5000) {
    for (const [key, times] of signupAttempts) {
      if (times.every((at) => now - at >= SIGNUP_WINDOW_MS)) signupAttempts.delete(key);
    }
  }
  return recent.length > SIGNUP_MAX_PER_WINDOW;
}

const clientIp = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  request.headers.get("x-real-ip") ||
  "unknown";

type RegisterBody = { name?: string; email?: string; password?: string };

export async function POST(request: Request) {
  let body: RegisterBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").toLowerCase().trim();
  const password = body.password ?? "";

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email and password are all required." }, { status: 400 });
  }
  if (name.length > MAX_NAME) {
    return NextResponse.json({ error: `Name must be ${MAX_NAME} characters or fewer.` }, { status: 400 });
  }
  if (email.length > MAX_EMAIL || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That doesn't look like a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (password.length > MAX_PASSWORD) {
    return NextResponse.json(
      { error: `Password must be ${MAX_PASSWORD} characters or fewer.` },
      { status: 400 }
    );
  }

  if (throttled(clientIp(request))) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Try again later." },
      { status: 429 }
    );
  }

  /**
   * The hash is computed BEFORE the address is known to be free.
   *
   * That looks wasteful and is deliberate. Checking first meant a taken
   * address answered in a few milliseconds while a free one took the ~250ms
   * bcrypt cost — so response time alone told an attacker which addresses are
   * registered, regardless of how carefully the error message was worded.
   * Paying the same cost on both paths closes that channel.
   */
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: "RESIDENT" },
      select: { id: true, email: true, name: true, role: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    // P2002 = the unique index on email. Reached either by a genuinely taken
    // address or by two concurrent signups racing each other; the check this
    // replaced was a separate query, so the race fell through to an unhandled
    // 500. Both cases answer identically, and identically to the pre-check
    // path, so nothing here confirms whether an address exists.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: AMBIGUOUS_EMAIL_ERROR }, { status: 409 });
    }
    console.error("[register]", error);
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
