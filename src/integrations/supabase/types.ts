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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audio_tracks: {
        Row: {
          actual_duration_seconds: number | null
          audio_url: string | null
          book_id: string
          chapter_index: number
          chunk_index: number
          created_at: string
          estimated_duration_seconds: number
          generated_at: string | null
          id: string
          paragraph_index: number
          runpod_job_id: string | null
          status: string
          text: string
          total_chunks: number
        }
        Insert: {
          actual_duration_seconds?: number | null
          audio_url?: string | null
          book_id: string
          chapter_index: number
          chunk_index?: number
          created_at?: string
          estimated_duration_seconds: number
          generated_at?: string | null
          id?: string
          paragraph_index: number
          runpod_job_id?: string | null
          status?: string
          text: string
          total_chunks?: number
        }
        Update: {
          actual_duration_seconds?: number | null
          audio_url?: string | null
          book_id?: string
          chapter_index?: number
          chunk_index?: number
          created_at?: string
          estimated_duration_seconds?: number
          generated_at?: string | null
          id?: string
          paragraph_index?: number
          runpod_job_id?: string | null
          status?: string
          text?: string
          total_chunks?: number
        }
        Relationships: [
          {
            foreignKeyName: "audio_tracks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author: string | null
          cover_url: string | null
          created_at: string
          epub_url: string
          id: string
          status: Database["public"]["Enums"]["book_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author?: string | null
          cover_url?: string | null
          created_at?: string
          epub_url: string
          id?: string
          status?: Database["public"]["Enums"]["book_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author?: string | null
          cover_url?: string | null
          created_at?: string
          epub_url?: string
          id?: string
          status?: Database["public"]["Enums"]["book_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      playback_progress: {
        Row: {
          book_id: string
          chapter_index: number | null
          id: string
          position_seconds: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          chapter_index?: number | null
          id?: string
          position_seconds?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          chapter_index?: number | null
          id?: string
          position_seconds?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playback_progress_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      public_book_chapters: {
        Row: {
          audio_url: string
          book_id: string
          chapter_index: number
          created_at: string | null
          duration_seconds: number | null
          id: string
          sync_url: string | null
          title: string
        }
        Insert: {
          audio_url: string
          book_id: string
          chapter_index: number
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          sync_url?: string | null
          title: string
        }
        Update: {
          audio_url?: string
          book_id?: string
          chapter_index?: number
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          sync_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_book_chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "public_books"
            referencedColumns: ["id"]
          },
        ]
      }
      public_book_progress: {
        Row: {
          chapter_index: number | null
          id: string
          position_seconds: number | null
          public_book_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          chapter_index?: number | null
          id?: string
          position_seconds?: number | null
          public_book_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          chapter_index?: number | null
          id?: string
          position_seconds?: number | null
          public_book_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_book_progress_public_book_id_fkey"
            columns: ["public_book_id"]
            isOneToOne: false
            referencedRelation: "public_books"
            referencedColumns: ["id"]
          },
        ]
      }
      public_books: {
        Row: {
          author: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          epub_url: string
          genre: string | null
          id: string
          is_featured: boolean | null
          slug: string | null
          title: string
        }
        Insert: {
          author?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          epub_url: string
          genre?: string | null
          id?: string
          is_featured?: boolean | null
          slug?: string | null
          title: string
        }
        Update: {
          author?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          epub_url?: string
          genre?: string | null
          id?: string
          is_featured?: boolean | null
          slug?: string | null
          title?: string
        }
        Relationships: []
      }
      user_public_books: {
        Row: {
          added_at: string | null
          id: string
          public_book_id: string
          user_id: string
        }
        Insert: {
          added_at?: string | null
          id?: string
          public_book_id: string
          user_id: string
        }
        Update: {
          added_at?: string | null
          id?: string
          public_book_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_public_books_public_book_id_fkey"
            columns: ["public_book_id"]
            isOneToOne: false
            referencedRelation: "public_books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      book_status: "uploaded" | "processing" | "ready" | "failed"
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
      app_role: ["admin", "moderator", "user"],
      book_status: ["uploaded", "processing", "ready", "failed"],
    },
  },
} as const
