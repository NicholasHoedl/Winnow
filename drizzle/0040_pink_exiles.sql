ALTER TABLE "user_preferences" ADD COLUMN "date_format" text DEFAULT 'mdy' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "weight_unit" text DEFAULT 'lb' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "volume_unit" text DEFAULT 'floz' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "dashboard_calendar_view" text DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "landing_page" text DEFAULT '/' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "default_meal_type" text;