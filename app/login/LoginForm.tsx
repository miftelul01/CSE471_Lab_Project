"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

import {
  Card,
  ErrorNote,
  Field,
  SuccessNote,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";

/**
 * Registration, Login & SSO (Common Workflow 1).
 *
 * Sign-in goes through NextAuth. Registration doesn't — NextAuth has no
 * concept of creating an account — so sign-up POSTs to /api/auth/register
 * (which bcrypt-hashes the password) and then signs in with the same details.
 */
export function LoginForm({
  next,
  googleEnabled = false,
  initialError = null,
}: {
  next: string;
  /** False when no OAuth client is configured — see app/login/page.tsx. */
  googleEnabled?: boolean;
  /** An SSO failure carried back on the query string, from page.tsx. */
  initialError?: string | null;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      if (mode === "signup") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fullName, email, password }),
        });
        const body = await response.json();
        if (!response.ok) {
          setError(body.error ?? "Could not create your account");
          setBusy(false);
          return;
        }
        setNotice("Account created — signing you in…");
      }

      // redirect:false so we can show the error inline instead of NextAuth
      // bouncing to its own error page.
      const result = await signIn("credentials", { email, password, redirect: false });

      if (result?.error) {
        setError(
          mode === "signup"
            ? "Account created, but sign-in failed. Try signing in manually."
            : "Wrong email or password."
        );
        setBusy(false);
        return;
      }

      // A full page load, not router.push(). signIn() has just set the session
      // cookie, and a client-side navigation races it: the RSC request for the
      // dashboard can leave before the cookie is committed, middleware sees no
      // session and bounces back to /login, and the screen appears to hang
      // until you refresh. A hard navigation always sends the new cookie.
      //
      // Deliberately not clearing `busy` here — the button stays disabled
      // until the browser leaves the page.
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" ? (
          <Field label="Full name">
            <input
              className={inputClass}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </Field>
        ) : null}

        <Field label="Email">
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>

        <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />
        </Field>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {notice ? <SuccessNote>{notice}</SuccessNote> : null}

        <button type="submit" className={`${buttonClass} w-full`} disabled={busy}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      {googleEnabled ? (
        <>
          <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            or
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={() => signIn("google", { redirectTo: next })}
            className={`${secondaryButtonClass} flex w-full items-center justify-center gap-2`}
            disabled={busy}
          >
            {/* Google's mark, inlined: the CSP on this project blocks remote
                images, and a broken icon on the sign-in page reads as a broken
                site. Paths are Google's official four-colour "G". */}
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            Continue with Google
          </button>
        </>
      ) : null}

      <p className="mt-4 text-center text-sm text-slate-600">
        {mode === "signin" ? "No account yet?" : "Already registered?"}{" "}
        <button
          type="button"
          className="font-medium text-slate-900 underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
        >
          {mode === "signin" ? "Create one" : "Sign in"}
        </button>
      </p>
    </Card>
  );
}
