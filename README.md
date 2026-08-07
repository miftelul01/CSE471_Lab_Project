# Smart Mess & Property Management System

CSE471 — System Analysis and Design · BRAC University

A web platform for house/mess management: property listings, roommate matching,
shared expenses, meal planning, chore rotation and formal conflict resolution.

| Team | ID | Modules |
| --- | --- | --- |
| Miftelul Mehebub | 23101222 | M1.1 Listings · M2.1 Shared Wallet · M3.1 Maintenance · M3.2 Payments |
| Mahia Tanzin | 23101410 | M1.2 Matching · M2.2 Menu Voting · M3.3 Maps · M3.4 Chore Rotation |
| Md. Mahidul Alam Araf | 22301105 | M1.3 Guest Log · M2.3 Meal Attendance · M3.5 Mess Court · M3.6 Calendar |

Live build status for all fourteen features is on the dashboard at `/` once you
sign in. It reads from [lib/features.ts](lib/features.ts).

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS |
| Database | **Supabase** (hosted PostgreSQL) |
| Data access | `@supabase/supabase-js` + `@supabase/ssr` |
| Auth | Supabase Auth — email/password + Google SSO |
| Authorization | PostgreSQL Row Level Security |
| Schema | Plain SQL migrations in [supabase/migrations/](supabase/migrations/) |
| Deployment | Vercel |

> The assignment document lists PostgreSQL + Prisma. Supabase **is** PostgreSQL —
> we use its SQL migrations and client instead of Prisma so that authentication,
> Google SSO and per-row authorization come from the same system as the data.

---

## The Supabase project

**Already created and migrated — you do not need to set up a database.**

| | |
| --- | --- |
| Project | `CSE471-Lab_Project` |
| Ref | `yrwmudjdpzufozihjllg` |
| Region | `ap-southeast-1` (Singapore) |
| Postgres | 17.6 |
| Schema | All 12 migrations applied — 26 tables, RLS on every one |

Everyone works against this same project.

## Setting up (once per person)

### 1. Install

```bash
npm install
```

### 2. Get `.env.local`

The API keys are **not** in the repo. Ask Miftelul for the `.env.local` file and
drop it in the project root. It's gitignored — never commit it, and never paste
the service role key anywhere public, since it bypasses every security policy.

### 3. Run

```bash
npm run dev          # http://localhost:3000
```

Create an account on the login page. The `profiles` row is created
automatically by a database trigger, so there's no extra setup step.

> **Email confirmation is currently ON**, so signup sends a confirmation link
> before you can log in. Supabase's built-in mailer is rate-limited to a few
> messages an hour on the free tier. If that gets annoying while developing,
> turn it off at *Authentication → Sign In / Providers → Email → Confirm email*.

Once you have an account, paste [supabase/seed.sql](supabase/seed.sql) into the
dashboard's SQL Editor for demo houses and listings — it attaches to whichever
profile was created first.

### 4. Enable Google SSO (still to do — it's a stated requirement)

Not yet enabled. Turn it on at *Authentication → Sign In / Providers → Google*
with a Google Cloud OAuth client, and set the authorised redirect URI there to:

```
https://yrwmudjdpzufozihjllg.supabase.co/auth/v1/callback
```

Supabase's own redirect allow-list is already set to `http://localhost:3000/**`.
When you deploy, add your Vercel URL to it as well.

## Changing the database schema

Add a **new numbered file** in `supabase/migrations/` (e.g. `0013_add_x.sql`) —
never edit one that has already been pushed. Then:

```bash
npm run db:push                # apply new migrations
npm run db:push -- --dry-run   # ...or just see what would run
```

That works out of the box: it reads `SUPABASE_DB_URL` from `.env.local`, which
you already have. Applied versions are tracked in
`supabase_migrations.schema_migrations`, so only new files ever run.

Refreshing the TypeScript types afterwards needs **your own** access token:

```bash
# Windows PowerShell
$env:SUPABASE_ACCESS_TOKEN="sbp_..."; npm run db:types

# macOS / Linux / Git Bash
SUPABASE_ACCESS_TOKEN=sbp_... npm run db:types
```

Create one at [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).
Keep it to yourself — unlike the database password, a personal access token
grants access to *every* Supabase project in your account. Don't put it in the
`.env.local` you share with the team.

This regenerates `lib/supabase/database.types.ts` only. The aliases the app
imports live in `lib/supabase/types.ts` and are never overwritten.

<details>
<summary>Why these run through npm scripts rather than the CLI directly</summary>

**`supabase link` does not work on this project.** The CLI validates the
api-keys response against a regex demanding `Z`-suffixed timestamps, but the
project's newer publishable/secret keys report `inserted_at` with a `+00:00`
offset, so linking fails before doing anything. Everything therefore passes
`--db-url` explicitly instead of relying on a linked project.

**`supabase gen types` needs Docker**, which isn't installed here — it runs
pg_meta in a container. [scripts/gen-types.mjs](scripts/gen-types.mjs) asks the
Management API for the same output instead, which is why it needs a token.

