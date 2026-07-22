CREATE TABLE "chat_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" text NOT NULL,
	"locale" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"file_type" text NOT NULL,
	"source_file_url" text,
	"summary" text,
	"parties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deliverables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deadlines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timecodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"track_matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"degraded" boolean DEFAULT false,
	"source_text_length" integer DEFAULT 0,
	"truncated" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "position_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"url" text NOT NULL,
	"project" text,
	"company" text,
	"person" text,
	"details" text,
	"contacts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lang" text,
	"score" integer DEFAULT 0 NOT NULL,
	"scored_by" text DEFAULT 'rules' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "position_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_url" text NOT NULL,
	"lead_count" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "seo_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audited_url" text NOT NULL,
	"seo_score" integer NOT NULL,
	"accessibility_score" integer NOT NULL,
	"performance_score" integer NOT NULL,
	"best_practices_score" integer NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_summary" text,
	"ai_priorities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "two_factor_secret" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "email_verification_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "pending_email_code" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "pending_email_target" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "pending_email_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "cover_url_wide" text;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "cover_blur_wide" text;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chat_logs_conversation_id_unique" ON "chat_logs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_chat_logs_updated_at" ON "chat_logs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_document_analyses_created_at" ON "document_analyses" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_position_leads_url_unique" ON "position_leads" USING btree ("url");--> statement-breakpoint
CREATE INDEX "idx_position_leads_score" ON "position_leads" USING btree ("score");--> statement-breakpoint
CREATE INDEX "idx_position_leads_status" ON "position_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_position_leads_first_seen" ON "position_leads" USING btree ("first_seen");--> statement-breakpoint
CREATE INDEX "idx_position_reports_created_at" ON "position_reports" USING btree ("created_at");