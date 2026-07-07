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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      courses: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          level: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          weeks: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          level: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          weeks?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          level?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          weeks?: number
        }
        Relationships: []
      }
      curriculum_plans: {
        Row: {
          activities: Json
          assessment: Json
          course_id: string | null
          created_at: string
          created_by: string
          duration_minutes: number
          handout_markdown: string
          id: string
          interests: string[]
          lesson_id: string | null
          lesson_objective_hint: string | null
          materials: Json
          objectives: Json
          preferred_activities: string[]
          special_notes: string | null
          student_grade: string
          time_blocks: Json
          title: string
          updated_at: string
        }
        Insert: {
          activities?: Json
          assessment?: Json
          course_id?: string | null
          created_at?: string
          created_by: string
          duration_minutes?: number
          handout_markdown?: string
          id?: string
          interests?: string[]
          lesson_id?: string | null
          lesson_objective_hint?: string | null
          materials?: Json
          objectives?: Json
          preferred_activities?: string[]
          special_notes?: string | null
          student_grade: string
          time_blocks?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          activities?: Json
          assessment?: Json
          course_id?: string | null
          created_at?: string
          created_by?: string
          duration_minutes?: number
          handout_markdown?: string
          id?: string
          interests?: string[]
          lesson_id?: string | null
          lesson_objective_hint?: string | null
          materials?: Json
          objectives?: Json
          preferred_activities?: string[]
          special_notes?: string | null
          student_grade?: string
          time_blocks?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_plans_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_plans_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      dramas: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          genre: string | null
          has_captions: boolean
          id: string
          level: string
          scenes: Json
          thumbnail_url: string | null
          title: string
          title_zh: string | null
          updated_at: string
          youtube_url: string
          youtube_video_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          genre?: string | null
          has_captions?: boolean
          id?: string
          level?: string
          scenes?: Json
          thumbnail_url?: string | null
          title: string
          title_zh?: string | null
          updated_at?: string
          youtube_url: string
          youtube_video_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          genre?: string | null
          has_captions?: boolean
          id?: string
          level?: string
          scenes?: Json
          thumbnail_url?: string | null
          title?: string
          title_zh?: string | null
          updated_at?: string
          youtube_url?: string
          youtube_video_id?: string
        }
        Relationships: []
      }
      lessons: {
        Row: {
          comic_panels: Json
          content_md: string | null
          course_id: string
          created_at: string
          created_by: string | null
          cultural_note: Json
          cultural_snippet: Json
          dialogue_scene: string | null
          dialogues: Json
          id: string
          key_expressions: Json
          lesson_type: string | null
          level: string | null
          order_index: number
          quiz: Json
          slides: Json
          storybook_pages: Json
          title: string
          updated_at: string
          video: Json
          video_keywords: Json
          vocab_comparison: Json
        }
        Insert: {
          comic_panels?: Json
          content_md?: string | null
          course_id: string
          created_at?: string
          created_by?: string | null
          cultural_note?: Json
          cultural_snippet?: Json
          dialogue_scene?: string | null
          dialogues?: Json
          id?: string
          key_expressions?: Json
          lesson_type?: string | null
          level?: string | null
          order_index: number
          quiz?: Json
          slides?: Json
          storybook_pages?: Json
          title: string
          updated_at?: string
          video?: Json
          video_keywords?: Json
          vocab_comparison?: Json
        }
        Update: {
          comic_panels?: Json
          content_md?: string | null
          course_id?: string
          created_at?: string
          created_by?: string | null
          cultural_note?: Json
          cultural_snippet?: Json
          dialogue_scene?: string | null
          dialogues?: Json
          id?: string
          key_expressions?: Json
          lesson_type?: string | null
          level?: string | null
          order_index?: number
          quiz?: Json
          slides?: Json
          storybook_pages?: Json
          title?: string
          updated_at?: string
          video?: Json
          video_keywords?: Json
          vocab_comparison?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          hsk_goal: number | null
          id: string
          interest_categories: string[]
          job: Database["public"]["Enums"]["profile_job"] | null
          last_active_at: string | null
          learning_goal: string | null
          nickname: string | null
          phone: string | null
          real_name: string | null
          role: Database["public"]["Enums"]["app_role"]
          teacher_application_note: string | null
          teacher_applied_at: string | null
          teacher_status: Database["public"]["Enums"]["teacher_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          hsk_goal?: number | null
          id: string
          interest_categories?: string[]
          job?: Database["public"]["Enums"]["profile_job"] | null
          last_active_at?: string | null
          learning_goal?: string | null
          nickname?: string | null
          phone?: string | null
          real_name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          teacher_application_note?: string | null
          teacher_applied_at?: string | null
          teacher_status?: Database["public"]["Enums"]["teacher_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          hsk_goal?: number | null
          id?: string
          interest_categories?: string[]
          job?: Database["public"]["Enums"]["profile_job"] | null
          last_active_at?: string | null
          learning_goal?: string | null
          nickname?: string | null
          phone?: string | null
          real_name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          teacher_application_note?: string | null
          teacher_applied_at?: string | null
          teacher_status?: Database["public"]["Enums"]["teacher_status"]
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_pushed_at: string | null
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_pushed_at?: string | null
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_pushed_at?: string | null
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      songs: {
        Row: {
          artist: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          cultural_note: Json | null
          external_url: string | null
          grammar_notes: Json
          id: string
          level: string
          lyrics: Json
          media_url: string | null
          pinyin: Json
          quiz: Json
          source: string
          status: string
          style: string | null
          suno_audio_id: string | null
          suno_audio_task_id: string | null
          suno_mp4_task_id: string | null
          title: string
          title_zh: string | null
          topic: string | null
          translation: Json
          updated_at: string
          video_url: string | null
          vocab: Json
          youtube_id: string | null
        }
        Insert: {
          artist?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          cultural_note?: Json | null
          external_url?: string | null
          grammar_notes?: Json
          id?: string
          level?: string
          lyrics?: Json
          media_url?: string | null
          pinyin?: Json
          quiz?: Json
          source?: string
          status?: string
          style?: string | null
          suno_audio_id?: string | null
          suno_audio_task_id?: string | null
          suno_mp4_task_id?: string | null
          title: string
          title_zh?: string | null
          topic?: string | null
          translation?: Json
          updated_at?: string
          video_url?: string | null
          vocab?: Json
          youtube_id?: string | null
        }
        Update: {
          artist?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          cultural_note?: Json | null
          external_url?: string | null
          grammar_notes?: Json
          id?: string
          level?: string
          lyrics?: Json
          media_url?: string | null
          pinyin?: Json
          quiz?: Json
          source?: string
          status?: string
          style?: string | null
          suno_audio_id?: string | null
          suno_audio_task_id?: string | null
          suno_mp4_task_id?: string | null
          title?: string
          title_zh?: string | null
          topic?: string | null
          translation?: Json
          updated_at?: string
          video_url?: string | null
          vocab?: Json
          youtube_id?: string | null
        }
        Relationships: []
      }
      vocabulary: {
        Row: {
          created_at: string
          emoji: string | null
          hsk: number | null
          id: string
          ko: string | null
          lesson_id: string | null
          pinyin: string | null
          source: string | null
          srs_due_at: string
          srs_ease: number
          srs_interval_days: number
          srs_lapses: number
          srs_last_reviewed_at: string | null
          srs_reps: number
          tags: string[]
          user_id: string
          zh: string
        }
        Insert: {
          created_at?: string
          emoji?: string | null
          hsk?: number | null
          id?: string
          ko?: string | null
          lesson_id?: string | null
          pinyin?: string | null
          source?: string | null
          srs_due_at?: string
          srs_ease?: number
          srs_interval_days?: number
          srs_lapses?: number
          srs_last_reviewed_at?: string | null
          srs_reps?: number
          tags?: string[]
          user_id: string
          zh: string
        }
        Update: {
          created_at?: string
          emoji?: string | null
          hsk?: number | null
          id?: string
          ko?: string | null
          lesson_id?: string | null
          pinyin?: string | null
          source?: string | null
          srs_due_at?: string
          srs_ease?: number
          srs_interval_days?: number
          srs_lapses?: number
          srs_last_reviewed_at?: string | null
          srs_reps?: number
          tags?: string[]
          user_id?: string
          zh?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocabulary_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "student" | "teacher" | "admin"
      profile_job: "high_school" | "university" | "teacher" | "worker" | "other"
      teacher_status: "none" | "pending" | "approved" | "rejected"
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
      app_role: ["student", "teacher", "admin"],
      profile_job: ["high_school", "university", "teacher", "worker", "other"],
      teacher_status: ["none", "pending", "approved", "rejected"],
    },
  },
} as const
