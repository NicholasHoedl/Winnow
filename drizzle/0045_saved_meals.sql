CREATE TABLE "saved_meal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"saved_meal_id" uuid NOT NULL,
	"food_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"servings" real DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"serving_label" text NOT NULL,
	"calories" real DEFAULT 0 NOT NULL,
	"protein_g" real DEFAULT 0 NOT NULL,
	"carbs_g" real DEFAULT 0 NOT NULL,
	"fat_g" real DEFAULT 0 NOT NULL,
	"fiber_g" real,
	"sugar_g" real,
	"sat_fat_g" real,
	"sodium_mg" real
);
--> statement-breakpoint
CREATE TABLE "saved_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"meal_type" "meal_type",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD CONSTRAINT "saved_meal_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD CONSTRAINT "saved_meal_items_saved_meal_id_saved_meals_id_fk" FOREIGN KEY ("saved_meal_id") REFERENCES "public"."saved_meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD CONSTRAINT "saved_meal_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meals" ADD CONSTRAINT "saved_meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_meal_items_meal_position" ON "saved_meal_items" USING btree ("saved_meal_id","position");--> statement-breakpoint
CREATE INDEX "saved_meals_user_name" ON "saved_meals" USING btree ("user_id","name");