import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import type { Database } from "./types";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * Reads the session from cookies and runs as the logged-in user, so Row Level
 * Security still applies. This is the client you want ~95% of the time.
 *
 *   const supabase = createClient();
 *   const { data, error } = await supabase.from("listings").select("*");
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components are not allowed to write cookies. That's fine —
          // middleware.ts refreshes the session cookie on every request, so
          // the token stays fresh even when this write is a no-op.
        }
      },
    },
  });
}
