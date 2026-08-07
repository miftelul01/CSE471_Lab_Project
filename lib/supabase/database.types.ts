// GENERATED FILE - do not edit. Run: npm run db:types
// Source of truth is the live Supabase schema; the app imports the
// friendlier aliases from ./types instead of reaching in here directly.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      calendar_events: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          google_event_id: string | null
          house_id: string
          id: string
          source_id: string | null
          source_type: string
          starts_at: string
          synced_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          google_event_id?: string | null
          house_id: string
          id?: string
          source_id?: string | null
          source_type: string
          starts_at: string
          synced_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          google_event_id?: string | null
          house_id?: string
          id?: string
          source_id?: string | null
          source_type?: string
          starts_at?: string
          synced_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_assignments: {
        Row: {
          chore_id: string
          completed_at: string | null
          created_at: string
          due_date: string
          google_task_id: string | null
          id: string
          status: Database["public"]["Enums"]["chore_assignment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          chore_id: string
          completed_at?: string | null
          created_at?: string
          due_date: string
          google_task_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["chore_assignment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          chore_id?: string
          completed_at?: string | null
          created_at?: string
          due_date?: string
          google_task_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["chore_assignment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_assignments_chore_id_fkey"
            columns: ["chore_id"]
            isOneToOne: false
            referencedRelation: "chores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chores: {
        Row: {
          created_at: string
          description: string | null
          frequency: Database["public"]["Enums"]["chore_frequency"]
          house_id: string
          id: string
          is_active: boolean
          last_assigned_index: number
          name: string
          rotation_order: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          frequency?: Database["public"]["Enums"]["chore_frequency"]
          house_id: string
          id?: string
          is_active?: boolean
          last_assigned_index?: number
          name: string
          rotation_order?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          frequency?: Database["public"]["Enums"]["chore_frequency"]
          house_id?: string
          id?: string
          is_active?: boolean
          last_assigned_index?: number
          name?: string
          rotation_order?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chores_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_events: {
        Row: {
          actor_id: string | null
          created_at: string
          dispute_id: string
          from_state: Database["public"]["Enums"]["dispute_state"] | null
          id: string
          note: string | null
          to_state: Database["public"]["Enums"]["dispute_state"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          dispute_id: string
          from_state?: Database["public"]["Enums"]["dispute_state"] | null
          id?: string
          note?: string | null
          to_state: Database["public"]["Enums"]["dispute_state"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          dispute_id?: string
          from_state?: Database["public"]["Enums"]["dispute_state"] | null
          id?: string
          note?: string | null
          to_state?: Database["public"]["Enums"]["dispute_state"]
        }
        Relationships: [
          {
            foreignKeyName: "dispute_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_events_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_votes: {
        Row: {
          comment: string | null
          created_at: string
          dispute_id: string
          id: string
          user_id: string
          vote: Database["public"]["Enums"]["dispute_vote_value"]
        }
        Insert: {
          comment?: string | null
          created_at?: string
          dispute_id: string
          id?: string
          user_id: string
          vote: Database["public"]["Enums"]["dispute_vote_value"]
        }
        Update: {
          comment?: string | null
          created_at?: string
          dispute_id?: string
          id?: string
          user_id?: string
          vote?: Database["public"]["Enums"]["dispute_vote_value"]
        }
        Relationships: [
          {
            foreignKeyName: "dispute_votes_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          against_user_id: string | null
          category: string | null
          created_at: string
          description: string
          escalated_at: string | null
          house_id: string
          id: string
          raised_by: string
          resolution: string | null
          resolved_at: string | null
          state: Database["public"]["Enums"]["dispute_state"]
          title: string
          updated_at: string
          voting_deadline: string | null
          voting_started_at: string | null
        }
        Insert: {
          against_user_id?: string | null
          category?: string | null
          created_at?: string
          description?: string
          escalated_at?: string | null
          house_id: string
          id?: string
          raised_by: string
          resolution?: string | null
          resolved_at?: string | null
          state?: Database["public"]["Enums"]["dispute_state"]
          title: string
          updated_at?: string
          voting_deadline?: string | null
          voting_started_at?: string | null
        }
        Update: {
          against_user_id?: string | null
          category?: string | null
          created_at?: string
          description?: string
          escalated_at?: string | null
          house_id?: string
          id?: string
          raised_by?: string
          resolution?: string | null
          resolved_at?: string | null
          state?: Database["public"]["Enums"]["dispute_state"]
          title?: string
          updated_at?: string
          voting_deadline?: string | null
          voting_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_against_user_id_fkey"
            columns: ["against_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_shares: {
        Row: {
          amount: number
          created_at: string
          expense_id: string
          id: string
          settled_at: string | null
          status: Database["public"]["Enums"]["share_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          expense_id: string
          id?: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["share_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_id?: string
          id?: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["share_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_shares_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string
          description: string | null
          house_id: string
          id: string
          spent_on: string
          split_method: Database["public"]["Enums"]["split_method"]
          title: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by: string
          description?: string | null
          house_id: string
          id?: string
          spent_on?: string
          split_method?: Database["public"]["Enums"]["split_method"]
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string
          description?: string | null
          house_id?: string
          id?: string
          spent_on?: string
          split_method?: Database["public"]["Enums"]["split_method"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_credentials: {
        Row: {
          access_token: string | null
          created_at: string
          expires_at: string | null
          refresh_token: string | null
          scopes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          refresh_token?: string | null
          scopes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          refresh_token?: string | null
          scopes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_logs: {
        Row: {
          checked_in_at: string
          checked_out_at: string | null
          created_at: string
          expected_check_out: string | null
          guest_name: string
          guest_phone: string | null
          host_user_id: string
          house_id: string
          id: string
          notified_admin_at: string | null
          purpose: string | null
          status: Database["public"]["Enums"]["guest_status"]
          updated_at: string
        }
        Insert: {
          checked_in_at?: string
          checked_out_at?: string | null
          created_at?: string
          expected_check_out?: string | null
          guest_name: string
          guest_phone?: string | null
          host_user_id: string
          house_id: string
          id?: string
          notified_admin_at?: string | null
          purpose?: string | null
          status?: Database["public"]["Enums"]["guest_status"]
          updated_at?: string
        }
        Update: {
          checked_in_at?: string
          checked_out_at?: string | null
          created_at?: string
          expected_check_out?: string | null
          guest_name?: string
          guest_phone?: string | null
          host_user_id?: string
          house_id?: string
          id?: string
          notified_admin_at?: string | null
          purpose?: string | null
          status?: Database["public"]["Enums"]["guest_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_logs_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_logs_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      house_members: {
        Row: {
          created_at: string
          house_id: string
          id: string
          is_house_admin: boolean
          joined_at: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          house_id: string
          id?: string
          is_house_admin?: boolean
          joined_at?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          house_id?: string
          id?: string
          is_house_admin?: boolean
          joined_at?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_members_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      houses: {
        Row: {
          address: string
          area: string | null
          created_at: string
          google_calendar_id: string | null
          id: string
          landlord_id: string | null
          latitude: number | null
          longitude: number | null
          name: string
          updated_at: string
        }
        Insert: {
          address: string
          area?: string | null
          created_at?: string
          google_calendar_id?: string | null
          id?: string
          landlord_id?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          address?: string
          area?: string | null
          created_at?: string
          google_calendar_id?: string | null
          id?: string
          landlord_id?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "houses_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          message: string | null
          status: Database["public"]["Enums"]["join_request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          message?: string | null
          status?: Database["public"]["Enums"]["join_request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["join_request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          address: string | null
          allows_pets: boolean | null
          allows_smoking: boolean | null
          amenities: string[]
          area: string
          capacity: number
          cleanliness: Database["public"]["Enums"]["cleanliness_level"] | null
          created_at: string
          description: string
          house_id: string | null
          id: string
          is_active: boolean
          landlord_id: string
          latitude: number | null
          longitude: number | null
          rent: number
          room_type: Database["public"]["Enums"]["room_type"]
          sleep_schedule: Database["public"]["Enums"]["sleep_schedule"] | null
          title: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          allows_pets?: boolean | null
          allows_smoking?: boolean | null
          amenities?: string[]
          area: string
          capacity?: number
          cleanliness?: Database["public"]["Enums"]["cleanliness_level"] | null
          created_at?: string
          description?: string
          house_id?: string | null
          id?: string
          is_active?: boolean
          landlord_id: string
          latitude?: number | null
          longitude?: number | null
          rent: number
          room_type?: Database["public"]["Enums"]["room_type"]
          sleep_schedule?: Database["public"]["Enums"]["sleep_schedule"] | null
          title: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          allows_pets?: boolean | null
          allows_smoking?: boolean | null
          amenities?: string[]
          area?: string
          capacity?: number
          cleanliness?: Database["public"]["Enums"]["cleanliness_level"] | null
          created_at?: string
          description?: string
          house_id?: string | null
          id?: string
          is_active?: boolean
          landlord_id?: string
          latitude?: number | null
          longitude?: number | null
          rent?: number
          room_type?: Database["public"]["Enums"]["room_type"]
          sleep_schedule?: Database["public"]["Enums"]["sleep_schedule"] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_ticket_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["ticket_status"] | null
          id: string
          note: string | null
          ticket_id: string
          to_status: Database["public"]["Enums"]["ticket_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["ticket_status"] | null
          id?: string
          note?: string | null
          ticket_id: string
          to_status: Database["public"]["Enums"]["ticket_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["ticket_status"] | null
          id?: string
          note?: string | null
          ticket_id?: string
          to_status?: Database["public"]["Enums"]["ticket_status"]
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_ticket_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "maintenance_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          created_at: string
          description: string
          house_id: string
          id: string
          photo_url: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          reported_by: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string
          house_id: string
          id?: string
          photo_url?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reported_by: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string
          house_id?: string
          id?: string
          photo_url?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reported_by?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          compatibility_score: number
          created_at: string
          id: string
          listing_id: string
          rank: number
          user_id: string
        }
        Insert: {
          compatibility_score: number
          created_at?: string
          id?: string
          listing_id: string
          rank: number
          user_id: string
        }
        Update: {
          compatibility_score?: number
          created_at?: string
          id?: string
          listing_id?: string
          rank?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_attendance: {
        Row: {
          created_at: string
          id: string
          meal_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meal_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meal_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_attendance_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          cost_per_head: number | null
          created_at: string
          headcount: number
          house_id: string
          id: string
          locks_at: string | null
          meal_date: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          menu_proposal_id: string | null
          updated_at: string
        }
        Insert: {
          cost_per_head?: number | null
          created_at?: string
          headcount?: number
          house_id: string
          id?: string
          locks_at?: string | null
          meal_date: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          menu_proposal_id?: string | null
          updated_at?: string
        }
        Update: {
          cost_per_head?: number | null
          created_at?: string
          headcount?: number
          house_id?: string
          id?: string
          locks_at?: string | null
          meal_date?: string
          meal_type?: Database["public"]["Enums"]["meal_type"]
          menu_proposal_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meals_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meals_menu_proposal_id_fkey"
            columns: ["menu_proposal_id"]
            isOneToOne: false
            referencedRelation: "menu_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_proposal_items: {
        Row: {
          day_of_week: number
          description: string
          id: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          proposal_id: string
        }
        Insert: {
          day_of_week: number
          description: string
          id?: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          proposal_id: string
        }
        Update: {
          day_of_week?: number
          description?: string
          id?: string
          meal_type?: Database["public"]["Enums"]["meal_type"]
          proposal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "menu_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_proposals: {
        Row: {
          created_at: string
          house_id: string
          id: string
          proposed_by: string
          status: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at: string
          voting_closes_at: string | null
          week_start_date: string
        }
        Insert: {
          created_at?: string
          house_id: string
          id?: string
          proposed_by: string
          status?: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at?: string
          voting_closes_at?: string | null
          week_start_date: string
        }
        Update: {
          created_at?: string
          house_id?: string
          id?: string
          proposed_by?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          title?: string
          updated_at?: string
          voting_closes_at?: string | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_proposals_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_votes: {
        Row: {
          created_at: string
          id: string
          proposal_id: string
          user_id: string
          vote: number
        }
        Insert: {
          created_at?: string
          id?: string
          proposal_id: string
          user_id: string
          vote: number
        }
        Update: {
          created_at?: string
          id?: string
          proposal_id?: string
          user_id?: string
          vote?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "menu_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          expense_share_id: string | null
          house_id: string | null
          id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_payload: Json | null
          provider_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          expense_share_id?: string | null
          house_id?: string | null
          id?: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_payload?: Json | null
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          expense_share_id?: string | null
          house_id?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_payload?: Json | null
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_expense_share_id_fkey"
            columns: ["expense_share_id"]
            isOneToOne: false
            referencedRelation: "expense_shares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      preferences: {
        Row: {
          budget_max: number
          budget_min: number
          cleanliness: Database["public"]["Enums"]["cleanliness_level"]
          created_at: string
          pets_ok: boolean
          preferred_area: string | null
          sleep_schedule: Database["public"]["Enums"]["sleep_schedule"]
          smoking_ok: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_max: number
          budget_min: number
          cleanliness: Database["public"]["Enums"]["cleanliness_level"]
          created_at?: string
          pets_ok?: boolean
          preferred_area?: string | null
          sleep_schedule: Database["public"]["Enums"]["sleep_schedule"]
          smoking_ok?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_max?: number
          budget_min?: number
          cleanliness?: Database["public"]["Enums"]["cleanliness_level"]
          created_at?: string
          pets_ok?: boolean
          preferred_area?: string | null
          sleep_schedule?: Database["public"]["Enums"]["sleep_schedule"]
          smoking_ok?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      house_balances: {
        Row: {
          full_name: string | null
          house_id: string | null
          outstanding: number | null
          total_owed: number | null
          total_paid: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      dispute_transition_allowed: {
        Args: {
          p_from: Database["public"]["Enums"]["dispute_state"]
          p_to: Database["public"]["Enums"]["dispute_state"]
        }
        Returns: boolean
      }
      is_house_admin: { Args: { p_house_id: string }; Returns: boolean }
      is_house_member: { Args: { p_house_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      attendance_status: "ATTENDING" | "SKIPPING"
      chore_assignment_status: "PENDING" | "COMPLETED" | "MISSED"
      chore_frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY"
      cleanliness_level: "VERY_TIDY" | "MODERATE" | "RELAXED"
      dispute_state: "RAISED" | "VOTING" | "RESOLVED" | "ESCALATED" | "ARCHIVED"
      dispute_vote_value: "FOR" | "AGAINST" | "ABSTAIN"
      expense_category:
        | "RENT"
        | "UTILITIES"
        | "GROCERIES"
        | "MAINTENANCE"
        | "OTHER"
      guest_status: "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED"
      join_request_status: "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN"
      meal_type: "BREAKFAST" | "LUNCH" | "DINNER"
      membership_status: "ACTIVE" | "PENDING" | "LEFT"
      payment_provider: "BKASH" | "STRIPE" | "CASH" | "MANUAL"
      payment_status:
        | "INITIATED"
        | "PENDING"
        | "SUCCEEDED"
        | "FAILED"
        | "REFUNDED"
      proposal_status: "DRAFT" | "OPEN" | "APPROVED" | "REJECTED"
      room_type: "SINGLE" | "SHARED" | "MASTER" | "SEAT" | "ENTIRE_FLAT"
      share_status: "PENDING" | "PAID" | "WAIVED"
      sleep_schedule: "EARLY_BIRD" | "NIGHT_OWL" | "FLEXIBLE"
      split_method: "EQUAL" | "CUSTOM" | "SHARES"
      ticket_priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
      ticket_status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"
      user_role: "RESIDENT" | "LANDLORD" | "ADMIN"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      attendance_status: ["ATTENDING", "SKIPPING"],
      chore_assignment_status: ["PENDING", "COMPLETED", "MISSED"],
      chore_frequency: ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"],
      cleanliness_level: ["VERY_TIDY", "MODERATE", "RELAXED"],
      dispute_state: ["RAISED", "VOTING", "RESOLVED", "ESCALATED", "ARCHIVED"],
      dispute_vote_value: ["FOR", "AGAINST", "ABSTAIN"],
      expense_category: [
        "RENT",
        "UTILITIES",
        "GROCERIES",
        "MAINTENANCE",
        "OTHER",
      ],
      guest_status: ["CHECKED_IN", "CHECKED_OUT", "CANCELLED"],
      join_request_status: ["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN"],
      meal_type: ["BREAKFAST", "LUNCH", "DINNER"],
      membership_status: ["ACTIVE", "PENDING", "LEFT"],
      payment_provider: ["BKASH", "STRIPE", "CASH", "MANUAL"],
      payment_status: [
        "INITIATED",
        "PENDING",
        "SUCCEEDED",
        "FAILED",
        "REFUNDED",
      ],
      proposal_status: ["DRAFT", "OPEN", "APPROVED", "REJECTED"],
      room_type: ["SINGLE", "SHARED", "MASTER", "SEAT", "ENTIRE_FLAT"],
      share_status: ["PENDING", "PAID", "WAIVED"],
      sleep_schedule: ["EARLY_BIRD", "NIGHT_OWL", "FLEXIBLE"],
      split_method: ["EQUAL", "CUSTOM", "SHARES"],
      ticket_priority: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      ticket_status: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
      user_role: ["RESIDENT", "LANDLORD", "ADMIN"],
    },
  },
} as const
