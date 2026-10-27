CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."refresh_token_status" AS ENUM('ACTIVE', 'ROTATED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('PENDING', 'IN_PROGRESS', 'SUCCESS', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('SET_PASSWD', 'SET_NETWORK_STRING');--> statement-breakpoint
CREATE TYPE "public"."assign_action" AS ENUM('install', 'uninstall');--> statement-breakpoint
CREATE TYPE "public"."assign_type" AS ENUM('include', 'exclude');--> statement-breakpoint
CREATE TYPE "public"."detection_type" AS ENUM('file', 'registry');--> statement-breakpoint
CREATE TYPE "public"."install_status" AS ENUM('PENDING', 'INSTALLING', 'INSTALLED', 'ERROR', 'UNINSTALLED');--> statement-breakpoint
CREATE TYPE "public"."installer_type" AS ENUM('winget', 'win32');--> statement-breakpoint
CREATE TYPE "public"."script_engine" AS ENUM('powershell');--> statement-breakpoint
CREATE TYPE "public"."script_phase" AS ENUM('pre', 'post');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp (3) with time zone,
	"refresh_token_expires_at" timestamp (3) with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"object_key" text NOT NULL,
	"size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text,
	"original_name" text,
	CONSTRAINT "files_objectKey_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "computers" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"jkt" text,
	"rustdesk_id" bigint,
	"ip" text,
	"os" text,
	"os_version" text,
	"login_user" text,
	"client_version" text,
	"intune_id" text,
	"last_connection" timestamp (3) with time zone,
	"last_inventory_at" timestamp (3) with time zone,
	"hardware" jsonb,
	"search_text" text GENERATED ALWAYS AS (lower(name || ' ' || coalesce(login_user, ''))) STORED
);
--> statement-breakpoint
CREATE TABLE "enrollment_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"token_hash" text NOT NULL,
	"name" text,
	"token_fragment" text,
	"remaining_uses" integer NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp (3) with time zone,
	"last_used_at" timestamp (3) with time zone,
	CONSTRAINT "enrollment_tokens_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"computer_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"jkt" text NOT NULL,
	"status" "refresh_token_status" NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"grace_until" timestamp (3) with time zone,
	"last_used_at" timestamp (3) with time zone,
	CONSTRAINT "refresh_tokens_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "computer_group_members" (
	"group_id" text NOT NULL,
	"computer_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "computer_group_members_group_id_computer_id_pk" PRIMARY KEY("group_id","computer_id")
);
--> statement-breakpoint
CREATE TABLE "computer_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"display_name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "dynamic_computer_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"rule_expression" jsonb NOT NULL,
	"last_evaluated_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "dynamic_group_members" (
	"group_id" text NOT NULL,
	"computer_id" text NOT NULL,
	"added_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "dynamic_group_members_group_id_computer_id_pk" PRIMARY KEY("group_id","computer_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"computer_id" text NOT NULL,
	"task_type" "task_type" NOT NULL,
	"status" "task_status" NOT NULL,
	"task_data" jsonb,
	"error" text,
	"started_at" timestamp (3) with time zone,
	"finish_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"publisher" text NOT NULL,
	"auto_update" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "computer_apps_installs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"computer_id" text NOT NULL,
	"app_id" text NOT NULL,
	"status" "install_status" NOT NULL,
	"release_id" text,
	"error" text,
	"installed_at" timestamp (3) with time zone,
	"last_seen_at" timestamp (3) with time zone,
	"status_updated_at" timestamp (3) with time zone,
	"reinstall_requested_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "computer_group_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"release_id" text NOT NULL,
	"group_id" text NOT NULL,
	"assign_type" "assign_type" NOT NULL,
	"action" "assign_action" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "detection_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"release_id" text NOT NULL,
	"type" "detection_type" NOT NULL,
	"config" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dynamic_group_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"release_id" text NOT NULL,
	"group_id" text NOT NULL,
	"assign_type" "assign_type" NOT NULL,
	"action" "assign_action" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"release_id" text NOT NULL,
	"timeout_seconds" integer NOT NULL,
	"run_as_system" boolean NOT NULL,
	"script_name" text NOT NULL,
	"file_id" text NOT NULL,
	"hash" text NOT NULL,
	"byte_size" bigint
);
--> statement-breakpoint
CREATE TABLE "release_scripts" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"release_id" text NOT NULL,
	"phase" "script_phase" NOT NULL,
	"engine" "script_engine" NOT NULL,
	"timeout_seconds" integer NOT NULL,
	"run_as_system" boolean NOT NULL,
	"script_name" text NOT NULL,
	"file_id" text,
	"hash" text NOT NULL,
	"byte_size" bigint
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"app_id" text NOT NULL,
	"version" text NOT NULL,
	"installer_type" "installer_type" NOT NULL,
	"disabled_at" timestamp (3) with time zone,
	"uninstall_previous" boolean NOT NULL,
	"version_sort_key" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "win32_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"release_id" text NOT NULL,
	"installer_name" text NOT NULL,
	"install_binary_file_id" text NOT NULL,
	"hash" text NOT NULL,
	"install_script" text NOT NULL,
	"uninstall_script" text NOT NULL,
	"install_binary_size" bigint,
	CONSTRAINT "win32_releases_releaseId_unique" UNIQUE("release_id")
);
--> statement-breakpoint
CREATE TABLE "winget_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"release_id" text NOT NULL,
	"winget_id" text NOT NULL,
	CONSTRAINT "winget_releases_releaseId_unique" UNIQUE("release_id")
);
--> statement-breakpoint
CREATE TABLE "client_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" text NOT NULL,
	"file_id" text NOT NULL,
	"hash" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"file_name" text,
	"mime_type" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"notes" text,
	"version_sort_key" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE UNLOGGED TABLE "dpop_jti" (
	"jti" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_computer_id_computers_id_fk" FOREIGN KEY ("computer_id") REFERENCES "public"."computers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_group_members" ADD CONSTRAINT "computer_group_members_group_id_computer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."computer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_group_members" ADD CONSTRAINT "computer_group_members_computer_id_computers_id_fk" FOREIGN KEY ("computer_id") REFERENCES "public"."computers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dynamic_group_members" ADD CONSTRAINT "dynamic_group_members_group_id_dynamic_computer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."dynamic_computer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dynamic_group_members" ADD CONSTRAINT "dynamic_group_members_computer_id_computers_id_fk" FOREIGN KEY ("computer_id") REFERENCES "public"."computers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_computer_id_computers_id_fk" FOREIGN KEY ("computer_id") REFERENCES "public"."computers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_apps_installs" ADD CONSTRAINT "computer_apps_installs_computer_id_computers_id_fk" FOREIGN KEY ("computer_id") REFERENCES "public"."computers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_apps_installs" ADD CONSTRAINT "computer_apps_installs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_apps_installs" ADD CONSTRAINT "computer_apps_installs_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_group_releases" ADD CONSTRAINT "computer_group_releases_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_group_releases" ADD CONSTRAINT "computer_group_releases_group_id_computer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."computer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detection_rules" ADD CONSTRAINT "detection_rules_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dynamic_group_releases" ADD CONSTRAINT "dynamic_group_releases_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dynamic_group_releases" ADD CONSTRAINT "dynamic_group_releases_group_id_dynamic_computer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."dynamic_computer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_requirements" ADD CONSTRAINT "release_requirements_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_requirements" ADD CONSTRAINT "release_requirements_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_scripts" ADD CONSTRAINT "release_scripts_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_scripts" ADD CONSTRAINT "release_scripts_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "win32_releases" ADD CONSTRAINT "win32_releases_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "win32_releases" ADD CONSTRAINT "win32_releases_install_binary_file_id_files_id_fk" FOREIGN KEY ("install_binary_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winget_releases" ADD CONSTRAINT "winget_releases_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_updates" ADD CONSTRAINT "client_updates_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "files_created_at_idx" ON "files" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "computers_jkt_unique" ON "computers" USING btree ("jkt") WHERE jkt is not null;--> statement-breakpoint
CREATE INDEX "computers_created_at_idx" ON "computers" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "computers_name_idx" ON "computers" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "computers_os_idx" ON "computers" USING btree ("os");--> statement-breakpoint
CREATE INDEX "computers_search_trgm" ON "computers" USING gin (search_text gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "computers_name_trgm" ON "computers" USING gin (lower(name) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "enrollment_tokens_created_at_idx" ON "enrollment_tokens" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_status_expires_at_idx" ON "refresh_tokens" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "refresh_tokens_computer_status_idx" ON "refresh_tokens" USING btree ("computer_id","status");--> statement-breakpoint
CREATE INDEX "computer_group_members_computer_id_idx" ON "computer_group_members" USING btree ("computer_id");--> statement-breakpoint
CREATE INDEX "computer_groups_display_name_idx" ON "computer_groups" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "computer_groups_created_at_idx" ON "computer_groups" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "dynamic_computer_groups_display_name_idx" ON "dynamic_computer_groups" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "dynamic_computer_groups_created_at_idx" ON "dynamic_computer_groups" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "dynamic_group_members_computer_id_idx" ON "dynamic_group_members" USING btree ("computer_id");--> statement-breakpoint
CREATE INDEX "dynamic_group_members_group_added_idx" ON "dynamic_group_members" USING btree ("group_id","added_at");--> statement-breakpoint
CREATE INDEX "tasks_computer_status_idx" ON "tasks" USING btree ("computer_id","status");--> statement-breakpoint
CREATE INDEX "apps_display_name_idx" ON "apps" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "apps_created_at_idx" ON "apps" USING btree ("created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "computer_apps_installs_computer_app_unique" ON "computer_apps_installs" USING btree ("computer_id","app_id");--> statement-breakpoint
CREATE INDEX "computer_apps_installs_app_status_idx" ON "computer_apps_installs" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "computer_apps_installs_app_updated_idx" ON "computer_apps_installs" USING btree ("app_id","status_updated_at","id");--> statement-breakpoint
CREATE INDEX "computer_apps_installs_release_idx" ON "computer_apps_installs" USING btree ("release_id");--> statement-breakpoint
CREATE UNIQUE INDEX "computer_group_releases_release_group_unique" ON "computer_group_releases" USING btree ("release_id","group_id");--> statement-breakpoint
CREATE INDEX "computer_group_releases_group_idx" ON "computer_group_releases" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "detection_rules_release_idx" ON "detection_rules" USING btree ("release_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dynamic_group_releases_release_group_unique" ON "dynamic_group_releases" USING btree ("release_id","group_id");--> statement-breakpoint
CREATE INDEX "dynamic_group_releases_group_idx" ON "dynamic_group_releases" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "release_requirements_release_idx" ON "release_requirements" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "release_requirements_file_idx" ON "release_requirements" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "release_scripts_release_idx" ON "release_scripts" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "release_scripts_file_idx" ON "release_scripts" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "releases_app_version_idx" ON "releases" USING btree ("app_id","version");--> statement-breakpoint
CREATE INDEX "releases_app_sort_idx" ON "releases" USING btree ("app_id","version_sort_key","id");--> statement-breakpoint
CREATE INDEX "win32_releases_file_idx" ON "win32_releases" USING btree ("install_binary_file_id");--> statement-breakpoint
CREATE INDEX "client_updates_version_idx" ON "client_updates" USING btree ("version");--> statement-breakpoint
CREATE INDEX "client_updates_version_sort_idx" ON "client_updates" USING btree ("version_sort_key","id");--> statement-breakpoint
CREATE INDEX "client_updates_file_idx" ON "client_updates" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_updates_single_active" ON "client_updates" USING btree ("is_active") WHERE is_active;