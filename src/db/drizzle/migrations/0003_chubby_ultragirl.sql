CREATE TABLE IF NOT EXISTS "user_activity_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_ip_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_location_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy" double precision,
	"ip_address" varchar(45),
	"user_agent" text,
	"page" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_activity_daily" ADD CONSTRAINT "user_activity_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_ip_logs" ADD CONSTRAINT "user_ip_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_location_logs" ADD CONSTRAINT "user_location_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_activity_daily_user_id_idx" ON "user_activity_daily" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_activity_daily_date_idx" ON "user_activity_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_ip_logs_user_id_idx" ON "user_ip_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_ip_logs_ip_address_idx" ON "user_ip_logs" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_location_logs_user_id_idx" ON "user_location_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_location_logs_created_at_idx" ON "user_location_logs" USING btree ("created_at");