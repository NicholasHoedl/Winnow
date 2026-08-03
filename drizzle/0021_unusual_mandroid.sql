CREATE TABLE "calendar_feed_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feed_tokens_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "calendar_feed_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "calendar_feed_tokens" ADD CONSTRAINT "calendar_feed_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;