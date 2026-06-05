CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"narrative" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audio_url" text,
	"cover_url" text,
	"cover_blur" text,
	"dominant_colors" text[] DEFAULT '{}',
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
CREATE INDEX "idx_tracks_sort_order" ON "tracks" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_tracks_is_live" ON "tracks" USING btree ("is_live");