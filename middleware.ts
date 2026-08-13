import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirects signed-out visitors to /login.
 *
 * This deliberately only checks whether a session cookie is *present* — it
 * does not verify it. Middleware runs on the Edge runtime, where Prisma can't
 * run, so a real check here would mean maintaining a second cut-down auth
 * config just for the edge.
 *
 * That's fine, because this is a convenience redirect, not the security
 * boundary. Every page calls requireUser()/requireRole() and every route
 * handler goes through withUser()/withAdmin(), all of which verify the session
 * properly on the server. A forged cookie gets past this file and straight
 * into a redirect from requireUser().
 */

const PUBLIC_ROUTES = ["/login"];

// The landing page is public. Matched exactly, because startsWith("/")
// would make every route public.
const PUBLIC_EXACT = ["/"];

// NextAuth v5 cookie names; the __Secure- prefix is used over HTTPS.
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_EXACT.includes(pathname)) return NextResponse.next();

  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // API routes are never redirected. A fetch() that gets a 307 to the HTML
  // login page fails with "Unexpected token '<'" instead of a readable error;
  // withUser()/withAdmin() already answer 401 with JSON, so let them.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
