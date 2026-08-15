-- M2.4 Shared House Map & Neighbourhood Knowledge Base — Miftelul Mehebub.
--
-- Adds the household's own map of the neighbourhood: pinned places, the house's
-- notes on them, freshness confirmations, and the optional time-bound deals
-- layer. Plus two small infrastructure tables that keep the paid map providers
-- inside their free quota.

-- ── Vocabulary ──────────────────────────────────────────────────────────────

CREATE TYPE "BookmarkCategory" AS ENUM (
  'KACHA_BAZAR', 'GROCERY', 'BUTCHER', 'FISH', 'PHARMACY', 'BARBER', 'TAILOR',
  'LAUNDRY', 'HARDWARE', 'ACCESSORIES', 'GAS_CYLINDER', 'WATER', 'RESTAURANT',
  'ATM', 'TRANSPORT', 'SERVICE', 'OTHER'
);

CREATE TYPE "Visibility" AS ENUM ('HOUSE', 'PRIVATE');

CREATE TYPE "Verdict" AS ENUM ('STILL_THERE', 'GONE');

CREATE TYPE "DealStatus" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'RETIRED', 'ARCHIVED');

-- ── House origin point ──────────────────────────────────────────────────────
--
-- Distance and routing measure from one point per house. The coordinates
-- themselves already exist on `houses`; what was missing is the record that a
-- human deliberately placed the pin. Coordinates copied off a listing point at
-- the building's street, not necessarily its gate, so "we have a lat/lng" is
-- not the same claim as "the pin is right".

ALTER TABLE "houses" ADD COLUMN "map_pin_set_at" TIMESTAMP(3);
ALTER TABLE "houses" ADD COLUMN "map_pin_set_by" TEXT;

