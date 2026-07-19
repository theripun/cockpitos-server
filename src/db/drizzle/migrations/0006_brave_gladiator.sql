CREATE TABLE IF NOT EXISTS "user_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" varchar(40) DEFAULT 'free' NOT NULL,
	"status" varchar(40) DEFAULT 'active' NOT NULL,
	"source" varchar(80) DEFAULT 'developer_grant' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_subscriptions_user_id_unique_idx" ON "user_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_subscriptions_user_id_idx" ON "user_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_subscriptions_plan_status_idx" ON "user_subscriptions" USING btree ("plan","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_subscriptions_ends_at_idx" ON "user_subscriptions" USING btree ("ends_at");