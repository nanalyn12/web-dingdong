CREATE TABLE "ai_usage_daily" (
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"kind" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_daily_user_id_day_kind_pk" PRIMARY KEY("user_id","day","kind")
);
--> statement-breakpoint
CREATE TABLE "user_api_keys" (
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" text NOT NULL,
	"hint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_api_keys_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "ai_usage_daily" ADD CONSTRAINT "ai_usage_daily_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;