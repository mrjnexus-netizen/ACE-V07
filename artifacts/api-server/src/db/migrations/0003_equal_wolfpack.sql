CREATE TABLE "model_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"provider_id" text NOT NULL,
	"model_id" text NOT NULL,
	"label" text NOT NULL,
	"quality" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "poster_templates" ADD COLUMN "category" text;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_model_overrides_unique" ON "model_overrides" USING btree ("kind","provider_id","model_id");