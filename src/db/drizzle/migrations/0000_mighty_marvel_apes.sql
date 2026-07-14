CREATE TABLE IF NOT EXISTS "cocktail_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"path" text NOT NULL,
	"size_bytes" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"username" varchar(100) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"password_hash" varchar(255),
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"wallpaper_id" integer DEFAULT 11,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" varchar(45),
	"user_agent" varchar(500)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"device_type" text,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"challenge" text NOT NULL,
	"type" varchar(20) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"label" varchar(255),
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"base_domain" varchar(255) NOT NULL,
	"agent_key_hash" varchar(255) NOT NULL,
	"capabilities" jsonb NOT NULL,
	"build_slots_total" integer NOT NULL,
	"runtime_slots_total" integer NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nodes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cockpit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cockpit_terminal_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vps_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"connected_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cockpit_vps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"host" varchar(255) NOT NULL,
	"port" integer DEFAULT 22 NOT NULL,
	"username" varchar(255) NOT NULL,
	"encrypted_password" text NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"server_fingerprint" varchar(255),
	"last_error" text,
	"verified_at" timestamp with time zone,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cocktail_device_secrets" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"secret_hash" text NOT NULL,
	"encrypted_secret" text,
	"secret_created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"secret_last_used_at" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cocktail_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vps_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" varchar(50) DEFAULT 'enrolling' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"enrolled_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"agent_version" text,
	"os" text,
	"arch" text,
	"hostname" text,
	"last_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cocktail_devices_vps_id_unique" UNIQUE("vps_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cocktail_enrollment_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cocktail_fs_cache" (
	"device_id" uuid NOT NULL,
	"path" text NOT NULL,
	"items" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cocktail_fs_cache_pk" UNIQUE("device_id","path")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cocktail_metrics_latest" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"metrics" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cocktail_processes_latest" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"items" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cocktail_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'queued' NOT NULL,
	"lease_id" text,
	"leased_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cocktail_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"vps_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"mime_type" text,
	"dest_path" text NOT NULL,
	"status" varchar(20) DEFAULT 'INIT' NOT NULL,
	"sha256" text,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_transfers" ADD CONSTRAINT "cocktail_transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_transfers" ADD CONSTRAINT "cocktail_transfers_device_id_cocktail_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."cocktail_devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cockpit_notes" ADD CONSTRAINT "cockpit_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cockpit_terminal_sessions" ADD CONSTRAINT "cockpit_terminal_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cockpit_terminal_sessions" ADD CONSTRAINT "cockpit_terminal_sessions_vps_id_cockpit_vps_id_fk" FOREIGN KEY ("vps_id") REFERENCES "public"."cockpit_vps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cockpit_vps" ADD CONSTRAINT "cockpit_vps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_device_secrets" ADD CONSTRAINT "cocktail_device_secrets_device_id_cocktail_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."cocktail_devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_devices" ADD CONSTRAINT "cocktail_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_devices" ADD CONSTRAINT "cocktail_devices_vps_id_cockpit_vps_id_fk" FOREIGN KEY ("vps_id") REFERENCES "public"."cockpit_vps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_enrollment_tokens" ADD CONSTRAINT "cocktail_enrollment_tokens_device_id_cocktail_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."cocktail_devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_fs_cache" ADD CONSTRAINT "cocktail_fs_cache_device_id_cocktail_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."cocktail_devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_metrics_latest" ADD CONSTRAINT "cocktail_metrics_latest_device_id_cocktail_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."cocktail_devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_processes_latest" ADD CONSTRAINT "cocktail_processes_latest_device_id_cocktail_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."cocktail_devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_tasks" ADD CONSTRAINT "cocktail_tasks_device_id_cocktail_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."cocktail_devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_uploads" ADD CONSTRAINT "cocktail_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_uploads" ADD CONSTRAINT "cocktail_uploads_device_id_cocktail_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."cocktail_devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cocktail_uploads" ADD CONSTRAINT "cocktail_uploads_vps_id_cockpit_vps_id_fk" FOREIGN KEY ("vps_id") REFERENCES "public"."cockpit_vps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cocktail_transfers_device_id_status_idx" ON "cocktail_transfers" USING btree ("device_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cocktail_transfers_user_id_idx" ON "cocktail_transfers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passkeys_user_id_idx" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passkeys_credential_id_idx" ON "passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webauthn_challenges_user_id_idx" ON "webauthn_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webauthn_challenges_expires_at_idx" ON "webauthn_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cockpit_notes_user_id_idx" ON "cockpit_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cockpit_terminal_sessions_user_id_idx" ON "cockpit_terminal_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cockpit_terminal_sessions_vps_id_idx" ON "cockpit_terminal_sessions" USING btree ("vps_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cockpit_vps_user_id_idx" ON "cockpit_vps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cocktail_devices_user_id_idx" ON "cocktail_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cocktail_devices_vps_id_idx" ON "cocktail_devices" USING btree ("vps_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cocktail_devices_status_idx" ON "cocktail_devices" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cocktail_devices_last_seen_at_idx" ON "cocktail_devices" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cocktail_fs_cache_device_path_idx" ON "cocktail_fs_cache" USING btree ("device_id","path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cocktail_tasks_device_id_status_idx" ON "cocktail_tasks" USING btree ("device_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cocktail_tasks_status_lease_expires_at_idx" ON "cocktail_tasks" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cocktail_uploads_user_id_idx" ON "cocktail_uploads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cocktail_uploads_vps_id_idx" ON "cocktail_uploads" USING btree ("vps_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cocktail_uploads_status_idx" ON "cocktail_uploads" USING btree ("status");