CREATE TABLE "song_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"keywords" text[] NOT NULL,
	"next_keyword_index" integer DEFAULT 0 NOT NULL,
	"frequency" text DEFAULT 'weekly' NOT NULL,
	"weekdays" integer[] DEFAULT '{}' NOT NULL,
	"time_kst" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"level" text DEFAULT 'beginner' NOT NULL,
	"style" text DEFAULT 'cute mandarin pop' NOT NULL,
	"vocal_gender" text,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "song_schedules" ADD CONSTRAINT "song_schedules_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;