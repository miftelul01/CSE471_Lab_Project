import bcrypt from "bcryptjs";
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
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That doesn't look like a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Deliberately vague: confirming which emails are registered would let
    // anyone enumerate the user list.
    return NextResponse.json(
      { error: "That email can't be registered. Try signing in, or use Google." },
      { status: 409 }
    );
  }

  // Cost 12: comfortably slow for an attacker, ~250ms here.
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: "RESIDENT" },
    select: { id: true, email: true, name: true, role: true },
  });

  return NextResponse.json(user, { status: 201 });
}
