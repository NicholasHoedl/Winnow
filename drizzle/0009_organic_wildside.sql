CREATE TYPE "public"."task_recurrence_freq" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."task_recurrence_monthly_mode" AS ENUM('day_of_month', 'nth_weekday');--> statement-breakpoint
CREATE TABLE "task_recurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"list_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"freq" "task_recurrence_freq" NOT NULL,
	"recurrence_interval" integer DEFAULT 1 NOT NULL,
	"weekdays" integer DEFAULT 0 NOT NULL,
	"monthly_mode" "task_recurrence_monthly_mode" DEFAULT 'day_of_month' NOT NULL,
	"flexible" boolean DEFAULT false NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "occurrence_date" date;--> statement-breakpoint
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_series_id_task_recurrences_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."task_recurrences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_series_occurrence" UNIQUE("series_id","occurrence_date");