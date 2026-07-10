CREATE TABLE "composer_portraits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text,
	"portrait_url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"locale" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "generated_posters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"template_name" text,
	"portrait_id" uuid,
	"youtube_url" text NOT NULL,
	"instagram_url" text NOT NULL,
	"prompt_used" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "poster_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"youtube_template_url" text NOT NULL,
	"instagram_template_url" text NOT NULL,
	"default_prompt" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "composer_identity" ALTER COLUMN "awards" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "composer_identity" ALTER COLUMN "awards" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tracks" ALTER COLUMN "dominant_colors" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "concept" text;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_posters" ADD CONSTRAINT "generated_posters_template_id_poster_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."poster_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_posters" ADD CONSTRAINT "generated_posters_portrait_id_composer_portraits_id_fk" FOREIGN KEY ("portrait_id") REFERENCES "public"."composer_portraits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_composer_portraits_sort_order" ON "composer_portraits" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_content_entries_key_locale_unique" ON "content_entries" USING btree ("key","locale");--> statement-breakpoint
CREATE INDEX "idx_generated_posters_created_at" ON "generated_posters" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_poster_templates_sort_order" ON "poster_templates" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_api_keys_key_name" ON "api_keys" USING btree ("key_name");--> statement-breakpoint
CREATE INDEX "idx_briefs_is_read" ON "briefs" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "idx_pipeline_jobs_track_id" ON "pipeline_jobs" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "idx_projects_composer_id" ON "projects" USING btree ("composer_id");--> statement-breakpoint
CREATE INDEX "idx_staging_drafts_entity_id" ON "staging_drafts" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_tracks_sort_order" ON "tracks" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_tracks_is_live" ON "tracks" USING btree ("is_live");--> statement-breakpoint
CREATE INDEX "idx_tracks_concept" ON "tracks" USING btree ("concept");