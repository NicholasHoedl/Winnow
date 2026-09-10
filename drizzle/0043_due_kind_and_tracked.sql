CREATE TYPE "public"."task_due_kind" AS ENUM('on', 'by');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_kind" "task_due_kind" DEFAULT 'on' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "highlighted" TO "tracked";--> statement-breakpoint
ALTER TABLE "event_exceptions" RENAME COLUMN "highlighted" TO "tracked";