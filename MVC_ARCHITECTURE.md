# Smart Mess & Property Management System — MVC Architecture Map

> **CSE471 · BRAC University · Summer 2026**
> This document maps the entire project file structure into the **Model–View–Controller** pattern and lists each team member's file contributions for quick navigation.

---

## Team Members & Feature Ownership

| Member | Student ID | Modules |
|---|---|---|
| **Miftelul Mehebub** | 23101222 | M1.1 Listings · M2.1 Shared Wallet · M2.4 Neighborhood Map · M3.1 Maintenance · M3.2 Payments |
| **Mahia Tanzin** | 23101410 | M1.2 Roommate Matching · M2.2 Menu Voting · M3.3 Maps (Listing Discovery) · M3.4 Chore Rotation |
| **Md. Mahidul Alam Araf** | 22301105 | M1.3 Guest Log · M2.3 Meal Attendance · M3.5 Mess Court · M3.6 Calendar |

---

## MVC Layer Overview (Next.js App Router Mapping)

```
Next.js App Router does not separate MVC into literal folders,
but the layers map cleanly as follows:

+-----------------------------------------------------------------------+
|  MODEL      ->  prisma/schema.prisma  +  lib/*.ts                     |
|                 (Database schema, business logic, data access)        |
+-----------------------------------------------------------------------+
|  VIEW       ->  app/**/page.tsx  +  components/  +  *.tsx UI files    |
|                 (React Server Components, UI components, forms)       |
+-----------------------------------------------------------------------+
|  CONTROLLER ->  app/api/**/route.ts  +  lib/api.ts                   |
|                 (REST API handlers, request/response logic)           |
+-----------------------------------------------------------------------+
```

---

## Repo Cleanup (Done — 2026-08-19)

The two redundant duplicate folders have been **deleted**. Only the canonical root-level project remains.

| Folder | Action | Reason |
|---|---|---|
| *(root)* `app/`, `lib/`, `components/`, `prisma/` | KEPT — canonical | Most recent: 19 lib files, 9 migrations, largest file sizes |
| `CSE471_Lab_Project/` | DELETED | Older copy — authz.ts 14KB vs 24KB; schema 39KB vs 58KB |
| `Project GitHub Repo/` | DELETED | Older copy — same structure but lagging behind root |
| `Araf/` (root level) | KEPT — member drafts | Araf's working sandbox, useful for reference |

---

## MODEL Layer

> Business logic, data schema, and shared service utilities.

### `prisma/` — Database Schema & Migrations

| File | Description | Owner |
|---|---|---|
| `prisma/schema.prisma` | **Main Prisma schema** — 30 models, 21 enums | All (shared) |
| `prisma/seed.ts` | Database seed script for development data | All (shared) |
| `prisma/migrations/20260807203059_init/` | Initial DB schema migration | All (shared) |
| `prisma/migrations/20260807203141_domain_rules/` | DB state machines, triggers, check constraints | All (shared) |
| `prisma/migrations/20260808051429_roommate_posts_and_moderation/` | Roommate posts + moderation tables | Mahia |
| `prisma/migrations/20260813185953_wallet_payer_and_share_audit/` | Wallet payer + audit trail | Miftelul |
| `prisma/migrations/20260813190740_wallet_payer_optional/` | Wallet payer optional field | Miftelul |
| `prisma/migrations/20260814130000_expense_meal_link/` | Expense linked to meal | Miftelul / Araf |
| `prisma/migrations/20260814210000_m1_rebuild_matching/` | Roommate matching rebuild | Mahia |
| `prisma/migrations/20260815000000_partial_unique_roommate_match_requests/` | Unique constraint for match requests | Mahia |
| `prisma/migrations/20260815120000_neighborhood_map/` | Neighborhood map tables | Miftelul |

---

### `lib/` — Business Logic & Service Layer

