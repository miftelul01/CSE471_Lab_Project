"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
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
 * Supabase Auth handles password hashing, email confirmation and the Google
 * OAuth dance. The profiles row is created by the on_auth_user_created trigger
 * in supabase/migrations/0001_core.sql, so there is nothing to do after signup.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const supabase = createClient();

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
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          // Lands in raw_user_meta_data, which the DB trigger copies into profiles.
          options: { data: { full_name: fullName } },
        });
        if (signUpError) throw signUpError;

        // No session means the project requires email confirmation first.
        if (!data.session) {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }

      router.push(next);
      router.refresh(); // re-render the server layout so the nav picks up the session
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError) setError(oauthError.message);
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

        <Field label="Password" hint={mode === "signup" ? "At least 6 characters." : undefined}>
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
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

      <button type="button" onClick={handleGoogle} className={`${secondaryButtonClass} w-full`}>
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
