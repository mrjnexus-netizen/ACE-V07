CREATE TABLE IF NOT EXISTS "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"failed_attempts" integer DEFAULT 0,
	"locked_until" timestamp with time zone,
	"last_login" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "admin_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_name" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"is_active" boolean DEFAULT false,
	"tested_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "api_keys_key_name_unique" UNIQUE("key_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"locale" text NOT NULL,
	"budget_range" text,
	"media_type" text,
	"deadline" text,
	"emotional_direction" text,
	"raw_conversation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "composer_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tagline" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"biography" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"awards" jsonb[],
	"studio_address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"portrait_url" text,
	"portrait_blur" text,
	"logo_url" text,
	"hero_video_url" text,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid,
	"status" text DEFAULT 'idle' NOT NULL,
	"progress" integer DEFAULT 0,
	"audio_metadata" jsonb,
	"generated_art_url" text,
	"generated_narrative" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"composer_id" uuid,
	"title" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"type" text NOT NULL,
	"year" integer,
	"description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cover_url" text,
	"cover_blur" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staging_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"draft_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"narrative" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audio_url" text,
	"cover_url" text,
	"cover_blur" text,
	"dominant_colors" text[] DEFAULT '{}'::text[] NOT NULL,
	"vibrant_palette" jsonb,
	"genre" text,
	"bpm" integer,
	"mood" text,
	"key_signature" text,
	"duration" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_live" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_jobs" ADD CONSTRAINT "pipeline_jobs_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_composer_id_composer_identity_id_fk" FOREIGN KEY ("composer_id") REFERENCES "composer_identity"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staging_drafts" ADD CONSTRAINT "staging_drafts_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "admin_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;