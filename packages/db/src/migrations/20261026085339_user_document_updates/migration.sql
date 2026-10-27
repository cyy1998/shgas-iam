CREATE TABLE "user_document_outbox" (
	"id" uuid PRIMARY KEY,
	"source" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"processing_token" uuid,
	"processing_started_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"rebuild_requests" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_document_outbox_status_check" CHECK ("status" IN ('pending','processing','processed','failed')),
	CONSTRAINT "user_document_outbox_processing_check" CHECK (("status" = 'processing') = ("processing_token" IS NOT NULL AND "processing_started_at" IS NOT NULL)),
	CONSTRAINT "user_document_outbox_source_object_check" CHECK (jsonb_typeof("source") = 'object'),
	CONSTRAINT "user_document_outbox_requests_array_check" CHECK (jsonb_typeof("rebuild_requests") = 'array'),
	CONSTRAINT "user_document_outbox_attempts_check" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "user_profile_dirty" RENAME TO "user_document_rebuild_state";--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" RENAME COLUMN "dirty_version" TO "version";--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" RENAME COLUMN "create_time" TO "created_at";--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" RENAME COLUMN "update_time" TO "updated_at";--> statement-breakpoint
ALTER INDEX "user_profile_dirty_status_idx" RENAME TO "user_document_rebuild_state_status_idx";--> statement-breakpoint
ALTER INDEX "user_profile_dirty_status_dirty_at_idx" RENAME TO "user_document_rebuild_state_status_dirty_at_idx";--> statement-breakpoint
ALTER INDEX "user_profile_dirty_status_processing_started_at_idx" RENAME TO "user_document_rebuild_state_status_processing_started_at_idx";--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD COLUMN "processing_token" uuid;--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD COLUMN "request_id" varchar(128);--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD COLUMN "trace_id" varchar(128);--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD COLUMN "post_publication_version" bigint;--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD COLUMN "post_publication_status" text;--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD COLUMN "post_publication_token" uuid;--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD COLUMN "post_publication_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD COLUMN "post_publication_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD COLUMN "post_publication_error" text;--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD COLUMN "post_publication_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "user_document_outbox_status_created_at_idx" ON "user_document_outbox" ("status","created_at");--> statement-breakpoint
CREATE INDEX "user_document_outbox_processing_idx" ON "user_document_outbox" ("status","processing_started_at");--> statement-breakpoint
CREATE INDEX "user_document_outbox_source_gin_idx" ON "user_document_outbox" USING gin ("source");--> statement-breakpoint
CREATE INDEX "user_document_rebuild_state_post_publication_idx" ON "user_document_rebuild_state" ("post_publication_status","post_publication_started_at");--> statement-breakpoint
UPDATE "user_document_rebuild_state" SET "processing_token"=gen_random_uuid() WHERE "status"='processing';--> statement-breakpoint
UPDATE "user_document_rebuild_state" AS state SET "post_publication_version"=profile.source_dirty_version, "post_publication_status"='pending' FROM "user_profile" AS profile WHERE state.user_id=profile.user_id AND profile.source_dirty_version IS NOT NULL;--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD CONSTRAINT "user_document_rebuild_state_version_positive_check" CHECK ("version" > 0);--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD CONSTRAINT "user_document_rebuild_state_processing_check" CHECK (("status" = 'processing') = ("processing_token" IS NOT NULL AND "processing_started_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "user_document_rebuild_state" ADD CONSTRAINT "user_document_rebuild_state_post_publication_check" CHECK (("post_publication_status" IS NULL AND "post_publication_version" IS NULL AND "post_publication_token" IS NULL AND "post_publication_started_at" IS NULL) OR ("post_publication_status" IS NOT NULL AND "post_publication_version" IS NOT NULL AND "post_publication_version" > 0 AND "post_publication_status" IN ('pending','processing','processed','failed') AND (("post_publication_status" = 'processing') = ("post_publication_token" IS NOT NULL AND "post_publication_started_at" IS NOT NULL))));
