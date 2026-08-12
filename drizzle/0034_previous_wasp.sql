CREATE TYPE "public"."routine_unfinished" AS ENUM('keep', 'drop');--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "on_unfinished" "routine_unfinished" DEFAULT 'keep' NOT NULL;