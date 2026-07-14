ALTER TABLE "users" ADD COLUMN "otp" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "otp_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_email_verified" boolean DEFAULT false NOT NULL;