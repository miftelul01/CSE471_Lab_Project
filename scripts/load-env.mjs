import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env.local reader for the db:* scripts.
 *
 * Next.js loads .env.local itself at runtime, but these scripts run outside
 * Next, so they need their own two-line parser. Real environment variables
 * always win, which is what lets CI override without editing files.
 */
export function loadEnv(files = [".env.local", ".env"]) {
  const values = {};

  for (const file of files) {
    let contents;
    try {
      contents = readFileSync(resolve(file), "utf8");
    } catch {
      continue;
    }

    for (const line of contents.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match) continue; // comment or blank
      const [, key, rawValue] = match;
      if (key in values) continue; // earlier file wins
      values[key] = rawValue.trim().replace(/^["'](.*)["']$/, "$1");
    }
  }

  return { ...values, ...process.env };
}
