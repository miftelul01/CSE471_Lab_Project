import { redirect } from "next/navigation";

import { LoginForm } from "./LoginForm";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Sign in — Smart Mess" };

/**
 * Sign-in failures on the SSO path come back as a query string, because the
 * browser has been off at Google and there is no component state left to hold
 * an error in. Without this map they were dropped on the floor: NextAuth
 * redirected to /login?error=..., the page ignored it, and the user was
 * returned to a blank form with no explanation of what had just gone wrong.
 *
 * PasswordAccountExists and AccountSuspended are ours, raised by the signIn
 * callback in auth.ts. The rest are NextAuth's own codes.
 */
const ERROR_MESSAGES: Record<string, string> = {
  PasswordAccountExists:
    "This email already has a password account. Sign in with your password below — you can connect Google afterwards from your profile.",
  AccountSuspended: "This account has been suspended. Contact a platform administrator.",
  NoEmailFromGoogle: "Google didn't share an email address for that account, so we can't sign you in.",
  OAuthAccountNotLinked:
    "This email is already registered with a different sign-in method. Use the method you signed up with.",
  AccessDenied: "You cancelled the Google sign-in, or access was denied.",
  Configuration:
    "Google sign-in isn't configured on this server yet. Use your email and password for now.",
  OAuthSignin: "Could not start Google sign-in. Try again, or use your email and password.",
  OAuthCallback: "Google sign-in failed on the way back. Try again, or use your email and password.",
  Verification: "That sign-in link has expired or has already been used.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const user = await getSessionUser();
  if (user) redirect(searchParams.next || "/dashboard");

  const error = searchParams.error
    ? (ERROR_MESSAGES[searchParams.error] ?? "Something went wrong signing you in. Please try again.")
    : null;

  // Read on the server: the button is hidden rather than shown-and-broken when
  // no OAuth client is configured, because clicking it in that state sends the
  // user to a Google error page ("invalid_client") with nothing to explain it.
  // The value itself never reaches the browser — only this boolean does.
  const googleEnabled = (process.env.AUTH_GOOGLE_ID ?? "").replace(/^["']|["']$/g, "").trim().length > 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">Smart Mess</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">
        Sign in to manage your house, mess and shared expenses.
      </p>
      <LoginForm
        next={searchParams.next ?? "/dashboard"}
        googleEnabled={googleEnabled}
        initialError={error}
      />
    </div>
  );
}
