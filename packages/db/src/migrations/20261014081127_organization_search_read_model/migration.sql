CREATE TABLE "organization_search_change" (
	"id" uuid PRIMARY KEY,
	"organization_id" integer NOT NULL,
	"scope" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"processing_token" uuid,
	"processing_started_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"rebuild_requests" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_search_change_organization_id_positive_check" CHECK ("organization_id" > 0),
	CONSTRAINT "organization_search_change_scope_check" CHECK ("scope" IN ('self', 'subtree')),
	CONSTRAINT "organization_search_change_status_check" CHECK ("status" IN ('pending', 'processing', 'processed', 'failed')),
	CONSTRAINT "organization_search_change_attempts_check" CHECK ("attempts" >= 0),
	CONSTRAINT "organization_search_change_processing_check" CHECK (("status" = 'processing') = ("processing_token" IS NOT NULL AND "processing_started_at" IS NOT NULL)),
	CONSTRAINT "organization_search_change_requests_array_check" CHECK (jsonb_typeof("rebuild_requests") = 'array')
);
--> statement-breakpoint
CREATE TABLE "organization_search_dirty" (
	"organization_id" integer PRIMARY KEY,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"processing_token" uuid,
	"processing_started_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"dirty_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_search_dirty_organization_id_positive_check" CHECK ("organization_id" > 0),
	CONSTRAINT "organization_search_dirty_version_positive_check" CHECK ("version" > 0),
	CONSTRAINT "organization_search_dirty_status_check" CHECK ("status" IN ('pending', 'processing', 'processed', 'failed')),
	CONSTRAINT "organization_search_dirty_attempts_check" CHECK ("attempts" >= 0),
	CONSTRAINT "organization_search_dirty_processing_check" CHECK (("status" = 'processing') = ("processing_token" IS NOT NULL AND "processing_started_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "organization_search_document" (
	"organization_id" integer PRIMARY KEY,
	"document" jsonb,
	"schema_version" integer NOT NULL,
	"source_version" bigint NOT NULL,
	"search_visible" boolean NOT NULL,
	"rebuilt_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_search_document_organization_id_positive_check" CHECK ("organization_id" > 0),
	CONSTRAINT "organization_search_document_schema_version_positive_check" CHECK ("schema_version" > 0),
	CONSTRAINT "organization_search_document_source_version_positive_check" CHECK ("source_version" > 0),
	CONSTRAINT "organization_search_document_object_check" CHECK ("document" IS NULL OR jsonb_typeof("document") = 'object'),
	CONSTRAINT "organization_search_document_visibility_check" CHECK ("search_visible" = ("document" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "organization_search_change_status_created_at_idx" ON "organization_search_change" ("status","created_at");--> statement-breakpoint
CREATE INDEX "organization_search_change_status_processing_started_at_idx" ON "organization_search_change" ("status","processing_started_at");--> statement-breakpoint
CREATE INDEX "organization_search_dirty_status_dirty_at_idx" ON "organization_search_dirty" ("status","dirty_at");--> statement-breakpoint
CREATE INDEX "organization_search_dirty_status_processing_started_at_idx" ON "organization_search_dirty" ("status","processing_started_at");--> statement-breakpoint
CREATE INDEX "organization_search_document_visible_schema_idx" ON "organization_search_document" ("search_visible","schema_version");--> statement-breakpoint
CREATE INDEX "organization_search_document_document_gin_idx" ON "organization_search_document" USING gin ("document");