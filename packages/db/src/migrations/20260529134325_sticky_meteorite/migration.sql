CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY,
	"event_time" timestamp(0) DEFAULT now() NOT NULL,
	"action" varchar(128) NOT NULL,
	"outcome" varchar(16) NOT NULL,
	"actor_type" varchar(32) NOT NULL,
	"actor_user_id" integer,
	"actor_username" varchar(64),
	"actor_client_code" varchar(64),
	"actor_system_key" varchar(128),
	"target_type" varchar(64) NOT NULL,
	"target_id" integer,
	"target_code" varchar(128),
	"source_app" varchar(32) NOT NULL,
	"request_id" varchar(128),
	"trace_id" varchar(128),
	"ip" varchar(64),
	"user_agent" varchar(512),
	"route" varchar(255),
	"method" varchar(16),
	"details" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_log_event_time_idx" ON "audit_log" ("event_time");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" ("action");--> statement-breakpoint
CREATE INDEX "audit_log_outcome_idx" ON "audit_log" ("outcome");--> statement-breakpoint
CREATE INDEX "audit_log_actor_user_idx" ON "audit_log" ("actor_type","actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_username_idx" ON "audit_log" ("actor_type","actor_username");--> statement-breakpoint
CREATE INDEX "audit_log_actor_client_code_idx" ON "audit_log" ("actor_type","actor_client_code");--> statement-breakpoint
CREATE INDEX "audit_log_actor_system_key_idx" ON "audit_log" ("actor_type","actor_system_key");--> statement-breakpoint
CREATE INDEX "audit_log_target_id_idx" ON "audit_log" ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_target_code_idx" ON "audit_log" ("target_type","target_code");--> statement-breakpoint
CREATE INDEX "audit_log_request_id_idx" ON "audit_log" ("request_id");