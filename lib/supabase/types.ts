/**
 * The types the app imports. Everything here is hand-written and safe to edit.
 *
 * The actual schema types live in ./database.types.ts, which is GENERATED and
 * gets overwritten by `npm run db:types` after every migration. Keeping the two
 * apart means regenerating can never clobber the aliases below.
 *
 * Prefer `Tables<"listings">` in new code. These aliases exist so that renaming
 * a table surfaces as one error in this file rather than fifty across the app.
 */

import type { Database, Tables, Enums } from "./database.types";

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from "./database.types";

/* ── Table rows ─────────────────────────────────────────────────────────── */

export type Profile = Tables<"profiles">;
export type House = Tables<"houses">;
export type HouseMember = Tables<"house_members">;
export type Listing = Tables<"listings">;
export type Preference = Tables<"preferences">;
export type Match = Tables<"matches">;
export type Favorite = Tables<"favorites">;
export type JoinRequest = Tables<"join_requests">;
export type GuestLog = Tables<"guest_logs">;
export type Expense = Tables<"expenses">;
export type ExpenseShare = Tables<"expense_shares">;
export type MenuProposal = Tables<"menu_proposals">;
export type MenuProposalItem = Tables<"menu_proposal_items">;
export type MenuVote = Tables<"menu_votes">;
export type Meal = Tables<"meals">;
export type MealAttendance = Tables<"meal_attendance">;
export type MaintenanceTicket = Tables<"maintenance_tickets">;
export type MaintenanceTicketEvent = Tables<"maintenance_ticket_events">;
export type Payment = Tables<"payments">;
export type Chore = Tables<"chores">;
export type ChoreAssignment = Tables<"chore_assignments">;
export type Dispute = Tables<"disputes">;
export type DisputeVote = Tables<"dispute_votes">;
export type DisputeEvent = Tables<"dispute_events">;
export type GoogleCredential = Tables<"google_credentials">;
export type CalendarEvent = Tables<"calendar_events">;

/** Read-only view: running ledger per house (M2.1). */
export type HouseBalance = Tables<"house_balances">;

/* ── Enums ──────────────────────────────────────────────────────────────── */

export type UserRole = Enums<"user_role">;
export type MembershipStatus = Enums<"membership_status">;
export type SleepSchedule = Enums<"sleep_schedule">;
export type CleanlinessLevel = Enums<"cleanliness_level">;
export type RoomType = Enums<"room_type">;
export type JoinRequestStatus = Enums<"join_request_status">;
export type GuestStatus = Enums<"guest_status">;
export type SplitMethod = Enums<"split_method">;
export type ExpenseCategory = Enums<"expense_category">;
export type ShareStatus = Enums<"share_status">;
export type ProposalStatus = Enums<"proposal_status">;
export type MealType = Enums<"meal_type">;
export type AttendanceStatus = Enums<"attendance_status">;
export type TicketStatus = Enums<"ticket_status">;
export type TicketPriority = Enums<"ticket_priority">;
export type PaymentProvider = Enums<"payment_provider">;
export type PaymentStatus = Enums<"payment_status">;
export type ChoreFrequency = Enums<"chore_frequency">;
export type ChoreAssignmentStatus = Enums<"chore_assignment_status">;
export type DisputeState = Enums<"dispute_state">;
export type DisputeVoteValue = Enums<"dispute_vote_value">;

/** Silences the unused-import lint on Database while keeping the re-export. */
export type PublicSchema = Database["public"];
