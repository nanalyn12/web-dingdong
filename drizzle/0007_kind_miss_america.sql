ALTER TABLE "dramas" ALTER COLUMN "youtube_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dramas" ALTER COLUMN "youtube_video_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dramas" ADD COLUMN "media_url" text;