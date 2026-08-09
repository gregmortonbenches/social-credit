export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          email: string;
          total_credits: number;
          device_push_token: string | null;
          anonymous_token: string | null;
          is_admin: boolean;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          email: string;
          total_credits?: number;
          device_push_token?: string | null;
          anonymous_token?: string | null;
          is_admin?: boolean;
          deleted_at?: string | null;
          created_at?: string;
        };
        Update: {
          username?: string;
          email?: string;
          total_credits?: number;
          device_push_token?: string | null;
          is_admin?: boolean;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      collectives: {
        Row: {
          id: string;
          name: string;
          display_name: string;
          code: string;
          timezone: string;
          created_by: string;
          rooms: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_name: string;
          code: string;
          timezone: string;
          created_by: string;
          rooms?: Json;
          created_at?: string;
        };
        Update: {
          name?: string;
          display_name?: string;
          timezone?: string;
          rooms?: Json;
        };
        Relationships: [];
      };
      collective_members: {
        Row: {
          id: string;
          collective_id: string;
          user_id: string;
          status: 'active' | 'paused' | 'pending' | 'left';
          joined_at: string;
          pause_started_at: string | null;
          pause_ended_at: string | null;
        };
        Insert: {
          id?: string;
          collective_id: string;
          user_id: string;
          status?: 'active' | 'paused' | 'pending' | 'left';
          joined_at?: string;
          pause_started_at?: string | null;
          pause_ended_at?: string | null;
        };
        Update: {
          status?: 'active' | 'paused' | 'pending' | 'left';
          pause_started_at?: string | null;
          pause_ended_at?: string | null;
        };
        Relationships: [];
      };
      task_library: {
        Row: {
          id: string;
          name: string;
          room_type: string;
          description: string | null;
          is_custom: boolean;
          created_by_collective_id: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          room_type: string;
          description?: string | null;
          is_custom?: boolean;
          created_by_collective_id?: string | null;
        };
        Update: {
          name?: string;
          room_type?: string;
          description?: string | null;
        };
        Relationships: [];
      };
      weekly_assignments: {
        Row: {
          id: string;
          collective_id: string;
          user_id: string;
          task_id: string;
          week_start: string;
          due_date: string;
          completed_at: string | null;
          credits_value: number | null;
          status: 'pending' | 'complete' | 'failed' | 'reassigned';
        };
        Insert: {
          id?: string;
          collective_id: string;
          user_id: string;
          task_id: string;
          week_start: string;
          due_date: string;
          completed_at?: string | null;
          credits_value?: number | null;
          status?: 'pending' | 'complete' | 'failed' | 'reassigned';
        };
        Update: {
          completed_at?: string | null;
          credits_value?: number | null;
          status?: 'pending' | 'complete' | 'failed' | 'reassigned';
        };
        Relationships: [];
      };
      denouncements: {
        Row: {
          id: string;
          collective_id: string;
          accuser_id: string;
          accused_id: string;
          assignment_id: string;
          status: 'open' | 'responded' | 'auto_guilty' | 'voted' | 'resolved';
          explanation: string | null;
          outcome: 'upheld' | 'dismissed' | null;
          created_at: string;
          responded_at: string | null;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          collective_id: string;
          accuser_id: string;
          accused_id: string;
          assignment_id: string;
          status?: 'open' | 'responded' | 'auto_guilty' | 'voted' | 'resolved';
          explanation?: string | null;
          outcome?: 'upheld' | 'dismissed' | null;
          created_at?: string;
          responded_at?: string | null;
          resolved_at?: string | null;
        };
        Update: {
          status?: 'open' | 'responded' | 'auto_guilty' | 'voted' | 'resolved';
          explanation?: string | null;
          outcome?: 'upheld' | 'dismissed' | null;
          responded_at?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      denouncement_votes: {
        Row: {
          id: string;
          denouncement_id: string;
          voter_id: string;
          vote: 'uphold' | 'dismiss';
          created_at: string;
        };
        Insert: {
          id?: string;
          denouncement_id: string;
          voter_id: string;
          vote: 'uphold' | 'dismiss';
          created_at?: string;
        };
        Update: {
          vote?: 'uphold' | 'dismiss';
        };
        Relationships: [];
      };
      draft_state: {
        Row: {
          id: string;
          collective_id: string;
          week_start: string;
          status: 'pending' | 'complete';
        };
        Insert: {
          id?: string;
          collective_id: string;
          week_start: string;
          status?: 'pending' | 'complete';
        };
        Update: {
          status?: 'pending' | 'complete';
        };
        Relationships: [];
      };
      task_preferences: {
        Row: {
          id: string;
          user_id: string;
          collective_id: string;
          task_id: string;
          rank: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          collective_id: string;
          task_id: string;
          rank: number;
          updated_at?: string;
        };
        Update: {
          rank?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      achievements: {
        Row: {
          id: string;
          user_id: string;
          achievement_key: string;
          collective_id: string | null;
          unlocked_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          achievement_key: string;
          collective_id?: string | null;
          unlocked_at?: string;
        };
        Update: {
          achievement_key?: string;
        };
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          id: string;
          user_id: string;
          collective_id: string | null;
          delta: number;
          reason: string;
          reference_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          collective_id?: string | null;
          delta: number;
          reason: string;
          reference_id?: string | null;
          created_at?: string;
        };
        Update: {
          delta?: number;
          reason?: string;
        };
        Relationships: [];
      };
      app_config: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          key: string;
          value: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          value?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      credits_transaction: {
        Args: {
          p_user_id: string;
          p_collective_id: string;
          p_delta: number;
          p_reason: string;
          p_reference_id?: string | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Profile = Tables<'profiles'>;
export type Collective = Tables<'collectives'>;
export type CollectiveMember = Tables<'collective_members'>;
export type TaskLibrary = Tables<'task_library'>;
export type WeeklyAssignment = Tables<'weekly_assignments'>;
export type Denouncement = Tables<'denouncements'>;
export type DenouncementVote = Tables<'denouncement_votes'>;
export type DraftState = Tables<'draft_state'>;
export type TaskPreference = Tables<'task_preferences'>;
export type Achievement = Tables<'achievements'>;
export type CreditLedger = Tables<'credit_ledger'>;
export type AppConfig = Tables<'app_config'>;
