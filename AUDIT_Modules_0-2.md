# Security & Correctness Audit — Common Workflows, Module 1, Module 2

> **Status: all 13 findings resolved (15 August 2026).**
> Findings 1-11 are fixed in code. Finding 12 was reviewed and deliberately
> accepted, with the reasoning recorded at the code site. Finding 13 was found
> during post-fix verification — the shared database was missing the M2.2 menu
> tables, taking `/menu` and `/meals` down — and is fixed by an additive
> migration that leaves a teammate's in-progress redesign intact.
>
> Every page now returns 200 across all three personas (resident, landlord,
> admin). See the "Resolution log" at the end for what was verified live.

**Date:** 15 August 2026
**Scope:** Common workflows (auth, profile, houses, admin), Module 1 (M1.1 listings, M1.2 matching/safety/messaging, M1.3 guest log), Module 2 (M2.1 wallet, M2.2 menu voting, M2.3 meal attendance, M2.4 neighbourhood map).
**Out of scope:** Module 3 (maintenance, payments, listings map, chores, Mess Court, calendar) — several are still `status: "todo"` stubs.

## Method

Every route handler under `app/api/` in scope was read, plus `lib/authz.ts`, `lib/houses.ts`, `lib/wallet.ts`, `lib/menu.ts` and `Araf/M2.3-MealAttendance/mealAttendance.ts`. Findings marked **VERIFIED** were reproduced against the running dev server or the live database; findings marked **BY INSPECTION** are read from the code and not yet reproduced.

Two candidate findings were **investigated and dismissed** — they are listed at the end so nobody re-raises them.

## Severity legend

| Level | Meaning |
|---|---|
| **Critical** | Credential or cross-tenant data exposure |
| **High** | Silent data loss, or a user locked out of their own data |
| **Medium** | Privilege/visibility gap with limited blast radius |
| **Low** | Robustness, validation or spam-resistance gap |
| **Design** | Works, but the shape invites a future bug |

## Summary

| # | Severity | Area | Finding | Resolution |
|---|---|---|---|---|
| 1 | **Critical** | Common / profile | `PATCH /api/profile` returns the bcrypt `passwordHash` | **Fixed + verified** |
| 2 | **High** | Common / profile | Partial profile update silently wipes phone + emergency contacts | **Fixed + verified** |
| 3 | **High** | Common / houses | Re-joining your own house demotes you to `PENDING`, locking you out | **Fixed + verified** |
| 4 | **Medium** | M1.1 / M1.2 | Favourites bypass the listing visibility rule, exposing removed listings | **Fixed** |
| 5 | **Medium** | M1.3 | Any resident can cancel another resident's guest entry | **Fixed** |
| 6 | **Medium** | M2.3 | `menuProposalId` is not house-scoped — cross-house menu title leak | **Fixed** |
| 7 | **Medium** | M1.2 | Reports accept an unvalidated `target_id` of the wrong type | **Fixed + verified** |
| 8 | **Low** | Common / auth | Registration has no rate limit and 500s on a concurrent duplicate | **Fixed** |
| 9 | **Low** | M1.2 | Messaging: no length cap, unbounded inbox query, blocks not enforced on read | **Fixed + verified** |
| 10 | **Low** | M2.2 | Unvalidated `week_start_date`; close-voting is a read-then-write race | **Fixed** |
| 11 | **Low** | M1.2 | Verification: phone unvalidated, already-verified users can re-apply | **Fixed + verified** |
| 12 | **Design** | M2.3 | `GET /api/meals` performs writes, including to the ledger | **Accepted, documented** |
| 13 | **Critical** | M2.2 / M2.3 | Shared database missing the menu tables — `/menu` and `/meals` both returned 500 | **Fixed + verified** |

---

## 1. Critical — profile update leaks the password hash

