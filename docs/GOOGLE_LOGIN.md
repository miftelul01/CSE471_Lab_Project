# Google sign-in (SSO) — setup

The code is finished. Google sign-in starts working as soon as two environment
variables hold real values. Until then the button is hidden on the login page,
because a sign-in attempt with an empty client id sends the user to a Google
error page (`Error 401: invalid_client`) with nothing to explain it.

Everything below is done once, in a browser, with your own Google account.

**Production URL:** `https://cse-471-lab-project-three.vercel.app`

## 1. Create a Google Cloud project

1. <https://console.cloud.google.com/> → project dropdown → **New Project**.
2. Name it `smart-mess` → **Create** → select it.

No billing account is needed. Google sign-in is free.

## 2. Consent screen — and publishing it so anyone can sign in

**APIs & Services → OAuth consent screen**

| Field | Value |
| --- | --- |
| User type | **External** |
| App name | Smart Mess |
| User support email | your address |
| Developer contact | your address |

Add only these scopes — they are exactly what `auth.ts` requests:

```
openid
.../auth/userinfo.email
.../auth/userinfo.profile
```

Then **publish it**, or only a hand-listed set of test accounts can sign in:

> **Publishing status → PUBLISH APP → Confirm.**

**This needs no Google verification review.** The three scopes above are
classed *non-sensitive*, and verification is only required for sensitive or
restricted scopes. Publishing takes effect immediately and any Google account
can then sign in.

Leaving the app in *Testing* is what causes `Error 403: access_denied` for
everyone you forgot to add — it looks exactly like a code bug and is not one.

> If M3.4 (Google Tasks) or M3.6 (Google Calendar) are built later, those scopes
> **are** restricted and will require a verification review. That is a separate
> consent flow and does not affect plain sign-in.

## 3. Create the OAuth client

**APIs & Services → Credentials → Create Credentials → OAuth client ID**
Application type **Web application**.

**Authorised JavaScript origins**

```
https://cse-471-lab-project-three.vercel.app
http://localhost:3000
```

**Authorised redirect URIs** — must match **byte for byte**: scheme, host, path,
and no trailing slash.

```
https://cse-471-lab-project-three.vercel.app/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
```

`cse-471-lab-project-three.vercel.app` is the **production alias**. It is stable
and always points at the newest production deployment, so this one entry keeps
working across every future deploy — you never have to come back and edit it.

Press **Create** and copy the client id and secret.

## 4. Environment variables

### Vercel (production)

**Project → Settings → Environment Variables**, scope *Production*:

| Name | Value |
| --- | --- |
| `AUTH_GOOGLE_ID` | `<client id>.apps.googleusercontent.com` |
| `AUTH_GOOGLE_SECRET` | `<client secret>` |
| `AUTH_SECRET` | a long random string — `openssl rand -base64 32` |
| `DATABASE_URL` | your Neon connection string |

**Do not set `AUTH_URL` on Vercel.** `auth.ts` sets `trustHost: true`, so
NextAuth derives the origin from the incoming request, which is always the
domain the user is actually on. A hardcoded `AUTH_URL` only creates a second
place for the host to be wrong.

As a safety net, `auth.ts` ignores an `AUTH_URL` pointing at localhost when
running on Vercel — copying the whole local `.env` up will not silently break
sign-in. It still logs a warning, so fix the variable rather than rely on it.

**Redeploy after changing environment variables.** Vercel bakes them in at build
time; an existing deployment will not pick them up.

### Local development

`.env.local` (git-ignored — the secret must never be committed):

```ini
AUTH_GOOGLE_ID="<client id>.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="<client secret>"
```

Keep `AUTH_URL="http://localhost:3000"` in `.env` for local use only. If you run
on a different port, change it **and** add the matching redirect URI in step 3.

Restart the dev server after editing env files — Next.js reads them at boot.

## 5. Check it

1. Open <https://cse-471-lab-project-three.vercel.app/login>.
2. **Continue with Google** should be visible. If it is missing,
   `AUTH_GOOGLE_ID` is unset in that environment, or still the `""` placeholder,
   or you have not redeployed.
3. Sign in with a Google account that is **not** yours, to prove publishing
   worked.
4. Confirm the rows landed:

```sql
select u.email, u.email_verified, a.provider
from users u join accounts a on a.user_id = u.id
where a.provider = 'google';
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `redirect_uri_mismatch` | Step 3 does not match exactly. Check `https` vs `http`, the host, and no trailing slash. |
| `Error 401: invalid_client` | `AUTH_GOOGLE_ID`/`SECRET` empty, wrong, or still `""`. On Vercel, also check you redeployed. |
| `Error 403: access_denied` | The consent screen is still in **Testing**. Publish it (step 2). |
| Button not shown | `AUTH_GOOGLE_ID` empty in that environment — by design. |
| Works locally, fails on Vercel | `AUTH_URL` set in Vercel, or the production redirect URI was never added. |
| "This email already has a password account" | Working as intended — see below. |

## Preview deployments

Branch and PR deployments get their own generated URLs, and Google does not
accept wildcard redirect URIs, so Google sign-in will not work on them. Password
sign-in still does. This only matters if you deploy non-production branches; the
production alias above is unaffected.

## Why an existing password account blocks Google linking

`auth.ts` sets `allowDangerousEmailAccountLinking: true`, which alone would let
a Google sign-in attach to any existing account sharing the address. That is
unsafe here, because `/api/auth/register` never proves the registrant owns the
address — no confirmation email is sent anywhere in this project.

Unguarded, an attacker could register `victim@gmail.com` with a password of
their choosing; when the real owner later signed in with Google, their identity
would be linked into the attacker's row and the attacker's password would still
open it.

The `signIn` callback in `auth.ts` refuses exactly one case: an existing account
that **has a password** and whose address has **never been verified**.
Everything else links automatically. Once Google is linked,
`events.linkAccount` stamps `emailVerified`, so a returning user is never
challenged again.

Someone who hits this signs in with their password once; linking Google
afterwards is safe, because the account can no longer be one that was planted.
