/**
 * Regenerates lib/supabase/database.types.ts from the live Supabase schema.
 *
 * Why this exists instead of just `supabase gen types --linked`: `supabase
 * link` currently fails on this project. The CLI validates the api-keys
 * response against a regex that demands a `Z`-suffixed timestamp, but the
 * newer publishable/secret keys report `inserted_at` with a `+00:00` offset,
 * so linking dies before it starts. This hits the same Management API endpoint
 * the CLI would, and needs only a personal access token.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... npm run db:types
 *
 * Get a token at https://supabase.com/dashboard/account/tokens
 * Once the CLI bug is fixed, `supabase gen types typescript --linked` writing
 * to the same path is a drop-in replacement.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnv } from "./load-env.mjs";

const OUT = resolve("lib/supabase/database.types.ts");

async function main() {
  const env = loadEnv();

  // A personal access token is unavoidable here: the CLI's own `gen types`
  // spins up pg_meta in Docker, which isn't installed, so we ask the
  // Management API for the same output instead.
  const token = env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Missing SUPABASE_ACCESS_TOKEN.\n\n" +
        "This one is per-person — a token grants access to every project in\n" +
        "your Supabase account, so don't share it or commit it.\n\n" +
        "Create one at https://supabase.com/dashboard/account/tokens, then either\n" +
        "add it to your own .env.local, or pass it inline:\n" +
        "  SUPABASE_ACCESS_TOKEN=sbp_... npm run db:types"
    );
  }

  // The project ref is the subdomain of the Supabase URL already in .env.local.
  const match = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!match) {
    throw new Error(
      "Could not read NEXT_PUBLIC_SUPABASE_URL from .env.local — copy .env.example first."
    );
  }
  const ref = match[1];

  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/types/typescript`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Management API returned ${response.status}:\n${await response.text()}`);
  }

  const { types } = await response.json();
  if (!types) {
    throw new Error("Response contained no types — is the access token scoped to this project?");
  }

  const header =
    "// GENERATED FILE - do not edit. Run: npm run db:types\n" +
    "// Source of truth is the live Supabase schema; the app imports the\n" +
    "// friendlier aliases from ./types instead of reaching in here directly.\n\n";

  writeFileSync(OUT, header + types.trim() + "\n", "utf8");
  console.log(`Wrote ${OUT} (${types.length} chars) from project ${ref}.`);
}

// Set exitCode rather than calling process.exit(): an abrupt exit while fetch's
// keep-alive sockets are still open crashes Node on Windows (libuv assertion,
// exit code 127) even when everything actually succeeded.
main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