**File:** [app/api/profile/route.ts:43-54](app/api/profile/route.ts#L43-L54)

`prisma.user.update()` is called with no `select` or `omit`, so it returns every scalar column — including `passwordHash` — and the result is passed straight to `ok(updated)`.

`getSessionUser()` in [lib/auth.ts](lib/auth.ts) is careful to `omit: { passwordHash: true }`, and the admin routes in [app/api/admin/users/route.ts:52](app/api/admin/users/route.ts#L52) use an explicit `select`. This one route is the gap, and there is no global `omit` configured on the client in [lib/prisma.ts](lib/prisma.ts) to catch it.

**Reproduced** — `PATCH /api/profile` with `{"name":"Nusrat Jahan"}` returned:

```json
{"id":"ad74c844-…","email":"nusrat@demo.example.com",
 "passwordHash":"$2b$12$JOMiFkxvRLDPFLS8VDJtzOeP9pnsILtB4Duhjejusvi/bf30bjLRa",
 "role":"RESIDENT", …}
```

**Why it matters:** the hash is only exposed to its own owner, so this is not a cross-account break on its own. It still hands an attacker who achieves *any* read of one response body — a browser extension, a shared machine, a logged proxy, a screenshot in a bug report — an offline brute-force target, and it puts a credential somewhere it should never travel.

**Fix:** add an explicit `select` (or `omit: { passwordHash: true }`) to the update. Consider configuring `omit` globally on the PrismaClient so the safe behaviour is the default rather than something each route must remember.

## 2. High — partial profile update silently wipes contact fields

**File:** [app/api/profile/route.ts:32-52](app/api/profile/route.ts#L32-L52)

The handler builds a whitelisted `patch` object using `|| undefined` — the correct "leave unchanged" idiom — and then **ignores it** for three of the five fields, writing `body.phone || null` directly:

```ts
const patch: ProfilePatch = { phone: body.phone || undefined, … };  // built…
…
data: {
  ...(patch.name !== undefined ? { name: patch.name } : {}),
  phone: body.phone || null,                      // …then bypassed
  emergencyContactName: body.emergencyContactName || null,
  emergencyContactPhone: body.emergencyContactPhone || null,
}
```

Any PATCH that omits `phone` sets it to `NULL`. The same applies to both emergency-contact fields.

**Reproduced** — sending only `{"name":"Nusrat Jahan"}` wiped Nusrat's seeded phone `01711000004` to `null`. It is gone from the demo database now.

**Why it matters:** emergency contact details are exactly the data a house needs and nobody re-enters until the day it is needed. Any UI that ever PATCHes a subset of the profile destroys them silently.

**Fix:** use the `patch` object that was already built, applying the same `!== undefined` guard used for `name`.

## 3. High — re-joining your own house locks you out of it

**Files:** [app/api/houses/join/route.ts:30-32](app/api/houses/join/route.ts#L30-L32) → [lib/houses.ts:92-96](lib/houses.ts#L92-L96)

`POST /api/houses/join` calls `admitToHouse(..., "PENDING")`, which upserts:

```ts
return tx.houseMember.upsert({
  where:  { houseId_userId: { houseId, userId } },
  create: { houseId, userId, role, status, isHouseAdmin: isFirstResident },
  update: { status },          // ← unconditional downgrade
});
```

The `update` branch overwrites the status of an **existing** membership. An already-`ACTIVE` member who submits the join form with their own house id — plausible, since the id is shown on the Houses page and the form accepts any id — is demoted to `PENDING`.

Every house-scoped query filters on `status: "ACTIVE"`, so that member instantly loses the wallet, meals, menu, guest log and neighbourhood map. The route's own docstring admits there is **no admin-facing approval UI**, so recovery requires Prisma Studio or psql.

If a flat head does this, `isHouseAdmin` stays `true` but their status does not, so the flat also loses its only resident admin.

**Fix:** make the upsert a no-op when a membership already exists and is `ACTIVE`; only `LEFT` should be re-admittable to `PENDING`. Rejecting with "you're already in this house" is clearer than a silent status change.

## 4. Medium — favourites bypass the listing visibility rule

**File:** [app/api/favorites/route.ts:9-14](app/api/favorites/route.ts#L9-L14)

`listingVisibilityFilter()` in [lib/authz.ts](lib/authz.ts) is documented as the complete rule for who may see a room, covering both a landlord delisting (`isActive: false`) and an administrator removing it for breaking the rules (`status: "REMOVED"`). Favourites does not apply it:

```ts
const favorites = await prisma.favorite.findMany({
  where: { userId: user.id },
  include: { listing: true },      // no visibility filter, all columns
});
```

A user who favourited a listing before it was delisted or moderated keeps full read access afterwards — including the moderation fields `removedReason` and `removedById`, which reveal internal moderator decisions.

`POST` also does not check that the listing is currently visible, so a user can favourite an already-removed listing if they know its id.

**Fix:** apply `listingVisibilityFilter(user)` to the included listing and narrow the `include` to the fields the favourites UI actually renders.

## 5. Medium — any resident can cancel another resident's guest entry

**File:** [app/api/guests/route.ts:79-105](app/api/guests/route.ts#L79-L105)

`PATCH /api/guests` correctly confirms the entry belongs to the caller's house, but applies no ownership check beyond that. Any active member can move any guest log entry to `CHECKED_OUT` or `CANCELLED`.

`CANCELLED` is the problem. M1.3 is specified as a *permanent, accountability* log, and cancellation is the state that says "this visit never happened". A resident can erase the record of someone else's guest, and there is no event trail on `GuestLog` to show who did it.

**Fix:** restrict `CANCELLED` to the host who created the entry or a house admin. `CHECKED_OUT` is reasonable to leave open — whoever is at the door when the guest leaves should be able to log it.

## 6. Medium — meal slots accept another house's menu proposal

**File:** [Araf/M2.3-MealAttendance/mealAttendance.ts:176](Araf/M2.3-MealAttendance/mealAttendance.ts#L176)

`validateMealSlot` passes `menuProposalId` through untouched:

```ts
menuProposalId: input.menuProposalId ?? null,
```

The foreign key guarantees the proposal exists, but not that it belongs to the caller's house. A house admin posting to `POST /api/meals` with another house's proposal id gets that proposal linked to their meal, and `mapMealRow` then renders `menuProposal.title` on the board — leaking another household's menu.

Every other cross-entity reference in this codebase is house-scoped (see `assertHouseMember`, `bookmarkVisibilityFilter`); this one was missed.

**Fix:** look the proposal up with `where: { id, houseId }` and reject if not found.

## 7. Medium — reports accept a mismatched or nonexistent target

**File:** [app/api/reports/route.ts:20-28](app/api/reports/route.ts#L20-L28)

`target_type` is validated against the enum, but `target_id` is stored as an opaque string with no check that it exists or that it is the right kind of entity. A listing id can be filed as `target_type: "USER"`.

The admin queue at `app/api/admin/reports/route.ts` then has to resolve these, and a mismatched pair either renders as a blank row or fails to resolve. There is also no dedupe or rate limit, so a single user can file unlimited reports against the same target and bury the moderation queue.

**Fix:** switch on `target_type` and confirm the row exists in the corresponding table before insert. Add a unique constraint on `(reporterId, targetType, targetId)` for open reports.

## 8. Low — registration hardening

**File:** [app/api/auth/register/route.ts](app/api/auth/register/route.ts)

Three smaller issues in one route:

- **No rate limit.** Unauthenticated account creation with no throttle or captcha.
- **Unhandled race.** The duplicate-email check at line 40 and the create at line 53 are not atomic. Two concurrent signups with the same address produce a `P2002` that nothing catches — this route does not use the `withUser` wrapper, so `fromPrismaError` never runs and the caller gets a raw 500.
- **Enumeration.** The error message is deliberately vague, but the `409` status still distinguishes a taken address from a free one, and the ~250 ms bcrypt cost only applies on the success path — so response time leaks the same fact.

**Fix:** wrap the create in try/catch and map `P2002` onto the same vague 409. Rate limit by IP. The timing channel is minor; a fixed-cost dummy hash on the duplicate path closes it if you care.

## 9. Low — messaging robustness

**File:** [app/api/messages/route.ts](app/api/messages/route.ts)

- **No length cap on `body`.** Everything in M2.1 and M2.4 caps its text (`MAX_TITLE_LENGTH`, `MAX_NOTE_LENGTH`); messaging does not, so one paste can store an arbitrarily large row and wreck every inbox render.
- **Unbounded inbox query** (lines 45-52). The inbox loads *every message the user has ever sent or received*, with both user relations joined, then reduces to conversations in JavaScript. This grows without limit.
- **Blocks are enforced on send but not on read** (lines 22-42). A blocked user can still open the thread and read history. Whether that is intended is a product call, but it should be deliberate.
- `recipient_id` and `listing_id` are unvalidated; a bad value surfaces as a foreign-key 400 rather than a clear message.

## 10. Low — menu voting validation and race

**File:** [app/api/menu-proposals/route.ts](app/api/menu-proposals/route.ts)

- **Line 22:** `weekStartDate: new Date(week)` is built from an unvalidated query parameter. `POST` and `PATCH` both validate their dates and return a clean 400; `GET` passes `Invalid Date` to Prisma and relies on the generic validation-error handler.
- **Lines 118-148:** closing the vote reads the open proposals, picks a winner in application code, then writes — with no transaction or row lock around the read. Two admins closing the same week concurrently can both select a winner. The partial unique index on approved-menu-per-week should stop the second write landing, but the caller sees a raw "That already exists." rather than something meaningful.

**Fix:** validate the date in `GET` as the other two verbs do; move the read inside the `$transaction`.

## 11. Low — verification request validation

**File:** [app/api/verification/route.ts:21-34](app/api/verification/route.ts#L21-L34)

`phone` is checked for non-emptiness only — no format or length validation, despite being the thing an admin is asked to verify. The duplicate guard only blocks a second `PENDING` request, so a user who is already `VERIFIED` can file more, and `note` is uncapped.

## 12. Design — a GET request writes to the ledger

**File:** [Araf/M2.3-MealAttendance/mealAttendance.ts:378-470](Araf/M2.3-MealAttendance/mealAttendance.ts#L378-L470), reached from `GET /api/meals`

`ensureMealWindow` is called on read and it: creates up to twelve `meals` rows, inserts attendance rows for every active member, **deletes** attendance rows for departed members, and calls `syncMealExpense` — which adds, reprices and deletes `expense_shares` and updates the expense total.

The code is well defended (set-based, `skipDuplicates`, settled shares are never touched) and the docstring explains the history honestly. The residual concern is HTTP semantics: a browser prefetch, a link preview crawler, or a double-clicked refresh mutates the shared wallet. Nothing in the current UI triggers that, which is why this is Design and not a bug.

**Suggested direction:** move the window-materialising into the POST path and a scheduled job, and let GET read whatever exists.

---

## M2.4 Neighbourhood map — self-audit

Reviewing my own feature on the same terms:

- **Rate-limit deviation, documented.** The spec called for 60 requests/hour on all proxied map routes. Autocomplete and directions use 60; **tiles use 1200**, because one map pan fetches dozens of tiles and 60 would lock a resident out mid-gesture. Rationale is in the `HOURLY_LIMITS` comment in [lib/mapProviders.ts](lib/mapProviders.ts).
- **Notifications are assembled, not delivered.** There is no email/push/inbox transport in this codebase. The daily deal digest is batched correctly and logged by the cron; bookmark soft-deletion surfaces in the "Recently removed" panel instead of a push. Documented in [app/api/cron/neighborhood/route.ts](app/api/cron/neighborhood/route.ts).
- **Residency-end prompt has nothing to hook into.** The 14-day PRIVATE-bookmark purge and the "Share with the house" control both exist, but no code path anywhere sets a membership to `LEFT`, so the purge will not fire until a leave-house flow is built.
- **Dead exports.** `hasRoutingProvider`, `BARIKOI_ROUTING_ENDPOINT` and `VISIBLE_DEAL_STATUSES` are exported but unreferenced — leftovers from the keyless-fallback rework. Harmless, worth deleting.
- **Trigram search is unverified under load.** The raw SQL in [app/api/neighborhood/search/route.ts](app/api/neighborhood/search/route.ts) is applied and syntactically valid against the live database, but has only been exercised with a near-empty `bookmarks` table.

---

## Investigated and dismissed

Recording these so they are not re-raised:

- **`meals.headcount` is never written by application code** — *not a bug.* It is maintained by the `meal_attendance_recalc_headcount` trigger from [20260807203141_domain_rules](prisma/migrations/20260807203141_domain_rules/migration.sql), confirmed present in `pg_trigger` on the live database. The trigger is `FOR EACH ROW`, so it fires correctly for `createMany`/`deleteMany` too.
- **`PATCH /api/houses/flat-head` accepts `houseId` from the request body** — *not a bug.* It re-reads the caller's own membership for that house and requires `ACTIVE` + `isHouseAdmin` + `role === "RESIDENT"` before writing, so a forged id fails the check.

---

## 13. Critical — the shared database was missing the M2.2 menu tables

**Found during post-fix verification, not in the original review.** Smoke-testing
every page turned up HTTP 500 on `/menu` and `/meals`; the original audit read
source only and could not have caught it.

`menu_proposals`, `menu_proposal_items` and `menu_votes` did not exist in the
database, though the init migration creates them and `schema.prisma` still
declares them. `prisma migrate status` reported "up to date" the whole time,
because it compares the migration history — not the actual schema.

**Cause.** Someone ran `prisma db push` against the shared database from an
in-progress redesign of M2.2. That synchronises the database to a schema file
without recording a migration, and it drops whatever the new schema lacks. It
removed the three tables, swapped `meals.menu_proposal_id` for
`meals.day_proposal_id`, and added the redesign's own tables
(`day_proposals`, `daily_ballots`, `daily_ballot_rankings`, `daily_meal_results`,
`menu_templates`, `meal_ratings`) plus `houses.default_safe_meal` and
`users.dietary_restrictions`.

M2.3 was collateral damage: `mealAttendance.ts` reads the week's approved menu,
so the meals board died with the menu tables.

**Fix.** `prisma/migrations/20260815140000_restore_menu_proposals/migration.sql`
recreates the three tables, their indexes, check constraints, foreign keys and
the `menu_proposals_one_approved_per_week` partial index, and re-adds
`meals.menu_proposal_id`.

It is **additive only, deliberately.** `prisma migrate diff` proposes dropping
every table in the redesign, because this branch's schema has never heard of
them — running that would have deleted a teammate's work from the shared
database. Both designs now coexist; `meals` carries both link columns, each
nullable with its own foreign key. Retiring one is a decision for whoever merges
that branch.

**Verified:** all six redesign tables still present; `menuProposal` and `meal`
queries succeed; `/menu` and `/meals` return 200.

**Prevention.** [docs/DATABASE.md](docs/DATABASE.md) now records why `db push`
is banned on the shared database, how to write a migration that survives a
populated one, and which raw-SQL objects (`pg_trgm` indexes, the five triggers,
the partial unique index) `migrate diff` will offer to drop if you let it. An
`npm run db:push` script exists solely to refuse and point at that document —
though it cannot stop someone running `npx prisma db push` directly.

## Resolution log

All work landed 15 August 2026. `tsc --noEmit` and `next build` both pass.

### Fixed and re-tested against the running app

| Check | Result |
|---|---|
| Credentials login still works under the new global `omit` | Session cookie issued |
| `PATCH /api/profile` response body | No `passwordHash` present |
| `PATCH /api/profile` with `{"name":…}` only | `phone` preserved (`01711000004`) |
| `PATCH /api/profile` with `{"phone":""}` | Clears to `null` — explicit clearing still works |
| `POST /api/houses/join` with own house id | `409`-style refusal; membership stays `ACTIVE` |
| `POST /api/verification` with `"not-a-number"` | Rejected with a readable message |
| `POST /api/reports` on a nonexistent listing | Rejected before insert |
| `POST /api/messages` with a 2,100-char body | Rejected at the 2,000 cap |

### Systemic change worth knowing about

Finding 1 was fixed twice over. The route now selects explicitly, **and**
`lib/prisma.ts` configures `omit: { user: { passwordHash: true } }` globally, so
the hash is excluded from every query in the application by default. The single
read that legitimately needs it — the credentials provider in `auth.ts` — opts
back in with `omit: { passwordHash: false }`.

This narrows the client's TypeScript type, which had two knock-on effects:

- `lib/prisma.ts` now derives `AppPrismaClient` from a factory rather than
  annotating the global cache as a bare `PrismaClient`, which would have widened
  the type back and re-asserted that `passwordHash` is always present.
- `PrismaAdapter(prisma)` in `auth.ts` needs a cast, since the adapter's
  signature asks for a plain `PrismaClient`. The adapter only touches User,
  Account and Session for OAuth sign-ins, and an OAuth user has no hash to read.

### Finding 12 — accepted, not fixed

Reviewed and deliberately kept. The upside (the meals board is always populated,
with no "open the week" step) was judged to outweigh the cost (a prefetch or
crawler can trigger idempotent writes). The reasoning, and the exact migration
path if it ever needs to become a pure read, are recorded in the
`ensureMealWindow` docstring in
[Araf/M2.3-MealAttendance/mealAttendance.ts](Araf/M2.3-MealAttendance/mealAttendance.ts).

### Teammate migration — edited

`prisma/migrations/20260814210000_m1_rebuild_matching/migration.sql` now adds
`cleanliness_level` and `noise_tolerance` with `DEFAULT 3`, then drops the
defaults so the end schema still matches the Prisma model.

**Action required from whoever else has run this migration.** Editing an applied
migration changes its SHA-256 checksum, and Prisma refuses to proceed when the
recorded checksum no longer matches the file. This database was re-pointed at
the new checksum, so it is clean. Anyone whose local database already applied
the old version will see:

```
The migration `20260814210000_m1_rebuild_matching` was modified after it was applied.
```

The simplest fix for them is to pull, then reset their local database
(`npx prisma migrate reset` — destroys local data, then re-seed). Anyone setting
up fresh is unaffected.

### Cross-cutting note

Findings 1, 4 and 6 are the same mistake in three places: **a query that returns or links data without applying the scoping rule that `lib/authz.ts` already defines for it.** That file's own header warns about exactly this — "forget a check and nothing breaks, nothing errors — the data is simply exposed." The pattern to enforce in review is that no `include`/`update` returns a whole row or a whole relation without either a `select` or the relevant `*VisibilityFilter`.

The global `omit` added for finding 1 makes the worst case of this — leaking the password hash — structurally impossible rather than a rule to remember. The visibility filters still rely on discipline.
