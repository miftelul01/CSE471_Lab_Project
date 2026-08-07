import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / magic-link landing point.
 *
 * Google redirects here with a one-time `code`; we swap it for a session and
 * set the auth cookies. Add this URL to Supabase -> Authentication -> URL
 * Configuration -> Redirect URLs, for localhost AND your Vercel domain:
 *
 *   http://localhost:3000/auth/callback
 *   https://<your-app>.vercel.app/auth/callback
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
