ALTER TABLE "tasks" ADD COLUMN "routine_id" uuid;--> statement-breakpoint
-- The statement below is HAND-WRITTEN; drizzle-kit did not generate it and cannot see it.
-- `todos/schema.ts` declares `routine_id` without `.references()` on purpose: naming the
-- target table would import `routines/schema.ts`, which already imports `priorityEnum`
-- back from todos and reads it EAGERLY at table-definition time — so the pair would be
-- circular and whichever module evaluated second would crash on an undefined enum.
-- The constraint is real all the same, and matches how `goal_id` and `event_id` behave:
-- deleting a routine detaches the tasks its runs created rather than deleting real work.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;
