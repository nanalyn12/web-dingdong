CREATE TYPE "public"."app_role" AS ENUM('student', 'teacher', 'admin');--> statement-breakpoint
CREATE TYPE "public"."profile_job" AS ENUM('high_school', 'university', 'teacher', 'worker', 'other');--> statement-breakpoint
CREATE TYPE "public"."teacher_status" AS ENUM('none', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"level" text NOT NULL,
	"weeks" integer DEFAULT 4 NOT NULL,
	"thumbnail_url" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"student_grade" text NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"interests" text[] DEFAULT '{}' NOT NULL,
	"preferred_activities" text[] DEFAULT '{}' NOT NULL,
	"special_notes" text,
	"lesson_objective_hint" text,
	"course_id" uuid,
	"lesson_id" uuid,
	"objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"materials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assessment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"time_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"handout_markdown" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dramas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"title_zh" text,
	"description" text,
	"genre" text,
	"level" text DEFAULT 'beginner' NOT NULL,
	"youtube_url" text NOT NULL,
	"youtube_video_id" text NOT NULL,
	"thumbnail_url" text,
	"duration_seconds" integer,
	"has_captions" boolean DEFAULT false NOT NULL,
	"scenes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"order_index" integer NOT NULL,
	"lesson_type" text,
	"level" text,
	"content_md" text,
	"dialogue_scene" text,
	"dialogues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"key_expressions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vocab_comparison" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cultural_note" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cultural_snippet" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comic_panels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"storybook_pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"slides" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quiz" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"video" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"video_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_course_order_unique" UNIQUE("course_id","order_index")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"role" "app_role" DEFAULT 'student' NOT NULL,
	"nickname" text,
	"real_name" text,
	"phone" text,
	"job" "profile_job",
	"learning_goal" text,
	"interest_categories" text[] DEFAULT '{}' NOT NULL,
	"hsk_goal" integer,
	"teacher_status" "teacher_status" DEFAULT 'none' NOT NULL,
	"teacher_applied_at" timestamp with time zone,
	"teacher_application_note" text,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"last_pushed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"title_zh" text,
	"artist" text,
	"level" text DEFAULT 'beginner' NOT NULL,
	"source" text DEFAULT 'suno' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"topic" text,
	"style" text,
	"youtube_id" text,
	"external_url" text,
	"media_url" text,
	"video_url" text,
	"cover_url" text,
	"suno_audio_id" text,
	"suno_audio_task_id" text,
	"suno_mp4_task_id" text,
	"lyrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pinyin" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"translation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vocab" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grammar_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quiz" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cultural_note" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"zh" text NOT NULL,
	"pinyin" text,
	"ko" text,
	"emoji" text,
	"hsk" integer,
	"source" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"lesson_id" uuid,
	"srs_due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"srs_interval_days" real DEFAULT 0 NOT NULL,
	"srs_ease" real DEFAULT 2.5 NOT NULL,
	"srs_reps" integer DEFAULT 0 NOT NULL,
	"srs_lapses" integer DEFAULT 0 NOT NULL,
	"srs_last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_user_zh_unique" UNIQUE("user_id","zh")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_plans" ADD CONSTRAINT "curriculum_plans_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_plans" ADD CONSTRAINT "curriculum_plans_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary" ADD CONSTRAINT "vocabulary_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary" ADD CONSTRAINT "vocabulary_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_vocabulary_user_due" ON "vocabulary" USING btree ("user_id","srs_due_at");