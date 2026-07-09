CREATE TABLE "app_credentials" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" text NOT NULL,
	"config" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"step" text DEFAULT '대기 중' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error" text,
	"script" jsonb,
	"srt" text,
	"video_path" text,
	"thumbnail_path" text,
	"youtube_video_id" text,
	"drama_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_drama_id_dramas_id_fk" FOREIGN KEY ("drama_id") REFERENCES "public"."dramas"("id") ON DELETE set null ON UPDATE no action;