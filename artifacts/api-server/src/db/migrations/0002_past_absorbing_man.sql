ALTER TABLE "generated_posters" ADD COLUMN "platform" text NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_posters" ADD COLUMN "poster_url" text NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_generated_posters_platform" ON "generated_posters" USING btree ("platform");--> statement-breakpoint
ALTER TABLE "generated_posters" DROP COLUMN "youtube_url";--> statement-breakpoint
ALTER TABLE "generated_posters" DROP COLUMN "instagram_url";