CREATE TYPE "public"."transaction_recurrence_freq" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."transaction_recurrence_monthly_mode" AS ENUM('day_of_month', 'nth_weekday');--> statement-breakpoint
CREATE TABLE "transaction_recurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"amount_cents" integer NOT NULL,
	"type" "transaction_type" NOT NULL,
	"payee" text,
	"description" text,
	"freq" "transaction_recurrence_freq" NOT NULL,
	"recurrence_interval" integer DEFAULT 1 NOT NULL,
	"weekdays" integer DEFAULT 0 NOT NULL,
	"monthly_mode" "transaction_recurrence_monthly_mode" DEFAULT 'day_of_month' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"posted_through" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "occurrence_date" date;--> statement-breakpoint
ALTER TABLE "transaction_recurrences" ADD CONSTRAINT "transaction_recurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_recurrences" ADD CONSTRAINT "transaction_recurrences_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_recurrences_user" ON "transaction_recurrences" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_series_id_transaction_recurrences_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."transaction_recurrences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_series_occurrence" UNIQUE("series_id","occurrence_date");