CREATE TABLE "drama_progress" (
	"user_id" text NOT NULL,
	"drama_id" uuid NOT NULL,
	"last_seconds" real DEFAULT 0 NOT NULL,
	"completed_scenes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quiz_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_progress_user_drama" UNIQUE("user_id","drama_id")
);
--> statement-breakpoint
ALTER TABLE "drama_progress" ADD CONSTRAINT "drama_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drama_progress" ADD CONSTRAINT "drama_progress_drama_id_dramas_id_fk" FOREIGN KEY ("drama_id") REFERENCES "public"."dramas"("id") ON DELETE cascade ON UPDATE no action;