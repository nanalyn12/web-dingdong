CREATE TABLE "vocab_practice_cache" (
	"zh" text PRIMARY KEY NOT NULL,
	"practice" jsonb NOT NULL,
	"generated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
