-- HAND-EDITED. drizzle-kit emitted `ADD COLUMN "effective_from" date NOT NULL` with no
-- default, which fails outright on a table that already has rows. Split into
-- add-nullable → backfill → set-not-null so an existing install migrates cleanly.
--
-- The backfill value is the point of this migration. '1970-01-01' means "these targets
-- have always been in effect", so every day already logged keeps scoring against the
-- numbers it has always been scored against. Using created_at::date instead would
-- silently flip every day before the user first set targets to "no target at all",
-- which is the exact history-rewriting this change exists to prevent.
ALTER TABLE "macro_targets" ADD COLUMN "effective_from" date;--> statement-breakpoint
UPDATE "macro_targets" SET "effective_from" = '1970-01-01' WHERE "effective_from" IS NULL;--> statement-breakpoint
ALTER TABLE "macro_targets" ALTER COLUMN "effective_from" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "macro_targets" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- One row per user becomes one row per period.
ALTER TABLE "macro_targets" DROP CONSTRAINT "macro_targets_user_id_unique";--> statement-breakpoint
ALTER TABLE "macro_targets" ADD CONSTRAINT "macro_targets_user_effective" UNIQUE("user_id","effective_from");
