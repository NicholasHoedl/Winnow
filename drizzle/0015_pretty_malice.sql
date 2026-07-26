CREATE INDEX "foods_user_name" ON "foods" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "meal_entries_user_date" ON "meal_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "meal_entries_user_created" ON "meal_entries" USING btree ("user_id","created_at");