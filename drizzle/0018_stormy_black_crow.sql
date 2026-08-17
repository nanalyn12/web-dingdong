CREATE TABLE "backup_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"backup_id" uuid,
	"action" text NOT NULL,
	"result" text DEFAULT 'ok' NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"label" text,
	"backup_version" integer DEFAULT 1 NOT NULL,
	"app_version" text,
	"file_name" text,
	"bytes" integer DEFAULT 0 NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"row_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checksum" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_audit_log" ADD CONSTRAINT "backup_audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_backups" ADD CONSTRAINT "tenant_backups_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_backup_audit_user" ON "backup_audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_tenant_backups_owner" ON "tenant_backups" USING btree ("owner_id","created_at");