| File | Description | Owner |
|---|---|---|
| `lib/prisma.ts` | Shared PrismaClient singleton — **always import this** | All (shared) |
| `lib/auth.ts` | requireUser() · requireRole() · getActiveHouseId() | All (shared) |
| `lib/authz.ts` | **All access-control rules** — Filter() + assert() functions | All (shared) |
| `lib/api.ts` | withUser() · withAdmin() · ok() · badRequest() helpers | All (shared) |
| `lib/features.ts` | Feature ownership registry — flip status to "done" here | All (shared) |
| `lib/navigation.ts` | Sidebar navigation config for all roles | All (shared) |
| `lib/settings.ts` | Client-side settings utilities | All (shared) |
| `lib/settings.server.ts` | Server-side settings fetch | All (shared) |
| `lib/admin.ts` | Admin-specific helper utilities | All (shared) |
| `lib/houses.ts` | House join / management logic | All (shared) |
| `lib/joinRequests.ts` | Join request utilities | All (shared) |
| `lib/moveIn.ts` | Move-in flow utilities | All (shared) |
| `lib/listings.ts` | Listing query helpers — M1.1 | **Miftelul** |
| `lib/wallet.ts` | Shared wallet & expense logic — M2.1 | **Miftelul** |
| `lib/neighborhood.ts` | Client-side neighborhood map logic — M2.4 | **Miftelul** |
| `lib/neighborhood.server.ts` | Server-side neighborhood queries — M2.4 | **Miftelul** |
| `lib/menu.ts` | Menu proposal & voting logic — M2.2 | **Mahia** |
| `lib/matching.ts` | Roommate scoring + Gale-Shapley algorithm — M1.2 | **Mahia** |
| `lib/mapProviders.ts` | Map provider integrations — M3.3 | **Mahia** |

---

## VIEW Layer

> React pages and reusable UI components.

### `components/` — Shared UI Components

| File | Description | Owner |
|---|---|---|
| `components/Sidebar.tsx` | User-facing navigation sidebar | All (shared) |
| `components/AdminSidebar.tsx` | Admin panel sidebar | All (shared) |
| `components/TopBar.tsx` | Top navigation bar | All (shared) |
| `components/SignOutButton.tsx` | Sign-out button component | All (shared) |
| `components/Icon.tsx` | Icon wrapper component | All (shared) |
| `components/ui.tsx` | Shared UI primitives (buttons, cards, badges) | All (shared) |
| `components/FeatureStub.tsx` | Placeholder for unbuilt features | All (shared) |

---

### `app/` — Pages (Next.js App Router)

#### Root & Auth Layout

| File | Description | Owner |
|---|---|---|
| `app/layout.tsx` | Root layout — fonts, providers, session wrapper | All (shared) |
| `app/globals.css` | Global CSS / Tailwind base styles | All (shared) |
| `app/page.tsx` | Landing/home page with feature status board | All (shared) |
| `app/login/page.tsx` | Login page | All (shared) |
| `app/login/LoginForm.tsx` | Login + registration form component | All (shared) |

---

#### `app/(app)/` — Authenticated User Pages

| Page | Key Files in Folder | Description | Owner |
|---|---|---|---|
| **Dashboard** | page.tsx · FlatHeadDashboard.tsx · LandlordDashboard.tsx · MemberDashboard.tsx · shared.tsx | Role-based home dashboard | All (shared) |
| **Profile** | page.tsx · ProfileForm.tsx · VerificationCard.tsx | User profile edit & verification | All (shared) |
| **Houses** | page.tsx · HouseManager.tsx · ProfileComplaintButton.tsx | House overview & management | All (shared) |
| **Join Requests** | page.tsx · JoinRequestList.tsx | House join request management | All (shared) |
| **Messages** | page.tsx · [userId]/page.tsx | In-app messaging | All (shared) |
| **Listings** (M1.1) | page.tsx · ListingForm.tsx · ListingFilters.tsx · [id]/ · new/ | Property listing browse & create | **Miftelul** |
| **Properties** (M1.1) | page.tsx · PropertyTable.tsx | Landlord property management table | **Miftelul** |
| **Wallet** (M2.1) | page.tsx · AddExpenseForm.tsx · ExpenseLedger.tsx | Shared wallet & expense ledger | **Miftelul** |
| **Neighborhood** (M2.4) | page.tsx · AddBookmarkForm.tsx · BookmarkCard.tsx · DealFeed.tsx · HouseMap.tsx · HousePinSetup.tsx · MapView.tsx · NeedFinder.tsx · PlaceSearchInput.tsx · RemovedPlaces.tsx · deals/ · map/ · places/ | House neighborhood map & bookmarks | **Miftelul** |
| **Maintenance** (M3.1) | page.tsx | Maintenance ticket system | **Miftelul** |
| **Payments** (M3.2) | page.tsx | Payment integration page | **Miftelul** |
| **Matches** (M1.2) | page.tsx · MatchList.tsx · people/ | Roommate match suggestions | **Mahia** |
| **Roommates** (M1.2) | page.tsx · RoommateActions.tsx · [id]/ · new/ | Roommate posts & browse | **Mahia** |
| **Favorites** (M1.2) | page.tsx · FavoriteList.tsx | Saved listings & profiles | **Mahia** |
| **Preferences** (M1.2) | page.tsx · PreferencesForm.tsx | Lifestyle preferences setup | **Mahia** |
| **Menu** (M2.2) | page.tsx · MenuBoard.tsx · new/ | Weekly menu proposal & voting | **Mahia** |
| **Map** (M3.3) | page.tsx | Listing discovery map (Google Maps) | **Mahia** |
| **Chores** (M3.4) | page.tsx | Automated chore rotation | **Mahia** |
| **Guests** (M1.3) | page.tsx | Guest check-in/out log | **Araf** |
| **Meals** (M2.3) | page.tsx | Meal attendance tracker | **Araf** |
| **Mess Court** (M3.5) | page.tsx | Conflict resolution state machine | **Araf** |
| **Calendar** (M3.6) | page.tsx | Google Calendar integration | **Araf** |
| **Layout** | layout.tsx | Authenticated shell (Sidebar + TopBar) | All (shared) |

