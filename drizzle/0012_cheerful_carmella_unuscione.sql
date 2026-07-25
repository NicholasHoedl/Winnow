CREATE INDEX "budgets_user_period" ON "budgets" USING btree ("user_id","period_month");--> statement-breakpoint
CREATE INDEX "transactions_user_date" ON "transactions" USING btree ("user_id","date");