ALTER TABLE "houses"
  ADD CONSTRAINT "houses_map_pin_set_by_fkey"
  FOREIGN KEY ("map_pin_set_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the pin from the Module 1 listing the house came from, so the admin is
-- confirming a suggestion rather than hunting for their own front door on a
-- blank map. map_pin_set_at stays NULL: this is the suggestion, not the
-- confirmation.
UPDATE "houses" h
SET "latitude" = sub.latitude, "longitude" = sub.longitude
FROM (
  SELECT DISTINCT ON (l."house_id")
         l."house_id", l."latitude", l."longitude"
  FROM "listings" l
  WHERE l."house_id" IS NOT NULL
    AND l."latitude" IS NOT NULL
    AND l."longitude" IS NOT NULL
  ORDER BY l."house_id", l."created_at" ASC
) sub
WHERE h."id" = sub."house_id"
  AND (h."latitude" IS NULL OR h."longitude" IS NULL);

-- ── Residency end ───────────────────────────────────────────────────────────
--
-- A departing resident's PRIVATE bookmarks are purged 14 days after they go.
-- The LEFT status alone cannot answer "14 days after what".

ALTER TABLE "house_members" ADD COLUMN "left_at" TIMESTAMP(3);

-- Existing LEFT rows have no recorded departure date. Backfilling them with
-- now() would start a fresh 14-day clock for people who left months ago, which
-- is the safer direction: it purges nothing retroactively.
UPDATE "house_members" SET "left_at" = CURRENT_TIMESTAMP WHERE "status" = 'LEFT';

-- ── Places ──────────────────────────────────────────────────────────────────

CREATE TABLE "bookmarks" (
  "id" TEXT NOT NULL,
  "house_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "BookmarkCategory" NOT NULL,
  "visibility" "Visibility" NOT NULL DEFAULT 'HOUSE',
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "external_place_id" TEXT,
  "address" TEXT,
  "is_online" BOOLEAN NOT NULL DEFAULT false,
  "online_url" TEXT,
  "last_confirmed_at" TIMESTAMP(3),
  "added_by" TEXT,
  "added_by_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- Half a coordinate is not a location, and a bookmark carrying only a latitude
-- would rank at a nonsense distance rather than being skipped.
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_coordinate_pair"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));

ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_coordinate_range"
  CHECK (
    "latitude" IS NULL
    OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
  );

CREATE INDEX "bookmarks_house_id_category_visibility_idx"
  ON "bookmarks"("house_id", "category", "visibility");

CREATE INDEX "bookmarks_house_id_deleted_at_idx"
  ON "bookmarks"("house_id", "deleted_at");

-- The hard half of deduplication: one house cannot pin the same provider place
-- twice. Postgres treats NULLs as distinct, so the many bookmarks typed in by
-- hand — with no provider id at all — are unaffected by this. Soft-deleted rows
-- are deliberately still covered: otherwise the house could re-add a place it
-- had removed, and restoring the original within its 30-day window would then
-- collide with the copy.
CREATE UNIQUE INDEX "bookmarks_house_id_external_place_id_key"
  ON "bookmarks"("house_id", "external_place_id");

ALTER TABLE "bookmarks"
  ADD CONSTRAINT "bookmarks_house_id_fkey"
  FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull, not Cascade: a HOUSE bookmark belongs to the household, so deleting
-- the resident who happened to add it must not take the pin — or the notes
-- everyone else wrote on it — off the map.
ALTER TABLE "bookmarks"
  ADD CONSTRAINT "bookmarks_added_by_fkey"
  FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── The house's notes ───────────────────────────────────────────────────────

CREATE TABLE "bookmark_notes" (
  "id" TEXT NOT NULL,
  "bookmark_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "author_id" TEXT,
  "author_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "bookmark_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bookmark_notes_bookmark_id_created_at_idx"
  ON "bookmark_notes"("bookmark_id", "created_at" DESC);

ALTER TABLE "bookmark_notes"
  ADD CONSTRAINT "bookmark_notes_bookmark_id_fkey"
  FOREIGN KEY ("bookmark_id") REFERENCES "bookmarks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bookmark_notes"
  ADD CONSTRAINT "bookmark_notes_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Freshness ───────────────────────────────────────────────────────────────

CREATE TABLE "confirmations" (
  "id" TEXT NOT NULL,
  "bookmark_id" TEXT NOT NULL,
  "resident_id" TEXT NOT NULL,
  "verdict" "Verdict" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "confirmations_pkey" PRIMARY KEY ("id")
);

-- Serves both reads the feature makes of this log: the 24-hour rate limit
-- (one resident, one bookmark, most recent row) and the distinct-resident
-- count behind "confirmed by 4 residents".
CREATE INDEX "confirmations_bookmark_id_resident_id_created_at_idx"
  ON "confirmations"("bookmark_id", "resident_id", "created_at");

ALTER TABLE "confirmations"
  ADD CONSTRAINT "confirmations_bookmark_id_fkey"
  FOREIGN KEY ("bookmark_id") REFERENCES "bookmarks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "confirmations"
  ADD CONSTRAINT "confirmations_resident_id_fkey"
  FOREIGN KEY ("resident_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Time-bound deals ────────────────────────────────────────────────────────

CREATE TABLE "deals" (
  "id" TEXT NOT NULL,
  "bookmark_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "discount_note" TEXT,
  "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_until" TIMESTAMP(3),
  "cached_status" "DealStatus" NOT NULL DEFAULT 'ACTIVE',
  "posted_by" TEXT,
  "posted_by_name" TEXT NOT NULL,
  "last_confirmed_at" TIMESTAMP(3),
  "retired_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "deals" ADD CONSTRAINT "deals_valid_window"
  CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from");

CREATE INDEX "deals_bookmark_id_valid_until_idx" ON "deals"("bookmark_id", "valid_until");

-- cached_status exists to be filtered in SQL and for nothing else — every
-- screen derives the status it shows from the timestamps above. This index is
-- what makes the column worth writing.
CREATE INDEX "deals_cached_status_valid_until_idx" ON "deals"("cached_status", "valid_until");

ALTER TABLE "deals"
  ADD CONSTRAINT "deals_bookmark_id_fkey"
  FOREIGN KEY ("bookmark_id") REFERENCES "bookmarks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deals"
  ADD CONSTRAINT "deals_posted_by_fkey"
  FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "deal_reports" (
  "id" TEXT NOT NULL,
  "deal_id" TEXT NOT NULL,
  "reported_by" TEXT NOT NULL,
  "verdict" "Verdict" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "deal_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deal_reports_deal_id_reported_by_created_at_idx"
  ON "deal_reports"("deal_id", "reported_by", "created_at");

ALTER TABLE "deal_reports"
  ADD CONSTRAINT "deal_reports_deal_id_fkey"
  FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_reports"
  ADD CONSTRAINT "deal_reports_reported_by_fkey"
  FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Search ──────────────────────────────────────────────────────────────────
--
-- Trigram, not full-text. Residents write in Bangla, English and Banglish, in
-- one sentence and often in one word — "Karwan Bazar er fish er dokan". A
-- to_tsvector('english') index would stem "dokan" as if it were English,
-- discard nothing useful from Bangla because it has no Bangla stopword list,
-- and match none of the three spellings of "bazar" against each other.
--
-- pg_trgm compares three-character sequences and has no language model at all,
-- which is exactly the property wanted here: it is equally indifferent to all
-- three languages and tolerates the spelling variation that comes with
-- transliteration. Note there is no text search configuration to get wrong —
-- 'simple' or otherwise — because trigram matching never builds a tsvector.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "bookmarks_name_trgm_idx" ON "bookmarks" USING gin ("name" gin_trgm_ops);

CREATE INDEX "bookmark_notes_body_trgm_idx" ON "bookmark_notes" USING gin ("body" gin_trgm_ops);

-- ── Provider quota plumbing ─────────────────────────────────────────────────

CREATE TABLE "map_api_cache" (
  "key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "map_api_cache_pkey" PRIMARY KEY ("key")
);

-- Swept by the nightly cron; also the index a lookup uses to decide staleness.
CREATE INDEX "map_api_cache_expires_at_idx" ON "map_api_cache"("expires_at");

CREATE TABLE "map_api_calls" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "map_api_calls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "map_api_calls_user_id_created_at_idx" ON "map_api_calls"("user_id", "created_at");