---

#### `app/(admin)/` — Admin Panel Pages

| Page | Key Files in Folder | Description | Owner |
|---|---|---|---|
| **Admin Dashboard** | admin/page.tsx | Platform admin home | All (shared) |
| **Users** | admin/users/ · page.tsx · UserRoleTable.tsx | User role management | All (shared) |
| **Disputes** | admin/disputes/ · page.tsx · EscalatedDisputes.tsx | Escalated dispute review | All (shared) |
| **Verification** | admin/verification/ · page.tsx · VerificationRequestsTable.tsx | ID verification queue | All (shared) |
| **Houses** | admin/houses/page.tsx | House administration | All (shared) |
| **Listings** | admin/listings/page.tsx | Listing moderation | All (shared) |
| **Roommate Posts** | admin/roommate-posts/page.tsx | Post moderation | All (shared) |
| **Profile Complaints** | admin/profile-complaints/page.tsx | Profile complaint review | All (shared) |
| **Reports** | admin/reports/page.tsx | Platform reports | All (shared) |
| **Settings** | admin/settings/page.tsx | Platform-wide settings | All (shared) |
| **Layout** | layout.tsx | Admin shell (AdminSidebar) | All (shared) |

---

#### Member Draft Files in `Araf/`

> Working draft components used during development. Integrated versions live in the main `app/` directory above.

| File | Description | Status |
|---|---|---|
| `Araf/M1.3-Guests/GuestCheckInForm.tsx` | Guest check-in form draft | Draft — reference only |
| `Araf/M1.3-Guests/GuestLogTable.tsx` | Guest log table draft | Draft — reference only |
| `Araf/M2.3-MealAttendance/MealAttendanceBoard.tsx` | Meal attendance board draft | Draft — reference only |
| `Araf/M2.3-MealAttendance/mealAttendance.ts` | Meal attendance logic draft | Draft — reference only |

---

## CONTROLLER Layer

> API Route Handlers — REST endpoints that handle HTTP requests, call service logic, and return JSON.

### Auth & Common API Routes

| HTTP Route | File | Description | Owner |
|---|---|---|---|
| POST /api/auth/register | `app/api/auth/register/route.ts` | User registration | All (shared) |
| GET/POST /api/auth/[...nextauth] | `app/api/auth/[...nextauth]/route.ts` | NextAuth handler | All (shared) |
| GET/PUT /api/profile | `app/api/profile/route.ts` | Profile fetch & update | All (shared) |
| GET/POST /api/houses | `app/api/houses/route.ts` | House list & create | All (shared) |
| POST /api/houses/join | `app/api/houses/join/route.ts` | Join house request | All (shared) |
| GET/PUT /api/houses/flat-head | `app/api/houses/flat-head/route.ts` | Flat head operations | All (shared) |
| GET/POST /api/join-requests | `app/api/join-requests/route.ts` | Join request management | All (shared) |
| GET/POST /api/messages | `app/api/messages/route.ts` | In-app messaging | All (shared) |
| GET/PUT /api/verification | `app/api/verification/route.ts` | ID verification submit | All (shared) |
| GET/POST /api/blocks | `app/api/blocks/route.ts` | User blocking | All (shared) |
| GET/POST /api/reports | `app/api/reports/route.ts` | User reports | All (shared) |
| GET /api/cron | `app/api/cron/route.ts` | Scheduled background jobs | All (shared) |

