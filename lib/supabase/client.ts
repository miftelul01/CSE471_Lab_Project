import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import type { Database } from "./types";

/**
 * Supabase client for Client Components ("use client" files).
 *
 * Runs as the logged-in user, so every query is filtered by the Row Level
 * Security policies in supabase/migrations/. If a query mysteriously returns
 * an empty array, check the RLS policy for that table before anything else.
 */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY());
}
