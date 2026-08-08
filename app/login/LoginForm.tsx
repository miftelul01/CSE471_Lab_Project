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
export function LoginForm({ next }: { next: string }) {

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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

      <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        type="button"
        onClick={() => signIn("google", { redirectTo: next })}
        className={`${secondaryButtonClass} w-full`}
      >
        Continue with Google
      </button>

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
