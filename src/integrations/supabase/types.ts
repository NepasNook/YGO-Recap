export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      decks: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "decks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_stats";
            referencedColumns: ["user_id"];
          },
        ];
      };
      duel_games: {
        Row: {
          created_at: string;
          duel_id: string;
          game_number: number;
          id: string;
          lp_history: Json;
          p1_final_lp: number;
          p2_final_lp: number;
          winner_id: string | null;
        };
        Insert: {
          created_at?: string;
          duel_id: string;
          game_number: number;
          id?: string;
          lp_history?: Json;
          p1_final_lp?: number;
          p2_final_lp?: number;
          winner_id?: string | null;
        };
        Update: {
          created_at?: string;
          duel_id?: string;
          game_number?: number;
          id?: string;
          lp_history?: Json;
          p1_final_lp?: number;
          p2_final_lp?: number;
          winner_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "duel_games_duel_id_fkey";
            columns: ["duel_id"];
            isOneToOne: false;
            referencedRelation: "duels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duel_games_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duel_games_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duel_games_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "user_stats";
            referencedColumns: ["user_id"];
          },
        ];
      };
      duel_live_state: {
        Row: {
          draws: number;
          duel_id: string;
          last_event: Json | null;
          p1_lp: number;
          p1_wins: number;
          p2_lp: number;
          p2_wins: number;
          rps_needed: boolean;
          starter: number | null;
          updated_at: string;
        };
        Insert: {
          draws?: number;
          duel_id: string;
          last_event?: Json | null;
          p1_lp?: number;
          p1_wins?: number;
          p2_lp?: number;
          p2_wins?: number;
          rps_needed?: boolean;
          starter?: number | null;
          updated_at?: string;
        };
        Update: {
          draws?: number;
          duel_id?: string;
          last_event?: Json | null;
          p1_lp?: number;
          p1_wins?: number;
          p2_lp?: number;
          p2_wins?: number;
          rps_needed?: boolean;
          starter?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "duel_live_state_duel_id_fkey";
            columns: ["duel_id"];
            isOneToOne: true;
            referencedRelation: "duels";
            referencedColumns: ["id"];
          },
        ];
      };
      duel_lp_logs: {
        Row: {
          by_user_id: string | null;
          created_at: string;
          delta: number;
          duel_id: string;
          id: string;
          new_lp: number;
          note: string | null;
          player: number;
          prev_lp: number;
        };
        Insert: {
          by_user_id?: string | null;
          created_at?: string;
          delta: number;
          duel_id: string;
          id?: string;
          new_lp: number;
          note?: string | null;
          player: number;
          prev_lp: number;
        };
        Update: {
          by_user_id?: string | null;
          created_at?: string;
          delta?: number;
          duel_id?: string;
          id?: string;
          new_lp?: number;
          note?: string | null;
          player?: number;
          prev_lp?: number;
        };
        Relationships: [
          {
            foreignKeyName: "duel_lp_logs_duel_id_fkey";
            columns: ["duel_id"];
            isOneToOne: false;
            referencedRelation: "duels";
            referencedColumns: ["id"];
          },
        ];
      };
      duels: {
        Row: {
          created_at: string;
          date: string;
          deck1_id: string | null;
          deck2_id: string | null;
          for_fun: boolean;
          games_p1_wins: number;
          games_p2_wins: number;
          id: string;
          is_local: boolean;
          pending_join_user_id: string | null;
          player1_id: string;
          player2_id: string | null;
          status: string;
          tournament_match_id: string | null;
          winner_id: string | null;
        };
        Insert: {
          created_at?: string;
          date?: string;
          deck1_id?: string | null;
          deck2_id?: string | null;
          for_fun?: boolean;
          games_p1_wins?: number;
          games_p2_wins?: number;
          id?: string;
          is_local?: boolean;
          pending_join_user_id?: string | null;
          player1_id: string;
          player2_id?: string | null;
          status?: string;
          tournament_match_id?: string | null;
          winner_id?: string | null;
        };
        Update: {
          created_at?: string;
          date?: string;
          deck1_id?: string | null;
          deck2_id?: string | null;
          for_fun?: boolean;
          games_p1_wins?: number;
          games_p2_wins?: number;
          id?: string;
          is_local?: boolean;
          pending_join_user_id?: string | null;
          player1_id?: string;
          player2_id?: string | null;
          status?: string;
          tournament_match_id?: string | null;
          winner_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "duels_deck1_id_fkey";
            columns: ["deck1_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duels_deck2_id_fkey";
            columns: ["deck2_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duels_player1_id_fkey";
            columns: ["player1_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duels_player1_id_fkey";
            columns: ["player1_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duels_player1_id_fkey";
            columns: ["player1_id"];
            isOneToOne: false;
            referencedRelation: "user_stats";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "duels_player2_id_fkey";
            columns: ["player2_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duels_player2_id_fkey";
            columns: ["player2_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duels_player2_id_fkey";
            columns: ["player2_id"];
            isOneToOne: false;
            referencedRelation: "user_stats";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "duels_tournament_match_id_fkey";
            columns: ["tournament_match_id"];
            isOneToOne: false;
            referencedRelation: "tournament_matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duels_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duels_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "duels_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "user_stats";
            referencedColumns: ["user_id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          id: string;
          username: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          id: string;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          username?: string;
        };
        Relationships: [];
      };
      tournament_matches: {
        Row: {
          bracket_position: number;
          created_at: string;
          duel_id: string | null;
          id: string;
          player1_id: string | null;
          player2_id: string | null;
          round: number;
          scheduled_time: string | null;
          started_at: string | null;
          tournament_id: string;
          winner_id: string | null;
        };
        Insert: {
          bracket_position: number;
          created_at?: string;
          duel_id?: string | null;
          id?: string;
          player1_id?: string | null;
          player2_id?: string | null;
          round: number;
          scheduled_time?: string | null;
          started_at?: string | null;
          tournament_id: string;
          winner_id?: string | null;
        };
        Update: {
          bracket_position?: number;
          created_at?: string;
          duel_id?: string | null;
          id?: string;
          player1_id?: string | null;
          player2_id?: string | null;
          round?: number;
          scheduled_time?: string | null;
          started_at?: string | null;
          tournament_id?: string;
          winner_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tournament_matches_player1_id_fkey";
            columns: ["player1_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_matches_player1_id_fkey";
            columns: ["player1_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_matches_player1_id_fkey";
            columns: ["player1_id"];
            isOneToOne: false;
            referencedRelation: "user_stats";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "tournament_matches_player2_id_fkey";
            columns: ["player2_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_matches_player2_id_fkey";
            columns: ["player2_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_matches_player2_id_fkey";
            columns: ["player2_id"];
            isOneToOne: false;
            referencedRelation: "user_stats";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_matches_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_matches_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_matches_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "user_stats";
            referencedColumns: ["user_id"];
          },
        ];
      };
      tournament_participants: {
        Row: {
          id: string;
          joined_at: string;
          tournament_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          joined_at?: string;
          tournament_id: string;
          user_id: string;
        };
        Update: {
          id?: string;
          joined_at?: string;
          tournament_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tournament_participants_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_stats";
            referencedColumns: ["user_id"];
          },
        ];
      };
      tournaments: {
        Row: {
          created_at: string;
          creator_id: string;
          description: string | null;
          format: string;
          id: string;
          matches_per_player: number | null;
          max_players: number;
          name: string;
          start_date: string | null;
          status: Database["public"]["Enums"]["tournament_status"];
          winner_id: string | null;
        };
        Insert: {
          created_at?: string;
          creator_id: string;
          description?: string | null;
          format?: string;
          id?: string;
          matches_per_player?: number | null;
          max_players: number;
          name: string;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["tournament_status"];
          winner_id?: string | null;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          description?: string | null;
          format?: string;
          id?: string;
          matches_per_player?: number | null;
          max_players?: number;
          name?: string;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["tournament_status"];
          winner_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tournaments_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournaments_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournaments_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "user_stats";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "tournaments_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournaments_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournaments_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "user_stats";
            referencedColumns: ["user_id"];
          },
        ];
      };
      user_lp_shortcuts: {
        Row: {
          created_at: string;
          delta: number;
          id: string;
          label: string;
          position: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          delta: number;
          id?: string;
          label: string;
          position?: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          delta?: number;
          id?: string;
          label?: string;
          position?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          id: string | null;
          username: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          id?: string | null;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          id?: string | null;
          username?: string | null;
        };
        Relationships: [];
      };
      user_stats: {
        Row: {
          losses: number | null;
          total_duels: number | null;
          user_id: string | null;
          username: string | null;
          win_pct: number | null;
          wins: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      admin_list_user_emails: {
        Args: never;
        Returns: {
          email: string;
          id: string;
        }[];
      };
      compute_elo_ratings: {
        Args: never;
        Returns: {
          user_id: string;
          username: string;
          elo: number;
          duels_played: number;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "user";
      tournament_status: "open" | "active" | "finished";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      tournament_status: ["open", "active", "finished"],
    },
  },
} as const;