---

### Feature-Specific API Routes

| HTTP Route | File | Description | Owner |
|---|---|---|---|
| GET/POST /api/listings | `app/api/listings/route.ts` | Listing CRUD | **Miftelul** |
| GET/PUT/DEL /api/listings/[id] | `app/api/listings/[id]/route.ts` | Single listing ops | **Miftelul** |
| GET/POST /api/expenses | `app/api/expenses/route.ts` | Shared expenses | **Miftelul** |
| GET/PUT/DEL /api/expenses/[id] | `app/api/expenses/[id]/route.ts` | Single expense ops | **Miftelul** |
| GET/* /api/neighborhood/* | `app/api/neighborhood/` bookmarks, deals, directions, house-pin, places, search, tiles | Neighborhood map endpoints | **Miftelul** |
| GET/POST /api/maintenance | `app/api/maintenance/route.ts` | Maintenance tickets | **Miftelul** |
| GET/POST /api/payments | `app/api/payments/route.ts` | Payment processing | **Miftelul** |
| POST /api/payments/webhook | `app/api/payments/webhook/route.ts` | Payment webhook handler | **Miftelul** |
| GET/PUT /api/preferences | `app/api/preferences/route.ts` | User lifestyle preferences | **Mahia** |
| GET/POST /api/favorites | `app/api/favorites/route.ts` | Saved favorites | **Mahia** |
| GET/POST /api/matches | `app/api/matches/route.ts` | Match suggestions | **Mahia** |
| GET /api/matches/people | `app/api/matches/people/route.ts` | People to match with | **Mahia** |
| GET/POST /api/matches/profile-complaints | `app/api/matches/profile-complaints/route.ts` | Profile complaints | **Mahia** |
| GET/POST /api/roommate-posts | `app/api/roommate-posts/route.ts` | Roommate post CRUD | **Mahia** |
| GET/PUT/DEL /api/roommate-posts/[id] | `app/api/roommate-posts/[id]/route.ts` | Single post ops | **Mahia** |
| GET/POST /api/menu-proposals | `app/api/menu-proposals/route.ts` | Menu proposals & votes | **Mahia** |
| GET/PUT /api/menu-proposals/[id] | `app/api/menu-proposals/[id]/route.ts` | Single proposal ops | **Mahia** |
| GET/POST /api/chores | `app/api/chores/route.ts` | Chore list & creation | **Mahia** |
| GET/PATCH /api/chores/[choreId] | `app/api/chores/[choreId]/route.ts` | Admin edits, due-date suggestion | **Mahia** |
| * /api/chores/assignments/[assignmentId]/* | `app/api/chores/assignments/` complete, reschedule, calendar-check, split, subtasks, ratings | Per-assignment actions | **Mahia** |
| GET/POST/DEL /api/chores/absences | `app/api/chores/absences/` | Absence handling | **Mahia** |
| GET/POST/PATCH /api/chores/swaps | `app/api/chores/swaps/` | Direct chore swaps | **Mahia** |
| GET/POST/PATCH /api/chores/marketplace | `app/api/chores/marketplace/` | Chore marketplace | **Mahia** |
| PATCH /api/chores/settings | `app/api/chores/settings/route.ts` | Quality-rating toggle | **Mahia** |
| GET /api/cron/chores | `app/api/cron/chores/route.ts` | Scheduled rotation job (replaces the old `/api/chores/rotate` stub, since removed — Vercel Cron sends GET, not POST) | **Mahia** |
| GET/POST /api/google/connect[/callback], GET /api/google/status, POST /api/google/disconnect | `app/api/google/` | Google Tasks/Calendar OAuth | **Mahia** |
| GET/POST /api/guests | `app/api/guests/route.ts` | Guest check-in/out log | **Araf** |
| GET/POST /api/meals | `app/api/meals/route.ts` | Meal attendance toggle | **Araf** |
| GET /api/calendar | `app/api/calendar/route.ts` | Calendar events | **Araf** |
| GET/POST /api/disputes | `app/api/disputes/route.ts` | Mess Court disputes | **Araf** |
| POST /api/disputes/escalate | `app/api/disputes/escalate/route.ts` | Escalate dispute | **Araf** |

---

### Admin API Routes (`app/api/admin/`)

| HTTP Route | File | Description | Owner |
|---|---|---|---|
| GET/PUT /api/admin/users | `app/api/admin/users/route.ts` | User role management | All (shared) |
| GET/PUT /api/admin/disputes | `app/api/admin/disputes/route.ts` | Admin dispute resolution | All (shared) |
| POST /api/admin/disputes/uphold | `app/api/admin/disputes/uphold/route.ts` | Uphold or dismiss dispute | All (shared) |
| GET/PUT /api/admin/reports | `app/api/admin/reports/route.ts` | Platform reports | All (shared) |
| GET/PUT /api/admin/verification | `app/api/admin/verification/route.ts` | Approve/reject ID verification | All (shared) |
| POST /api/admin/moderate | `app/api/admin/moderate/route.ts` | Content moderation | All (shared) |
| GET/PUT /api/admin/settings | `app/api/admin/settings/route.ts` | Platform settings | All (shared) |

---

## Config / Infrastructure Files

| File | Description |
|---|---|
| `auth.ts` | NextAuth v5 config — providers, session, callbacks |
| `middleware.ts` | Route protection — redirects signed-out visitors |
| `next.config.js` | Next.js configuration |
| `tailwind.config.ts` | Tailwind CSS configuration |
| `tsconfig.json` | TypeScript compiler config |
| `package.json` | NPM dependencies & scripts |
| `postcss.config.js` | PostCSS config |
| `vercel.json` | Vercel deployment settings |
| `.gitignore` | Git ignore rules |
| `.vercelignore` | Vercel ignore rules |
| `README.md` | Project setup & developer conventions |
| `Smart_Mess_Project_Requirements.md` | Original functional requirements document |

---

## Quick Reference: Who Built What

### Miftelul Mehebub (23101222)

| Layer | Files |
|---|---|
| Model | `lib/listings.ts` · `lib/wallet.ts` · `lib/neighborhood.ts` · `lib/neighborhood.server.ts` · migrations: wallet, expense-meal-link, neighborhood-map |
| View | `app/(app)/listings/` · `app/(app)/properties/` · `app/(app)/wallet/` · `app/(app)/neighborhood/` · `app/(app)/maintenance/` · `app/(app)/payments/` |
| Controller | `app/api/listings/` · `app/api/expenses/` · `app/api/neighborhood/` · `app/api/maintenance/` · `app/api/payments/` |

### Mahia Tanzin (23101410)

| Layer | Files |
|---|---|
| Model | `lib/matching.ts` · `lib/menu.ts` · `lib/mapProviders.ts` · `lib/joinRequests.ts` · migrations: roommate-posts-moderation, m1-rebuild-matching, partial-unique-roommate |
| View | `app/(app)/matches/` · `app/(app)/roommates/` · `app/(app)/favorites/` · `app/(app)/preferences/` · `app/(app)/menu/` · `app/(app)/map/` · `app/(app)/chores/` |
| Controller | `app/api/matches/` · `app/api/roommate-posts/` · `app/api/favorites/` · `app/api/preferences/` · `app/api/menu-proposals/` · `app/api/chores/` |

### Md. Mahidul Alam Araf (22301105)

| Layer | Files |
|---|---|
| Model | `Araf/M1.3-Guests/` · `Araf/M2.3-MealAttendance/mealAttendance.ts` (draft workspace) |
| View | `app/(app)/guests/` · `app/(app)/meals/` · `app/(app)/mess-court/` · `app/(app)/calendar/` |
| Controller | `app/api/guests/` · `app/api/meals/` · `app/api/disputes/` · `app/api/calendar/` |

### All Members — Shared / Common Workflows

| Layer | Files |
|---|---|
| Model | `prisma/schema.prisma` · `lib/prisma.ts` · `lib/auth.ts` · `lib/authz.ts` · `lib/api.ts` · `lib/features.ts` · `lib/navigation.ts` · `lib/houses.ts` · `lib/admin.ts` · `lib/settings.ts` |
| View | `components/` (all 7 files) · `app/layout.tsx` · `app/login/` · `app/(app)/dashboard/` · `app/(app)/profile/` · `app/(app)/houses/` · `app/(admin)/` (entire admin section) |
| Controller | `app/api/auth/` · `app/api/profile/` · `app/api/houses/` · `app/api/join-requests/` · `app/api/admin/` · `app/api/verification/` · `app/api/reports/` · `app/api/blocks/` |

---

## Full Directory Tree (Canonical Root)

```
Summer2026 Project/                    <- ROOT (canonical, most up-to-date)
|
+-- auth.ts                            # NextAuth config
+-- middleware.ts                      # Route protection
+-- next.config.js
+-- tailwind.config.ts
+-- tsconfig.json
+-- package.json
+-- vercel.json
+-- README.md
+-- MVC_ARCHITECTURE.md                <- THIS FILE
+-- Smart_Mess_Project_Requirements.md
+-- .gitignore / .vercelignore / .devlog.txt
|
+-- prisma/                            === MODEL (Schema Layer)
|   +-- schema.prisma                  # 30 models, 21 enums
|   +-- seed.ts                        # Dev data seed
|   +-- migrations/
|       +-- 20260807203059_init/
|       +-- 20260807203141_domain_rules/
|       +-- 20260808051429_roommate_posts_and_moderation/
|       +-- 20260813185953_wallet_payer_and_share_audit/
|       +-- 20260813190740_wallet_payer_optional/
|       +-- 20260814130000_expense_meal_link/
|       +-- 20260814210000_m1_rebuild_matching/
|       +-- 20260815000000_partial_unique_roommate_match_requests/
|       +-- 20260815120000_neighborhood_map/
|
+-- lib/                               === MODEL (Business Logic Layer)
|   +-- prisma.ts                      # DB client singleton
|   +-- auth.ts                        # requireUser / requireRole
|   +-- authz.ts                       # ALL access-control rules
|   +-- api.ts                         # withUser / ok / badRequest
|   +-- features.ts                    # Feature ownership registry
|   +-- navigation.ts                  # Sidebar nav config
|   +-- admin.ts
|   +-- houses.ts
|   +-- joinRequests.ts
|   +-- settings.ts
|   +-- settings.server.ts
|   +-- moveIn.ts
|   +-- listings.ts                    # [Miftelul] M1.1
|   +-- wallet.ts                      # [Miftelul] M2.1
|   +-- neighborhood.ts                # [Miftelul] M2.4
|   +-- neighborhood.server.ts         # [Miftelul] M2.4
|   +-- menu.ts                        # [Mahia]    M2.2
|   +-- matching.ts                    # [Mahia]    M1.2
|   +-- mapProviders.ts                # [Mahia]    M3.3
|
+-- components/                        === VIEW (Shared UI Components)
|   +-- Sidebar.tsx
|   +-- AdminSidebar.tsx
|   +-- TopBar.tsx
|   +-- SignOutButton.tsx
|   +-- Icon.tsx
|   +-- ui.tsx
|   +-- FeatureStub.tsx
|
+-- app/                               === VIEW + CONTROLLER
|   +-- layout.tsx                     # Root layout
|   +-- globals.css
|   +-- page.tsx                       # Landing page
|   |
|   +-- login/                         === VIEW (Auth)
|   |   +-- page.tsx
|   |   +-- LoginForm.tsx
|   |
|   +-- (app)/                         === VIEW (Authenticated Pages)
|   |   +-- layout.tsx
|   |   +-- dashboard/                 page.tsx + role dashboards [shared]
|   |   +-- profile/                   page.tsx + ProfileForm + VerificationCard [shared]
|   |   +-- houses/                    page.tsx + HouseManager [shared]
|   |   +-- join-requests/             page.tsx + JoinRequestList [shared]
|   |   +-- messages/                  page.tsx [shared]
|   |   +-- listings/                  [Miftelul] page + ListingForm + ListingFilters + [id]/ + new/
|   |   +-- properties/                [Miftelul] page + PropertyTable
|   |   +-- wallet/                    [Miftelul] page + AddExpenseForm + ExpenseLedger
|   |   +-- neighborhood/              [Miftelul] page + 9 components + deals/ + map/ + places/
|   |   +-- maintenance/               [Miftelul] page.tsx
|   |   +-- payments/                  [Miftelul] page.tsx
|   |   +-- matches/                   [Mahia]    page + MatchList + people/
|   |   +-- roommates/                 [Mahia]    page + RoommateActions + [id]/ + new/
|   |   +-- favorites/                 [Mahia]    page + FavoriteList
|   |   +-- preferences/               [Mahia]    page + PreferencesForm
|   |   +-- menu/                      [Mahia]    page + MenuBoard + new/
|   |   +-- map/                       [Mahia]    page.tsx
|   |   +-- chores/                    [Mahia]    page.tsx
|   |   +-- guests/                    [Araf]     page.tsx
|   |   +-- meals/                     [Araf]     page.tsx
|   |   +-- mess-court/                [Araf]     page.tsx
|   |   +-- calendar/                  [Araf]     page.tsx
|   |
|   +-- (admin)/                       === VIEW (Admin Panel)
|   |   +-- layout.tsx
|   |   +-- admin/
|   |       +-- page.tsx
|   |       +-- users/                 page.tsx + UserRoleTable
|   |       +-- disputes/              page.tsx + EscalatedDisputes
|   |       +-- verification/          page.tsx + VerificationRequestsTable
|   |       +-- houses/
|   |       +-- listings/
|   |       +-- roommate-posts/
|   |       +-- profile-complaints/
|   |       +-- reports/
|   |       +-- settings/
|   |
|   +-- api/                           === CONTROLLER (API Route Handlers)
|       +-- auth/                      NextAuth + register
|       +-- profile/
|       +-- houses/                    + join/ + flat-head/
|       +-- join-requests/
|       +-- messages/
|       +-- verification/
|       +-- blocks/
|       +-- reports/
|       +-- cron/
|       +-- favorites/                 [Mahia]
|       +-- preferences/               [Mahia]
|       +-- listings/                  [Miftelul] + [id]/
|       +-- expenses/                  [Miftelul] + [id]/
|       +-- neighborhood/              [Miftelul] bookmarks/ deals/ directions/ house-pin/ places/ search/ tiles/
|       +-- maintenance/               [Miftelul]
|       +-- payments/                  [Miftelul] + webhook/
|       +-- matches/                   [Mahia]    + people/ + profile-complaints/
|       +-- roommate-posts/            [Mahia]    + [id]/
|       +-- menu-proposals/            [Mahia]    + [id]/
|       +-- chores/                    [Mahia]    + rotate/
|       +-- guests/                    [Araf]
|       +-- meals/                     [Araf]
|       +-- calendar/                  [Araf]
|       +-- disputes/                  [Araf]     + escalate/
|       +-- admin/
|           +-- users/
|           +-- disputes/              + uphold/
|           +-- reports/
|           +-- verification/
|           +-- moderate/
|           +-- settings/
|
+-- Araf/                              === Member Draft Workspace (Araf)
    +-- M1.3-Guests/
    |   +-- GuestCheckInForm.tsx       # Draft (integrated into app/(app)/guests/)
    |   +-- GuestLogTable.tsx          # Draft (integrated into app/(app)/guests/)
    +-- M2.3-MealAttendance/
        +-- MealAttendanceBoard.tsx    # Draft (integrated into app/(app)/meals/)
        +-- mealAttendance.ts          # Draft (merged into lib/)

--- DUPLICATE FOLDERS (do NOT use) ---
+-- CSE471_Lab_Project/                # OLD COPY — authz 14KB vs 24KB, schema 39KB vs 58KB
+-- Project GitHub Repo/               # OLD COPY — same structure but older
```

---

## Key Architecture Principles (from README)

1. **No database-level access control** — all rules live in `lib/authz.ts`
2. **Always use *Filter() on reads, assert*() before writes** — never skip these
3. **Single PrismaClient** — always import from `lib/prisma.ts`, never new PrismaClient()
4. **Route wrappers** — withUser() in API routes, requireUser() in pages
5. **Feature status** — flip your feature status in `lib/features.ts` when done
6. **Money columns** — Prisma Decimal type; wrap in Number() before arithmetic

---

*Last updated: 2026-08-19 — Auto-generated from full repo scan*
