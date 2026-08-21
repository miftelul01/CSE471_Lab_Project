# Contributions — Miftelul Mehebub (23101222)

A record of the commits I authored on `main`, taken from `git log`. Every hash
below is verifiable with `git show <hash>`.

This branch is `main` at the point the record was written, so the project here
builds and runs exactly as it does on `main`. It is not a branch containing only
my code, and deliberately so: my modules import shared code my teammates wrote
(`lib/authz.ts`, `lib/api.ts`, the app layout), so a branch stripped down to my
commits alone would not compile and would misrepresent how the project fits
together.

## Modules I own

Ownership follows the headers in `prisma/schema.prisma` and the route files.

| Module | Feature | Where |
| --- | --- | --- |
| **M1.1** | Property & Room Listing Engine | `app/(app)/listings/`, `app/api/listings/` |
| **M2.1** | Shared Wallet & Bill-Splitting | `app/(app)/wallet/`, `app/api/expenses/`, `lib/wallet.ts` |
| **M2.4** | Shared House Map & Neighbourhood Knowledge Base | `app/(app)/neighborhood/`, `app/api/neighborhood/`, `lib/neighborhood.ts`, `lib/mapProviders.ts` |
| **M3.1** | Maintenance Ticket System | `app/(app)/maintenance/`, `app/api/maintenance/`, `lib/maintenance.ts` |
| **M3.2** | Payment Integration (bKash / Stripe) | `app/(app)/payments/`, `app/api/payments/`, `lib/payments.ts` |

Also the shared foundations: the Prisma migration off Supabase, authentication
and registration, the role-based dashboards and navigation, and the demo seed.

## Commits

Chronological. Five commits appear twice in `git log` as duplicate pairs from
merge round-trips (`c6c55c0`/`ad91295`, `e39df9b`/`090b9ff`, `3e53a98`/`2355649`,
`fee8fdd`/`73ed951`, `1ec6056`/`8d91689`); each is listed once here, and the
three merge commits I made are omitted as they contain no work of their own.

| Date | Commit | What it did | Diff |
| --- | --- | --- | --- |
| 2026-08-07 | `4a6e6b5` | Replaced MongoDB with Supabase and scaffolded every module in the project | 95 files, +7452 −1120 |
| 2026-08-08 | `2216ff9` | Migrated the whole data layer to Prisma ORM; admin panel, listings CRUD, auth improvements | 96 files, +6243 −4903 |
| 2026-08-08 | `58d0477` | Sidebar layout, dashboard, restructured the app routes | 58 files, +1208 −284 |
| 2026-08-08 | `6964300` | Properties page and navigation | 4 files, +266 −40 |
| 2026-08-08 | `cc1fac9` | Role-based dashboards, roommate posts, admin moderation, flat-head management | 49 files, +2930 −517 |
| 2026-08-13 | `8d91689` | `.gitignore` covering env files and editor/tool config | 1 file, +48 |
| 2026-08-14 | `73ed951` | **M2.1** wallet expense tracking and bill-splitting; menu voting updates | 18 files, +2105 −63 |
| 2026-08-14 | `2355649` | Fixed meal-attendance ledger corruption and a page timeout | 6 files, +517 −311 |
| 2026-08-15 | `ad91295` | **M2.4** map configuration and a keyless fallback provider, so the map works with no API key | 10 files, +166 −56 |
| 2026-08-15 | `0b38320` | Hardened the API routes (register, favourites, guests, messages, profile, reports, verification), schema and meal attendance | 19 files, +825 −105 |
| 2026-08-21 | `3492954` | **M3.1 + M3.2** implemented in full — maintenance tickets with a status machine and history log, and payment integration with a verified webhook | 14 files, +1869 −79 |
| 2026-08-21 | `e438dc3` | Security and correctness audit notes for the common workflows and Modules 1–2 | 2 files, +356 −11 |
| 2026-08-21 | `f88bca4` | Hardened Google sign-in: closed an account pre-hijacking hole, surfaced SSO failures, guarded the deployed callback URL | 4 files, +355 −18 |
| 2026-08-21 | `0776198` | Closed a double-payment race under concurrency; wired up ticket editing | 3 files, +168 −32 |
| 2026-08-21 | `fbb3651` | **M2.4** fixed sprites that never loaded, and search that ranked nationally instead of locally | 2 files, +36 −4 |
| 2026-08-21 | `ce24606` | Demo seed data for the neighbourhood map, wallet, maintenance, meals and chores | 1 file, +314 |

**16 unique commits, roughly +24,858 / −7,543 lines.**

## Work worth singling out

**A double charge that concurrency could trigger.** `POST /api/payments` rejected
a second payment only once one had already succeeded. Two taps on Pay arriving
together both passed that check and opened two checkouts against the same bill,
with no unique index to catch it afterwards. Closed by taking a row lock on the
expense share before deciding, so the second request waits and then sees the
first. Verified with eight concurrent requests against one share: exactly one
live payment results.

**Account pre-hijacking through Google sign-in.** Registration never proved the
registrant owned the email address, and automatic account linking was on. An
attacker could register someone else's address, wait for the owner to sign in
with Google, and keep working access through the password they had set. Closed
by refusing to link into an account that has a password and has never been
verified.

**Map icons that failed silently.** The tile proxy strips the provider API key
out of the style document before it reaches the browser, which is right, but
that left a dangling `?`. MapLibre builds sprite requests by concatenation, so
the URL became `.../sprite?.json`, the upstream 404'd, and every icon on the map
vanished with nothing on screen to explain why.

**Keyless-by-default map providers.** The map falls back to OpenFreeMap tiles and
Photon geocoding when no key is configured, and route lookups fall back to
straight-line distance rather than failing. The project can be cloned and run by
someone who has signed up for nothing.

## Verifying this record

```sh
git log main --author="Miftelul" --format="%h %ad %s" --date=short
git show <hash>
```
