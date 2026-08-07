import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env";
import type { Database } from "./types";

/**
 * Service-role client. IGNORES Row Level Security.
 *
 * NEVER import this from a "use client" file — it would ship your service key
 * to the browser and hand anyone full read/write on the database.
 *
 * Only reach for it when a request legitimately has no logged-in user or must
 * cross house boundaries, e.g.:
 *   - a Stripe/bKash webhook confirming a payment (M3.2)
 *   - the background job that auto-escalates stale disputes (M3.5)
 *   - the chore rotation cron writing assignments for everyone (M3.4)
 *
 * If you're using it because "RLS was blocking me", fix the policy instead.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
