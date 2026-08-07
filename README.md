# Smart Mess & Property Management System

CSE471 — System Analysis and Design · BRAC University

A web platform for house/mess management: property listings, roommate matching,
shared expenses, meal planning, chore rotation and formal conflict resolution.

| Team | ID | Features (1 in M1, 1 in M2, 2 in M3) |
| --- | --- | --- |
| Miftelul Mehebub | 23101222 | M1.1 Listings · M2.1 Shared Wallet · M3.1 Maintenance · M3.2 Payments |
| Mahia Tanzin | 23101410 | M1.2 Matching · M2.2 Menu Voting · M3.3 Maps · M3.4 Chore Rotation |
| Md. Mahidul Alam Araf | 22301105 | M1.3 Guest Log · M2.3 Meal Attendance · M3.5 Mess Court · M3.6 Calendar |

Login/SSO, signup, role management, profile management and admin activities are
**common workflows, not features** — they're already built and shared.

Live build status is on the dashboard at `/` once you sign in; it reads from
[lib/features.ts](lib/features.ts).

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS |
| Database | **PostgreSQL 18** hosted on [Neon](https://neon.tech) |
| ORM | **Prisma 6** |
| Auth | **NextAuth v5 (Auth.js)** — Google OAuth + email/password |
| Authorization | Application-level guards in [lib/authz.ts](lib/authz.ts) |
| Deployment | Vercel |

Prisma is pinned to 6.x deliberately. Prisma 7 removed `url` from the schema and
requires a `prisma.config.ts` plus a driver adapter — a setup that matches
almost nothing you'll find while searching for help.

---

## Getting started

```bash
npm install
```

Ask Miftelul for the `.env` file (it holds the Neon connection strings and the
auth secret) and drop it in the project root. It's gitignored — never commit it.

```bash
npx prisma generate    # build the typed client from prisma/schema.prisma
npm run dev            # http://localhost:3000
```

Create an account on the login page and you're in.

> **Google sign-in is not enabled yet.** The button and the callback are wired
> up; what's missing is a Google Cloud OAuth client. Create one, set the
> authorised redirect URI to `http://localhost:3000/api/auth/callback/google`,
> and put the id/secret in `.env` as `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

To become a platform admin (for `/admin`), run this once in `npx prisma studio`
or psql, with your own email:

```sql
update users set role = 'ADMIN' where email = 'you@example.com';
```

---

## Where your code goes

```
prisma/
  schema.prisma           30 models, 21 enums — the whole data model
  migrations/             init + domain_rules (checks, triggers, state machine)

app/
  <feature>/page.tsx      one page per feature
  api/<feature>/route.ts  one route handler per feature
  admin/                  admin console (common workflow)
  login/                  registration, login, Google SSO

lib/
  prisma.ts               the shared PrismaClient — always import this one
  auth.ts                 requireUser / requireRole / getActiveHouseId
  authz.ts                ALL access-control rules
  api.ts                  withUser / withAdmin / ok / badRequest
  features.ts             the ownership registry (flip your status to "done")
  matching.ts             M1.2 scoring + Gale–Shapley (pure logic)

auth.ts                   NextAuth config (providers, session, callbacks)
middleware.ts             redirects signed-out visitors (UX only, not security)
```

Each unbuilt feature already has a page, a route handler with a working `GET`,
and a TODO listing the build order. Your tables exist. Start from the type errors.

---

## Read this before writing a query

**There is no database-level access control.** An earlier version ran on
Supabase, where 71 Row Level Security policies meant even a buggy query
physically could not return another house's data. Prisma connects as a single
database user with no notion of "the current user", so **none of that applies
any more**.

Every one of those rules now lives in [lib/authz.ts](lib/authz.ts):

- `*Filter()` returns a Prisma `where` fragment — use it on reads
- `assert*()` throws `AuthzError` — call it before writes

```ts
// reads: scope the query
const disputes = await prisma.dispute.findMany({
  where: { AND: [disputeVisibilityFilter(user), { houseId }] },
});

// writes: assert first
await assertCanEditListing(user, listingId);
```

The failure mode is silent. Forget a check and nothing errors — the data is
just exposed. If you need a rule that isn't in `authz.ts`, add it there rather
than inline, so there's one place to audit.

`withUser()` turns `AuthzError` into a 403 and Prisma errors into sensible
status codes, so you can let both throw.

---

## What still lives in the database

Rules that must hold no matter which code path runs are in
`prisma/migrations/*/migration.sql`:

- **Mess Court state machine** — illegal transitions raise an exception
  (`RAISED→VOTING` ok, `ARCHIVED→anything` refused)
- **Meal headcount** recalculates on every attendance toggle
- **Payment → ledger**: a payment reaching `SUCCEEDED` flips its expense share
  to `PAID`
- `settledAt` / `resolvedAt` stamping, and 10 check constraints

Audit rows (`DisputeEvent`, `MaintenanceTicketEvent`) used to be written by
triggers too, but those recorded the actor with `auth.uid()`, which no longer
exists. **Write them yourself inside the same `prisma.$transaction` as the
change** — see `app/api/admin/disputes/route.ts` for the pattern.

---

## Commands

```bash
npm run dev          # http://localhost:3000
npm run build        # production build
npm run typecheck    # do this before every commit
npm run db:migrate   # create + apply a migration after editing schema.prisma
npm run db:generate  # regenerate the typed client
npm run db:studio    # browse/edit data in the browser
```

After changing `prisma/schema.prisma`, run `npm run db:migrate` and commit the
generated folder in `prisma/migrations/` — that's what keeps all three of us in
sync. Never edit a migration that has already been pushed.

---

## Conventions

| Thing | Convention |
| --- | --- |
| Database columns | `snake_case` (mapped via `@map`) |
| TypeScript | `camelCase` — Prisma handles the translation |
| API success | the payload as JSON |
| API failure | `{ "error": "message" }` with a real status code |
| Auth in a route | `withUser(async (user, req) => ...)` |
| Auth in a page | `await requireUser()` |
| Which house? | `await getActiveHouseId(user.id)` |

Money columns are Prisma `Decimal`, not `number` — wrap them in `Number(...)`
before arithmetic or formatting.
