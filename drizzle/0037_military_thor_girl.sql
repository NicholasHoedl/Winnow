ALTER TABLE "event_exceptions" ADD COLUMN "highlighted" boolean;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "highlighted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "slate_horizon_days" integer DEFAULT 7 NOT NULL;