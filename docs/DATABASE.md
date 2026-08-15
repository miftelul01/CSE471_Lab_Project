# Working with the database

We share **one** Neon database between all three of us. That makes a few habits
non-optional.

## Never run `prisma db push` against the shared database

`db push` makes the database match your `schema.prisma` **without recording a
migration**, and it will happily drop tables to do it.

This has already cost us a day twice:

- Someone pushed an in-progress M2.2 redesign. It dropped `menu_proposals`,
  `menu_proposal_items` and `menu_votes`, and renamed `meals.menu_proposal_id`
  to `day_proposal_id`. Everyone else's `/menu` and `/meals` pages started
  returning HTTP 500, and nothing in the migration history explained why —
  the history still said those tables existed.
- A migration that had never been applied left `users.match_rating_penalty`
  missing, which made **every** user query throw. The whole app was down,
  including login.

The recovery for the first one is
`prisma/migrations/20260815140000_restore_menu_proposals/migration.sql`. Read
its header if you want the full story.

## Do this instead

```bash
# 1. Edit prisma/schema.prisma
# 2. Generate a migration AND apply it to your own database
npm run db:migrate -- --name what_you_changed

# 3. Commit the generated folder in prisma/migrations/ with your code
# 4. Everyone else picks it up with:
npm run db:deploy
```

`db:deploy` only applies migrations that have not run yet. It never drops
anything it was not told to drop.

## Writing a migration that will not fail on someone else's database

Your database is probably emptier than everyone else's. Two rules cover most of
what has bitten us:

**Adding a `NOT NULL` column?** Give it a default, then drop the default if the
model does not declare one:

```sql
ALTER TABLE "preferences"
  ADD COLUMN "noise_tolerance" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "preferences"
  ALTER COLUMN "noise_tolerance" DROP DEFAULT;
```

Without the default, Postgres refuses the moment the table has a single row —
which is why that migration applied fine locally and broke the shared database.

**Replacing someone else's design?** Add alongside it and delete in a separate,
deliberate step once their code is gone. Two nullable columns are cheap; a
dropped table with their data in it is not.

## Things Prisma does not know about

Some objects are created in raw SQL inside migrations, so they are invisible to
`schema.prisma`. `prisma migrate diff` will offer to drop them — **don't let
it.**

| Object | Where | Why |
|---|---|---|
| `bookmarks_name_trgm_idx`, `bookmark_notes_body_trgm_idx` | `20260815120000_neighborhood_map` | pg_trgm GIN indexes; Prisma cannot express `gin_trgm_ops` |
| `meal_attendance_recalc_headcount` | `20260807203141_domain_rules` | Keeps `meals.headcount` in step with the toggles |
| `disputes_enforce_transition` | `20260807203141_domain_rules` | Mess Court state machine |
| `expense_shares_sync_settled_at` | `20260807203141_domain_rules` | Stamps `settled_at` |
| `payments_apply_to_ledger` | `20260807203141_domain_rules` | Flips a share to PAID on a gateway settlement |
| `menu_proposals_one_approved_per_week` | `20260807203141_domain_rules` | Partial unique index; one winning menu per week |

## If you edit a migration that is already applied

Prisma stores a SHA-256 of each migration file and refuses to continue when the
file no longer matches. If you must edit one (we did, to fix the `NOT NULL`
bug), everyone who already applied it has to reset their local database:

```bash
npx prisma migrate reset   # destroys local data
npm run db:seed
```

Anyone setting up fresh is unaffected.