[scripts/db-push.mjs](scripts/db-push.mjs) *is* the real `supabase db push`; it
just supplies the connection string and `--include-all` (our migrations are
numbered `0001..` rather than the CLI's timestamp convention, which the CLI
would otherwise treat as out of order).

</details>

## Commands

```bash
npm run dev          # http://localhost:3000
npm run build        # production build
npm run typecheck    # do this before you push
npm run db:push      # apply new migrations   (reads .env.local)
npm run db:types     # refresh database types (needs your SUPABASE_ACCESS_TOKEN)
```

---

## How the project is organised

```
app/
  layout.tsx              app shell + nav
  page.tsx                dashboard / team board
  login/                  registration, login, Google SSO
  auth/                   OAuth callback + sign out
  profile/  houses/       common workflows (profile, house membership)
  <feature>/page.tsx      one page per feature
  api/<feature>/route.ts  one route handler per feature

components/
  ui.tsx                  shared Card / Field / Badge / button styles
  NavBar.tsx              generated from lib/features.ts
  FeatureStub.tsx         placeholder shown on unbuilt pages

lib/
  features.ts             THE OWNERSHIP REGISTRY — who owns what, build status
  auth.ts                 getSessionUser / requireUser / getActiveHouseId
  api.ts                  ok() badRequest() withUser() and friends
  matching.ts             M1.2 scoring + Gale–Shapley stable matching (pure logic)
  supabase/
    client.ts             browser client
    server.ts             server client — use this ~95% of the time
    admin.ts              service-role client, bypasses RLS, server-only
    types.ts              the types you import (hand-written aliases)
    database.types.ts     GENERATED — overwritten by npm run db:types

scripts/
  db-push.mjs             wraps `supabase db push` with the connection string
  gen-types.mjs           regenerates database.types.ts
  load-env.mjs            reads .env.local for the two scripts above

supabase/
  migrations/*.sql        the schema, one file per feature
  seed.sql                demo data
  config.toml             CLI config (only needed for a local Docker stack)
```

---

## Working on your feature

1. **Open your page** — `app/<your-feature>/page.tsx`. It renders a
   `<FeatureStub />` listing the exact build order for your feature.
2. **Your tables already exist.** Every table for all nine features is in
   `supabase/migrations/`, with Row Level Security written and commented. Read
   your migration before you write any code — half the rules you'd otherwise
   implement in TypeScript are already enforced there.
3. **Build the API route**, then the UI. `GET` is usually already written as a
   working example of the query pattern; the writes are marked `TODO`.
4. **Flip your status to `"done"`** in `lib/features.ts`. That updates the nav
   and the dashboard automatically.

### Rules that keep three people out of each other's way

- **Never edit a migration that has been pushed.** Add a new numbered file
  (`0013_...sql`). Editing an applied migration silently desyncs everyone.
- **Never edit someone else's feature files.** Need a change in their table or
  endpoint? Ask them. The cross-feature seams (wallet ↔ payments ↔ meals,
  listings ↔ matching ↔ maps) are called out in the stub checklists.
- **`lib/features.ts` is the one shared file everyone edits.** Only touch your
  own rows, and it won't conflict.
- **Run `npm run typecheck` before pushing.**

### Conventions

| Thing | Convention |
| --- | --- |
| Database columns | `snake_case` (`budget_min`, `house_id`) |
| TypeScript | `camelCase` for locals, DB row types match the column names |
| API success | the payload as JSON |
| API failure | `{ "error": "message" }` with a real status code |
| Auth in a route | `withUser(async (user, req) => ...)` from `lib/api.ts` |
| Auth in a page | `await requireUser()` from `lib/auth.ts` |
| Which house? | `await getActiveHouseId(user.id)` — most features are house-scoped |

---

## The three things that will confuse you

**1. A query returns `[]` and there's no error.**
That's Row Level Security, not a bug. The policy for that table didn't match
your user. Open the relevant `supabase/migrations/*.sql` and read the policy.
`fromPostgrestError()` in `lib/api.ts` turns the write-side version of this
(error `42501`) into a message that says so.

**2. "infinite recursion detected in policy" (error `42P17`).**
A policy queried the same table it protects. Ask membership questions through
`is_house_member()` / `is_house_admin()` — they're `SECURITY DEFINER` precisely
so they can read `house_members` without re-triggering its own policy.

**3. You reach for `createAdminClient()` because RLS is in the way.**
Almost always the wrong fix — it turns off security for that query. Legitimate
uses are the ones with no logged-in user (payment webhooks, cron jobs) or a
genuinely pool-wide computation (see the comment in
[app/api/matches/route.ts](app/api/matches/route.ts)). Otherwise, fix the policy.

---

## Deploying

Push to GitHub, import the repo on Vercel, and add every variable from
`.env.example` under *Settings → Environment Variables*. Set
`NEXT_PUBLIC_SITE_URL` to your Vercel URL and add
`https://<your-app>.vercel.app/auth/callback` to Supabase's redirect list.

The scheduled jobs (M3.4 chore rotation, M3.5 dispute escalation) need a
`vercel.json` with a `crons` entry — see the TODOs in those route handlers.
