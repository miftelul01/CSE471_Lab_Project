/**
 * Applies any new files in supabase/migrations/ to the Supabase project.
 *
 * This wraps `supabase db push`, passing the connection string explicitly
 * because `supabase link` fails on this project: the CLI validates the
 * api-keys response against a regex demanding `Z`-suffixed timestamps, but the
 * newer publishable/secret keys report `inserted_at` with a `+00:00` offset,
 * so it errors before doing anything. Passing --db-url skips linking entirely.
 *
 * Usage:
 *   npm run db:push
 *   npm run db:push -- --dry-run
 *
 * Reads SUPABASE_DB_URL from .env.local (a real env var overrides it).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnv } from "./load-env.mjs";

const CLI = resolve("node_modules/supabase/dist/supabase.js");

const env = loadEnv();
const dbUrl = env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error(
    "Missing SUPABASE_DB_URL.\n\n" +
      "Add it to .env.local — the session-pooler string from\n" +
      "Supabase dashboard -> Connect -> Session pooler:\n" +
      '  SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"\n\n' +
      "Use port 5432 (session mode), not 6543 — transaction mode can't run migrations."
  );
  process.exitCode = 1;
} else if (!existsSync(CLI)) {
  console.error(`Supabase CLI not found at ${CLI}. Run \`npm install\` first.`);
  process.exitCode = 1;
} else {
  const passThrough = process.argv.slice(2);

  // --include-all: our migrations are numbered 0001.. rather than the CLI's
  // timestamp convention, so without this the CLI skips anything it considers
  // "out of order".
  const args = [CLI, "db", "push", "--db-url", dbUrl, "--include-all", "--yes", ...passThrough];

  // Spawned via node directly rather than `npx ... { shell: true }`: the
  // connection string carries the database password, and a shell would
  // concatenate rather than escape it (Node DEP0190). No shell, no quoting bugs.
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });

  if (result.error) {
    console.error(`\nCould not run the Supabase CLI: ${result.error.message}`);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    console.error("\nMigration push failed. Nothing after the failing file was applied.");
    process.exitCode = result.status ?? 1;
  } else if (!passThrough.includes("--dry-run")) {
    console.log("\nDone. Run `npm run db:types` to refresh the TypeScript types.");
  }
}
