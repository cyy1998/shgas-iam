CREATE TABLE "user_profile_dirty" (
	"user_id" integer PRIMARY KEY,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reason_codes" jsonb DEFAULT '[]' NOT NULL,
	"dirty_at" timestamp DEFAULT now() NOT NULL,
	"processing_started_at" timestamp,
	"processed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_job_id" varchar(255),
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"user_id" integer PRIMARY KEY,
	"username" varchar(64) NOT NULL,
	"mobile" varchar(20),
	"wx_id" varchar(255),
	"status" integer NOT NULL,
	"is_delete" boolean DEFAULT false NOT NULL,
	"search_visible" boolean DEFAULT false NOT NULL,
	"profile_schema_version" integer NOT NULL,
	"detail" jsonb NOT NULL,
	"search_doc" jsonb NOT NULL,
	"rebuilt_at" timestamp DEFAULT now() NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_profile_dirty_status_idx" ON "user_profile_dirty" ("status");--> statement-breakpoint
CREATE INDEX "user_profile_dirty_status_dirty_at_idx" ON "user_profile_dirty" ("status","dirty_at");--> statement-breakpoint
CREATE INDEX "user_profile_dirty_processing_started_at_idx" ON "user_profile_dirty" ("processing_started_at");--> statement-breakpoint
CREATE INDEX "user_profile_username_idx" ON "user_profile" ("username");--> statement-breakpoint
CREATE INDEX "user_profile_mobile_idx" ON "user_profile" ("mobile");--> statement-breakpoint
CREATE INDEX "user_profile_wx_id_idx" ON "user_profile" ("wx_id");--> statement-breakpoint
CREATE INDEX "user_profile_visible_schema_version_idx" ON "user_profile" ("search_visible","profile_schema_version");--> statement-breakpoint
CREATE INDEX "user_profile_search_doc_gin_idx" ON "user_profile" USING gin ("search_doc");