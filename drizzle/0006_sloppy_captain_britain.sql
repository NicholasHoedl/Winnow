CREATE TYPE "public"."recurrence_monthly_mode" AS ENUM('day_of_month', 'nth_weekday');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "recurrence_weekdays" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "recurrence_monthly_mode" "recurrence_monthly_mode" DEFAULT 'day_of_month' NOT NULL;