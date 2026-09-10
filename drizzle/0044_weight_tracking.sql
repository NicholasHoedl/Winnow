ALTER TABLE "user_preferences" ADD COLUMN "track_weight" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "goal_weight_lb" real;