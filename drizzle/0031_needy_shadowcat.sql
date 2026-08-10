ALTER TABLE "user_preferences" ADD COLUMN "ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "ai_provider" text DEFAULT 'openai' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "ai_base_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "ai_model" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "ai_api_key" text DEFAULT '' NOT NULL;