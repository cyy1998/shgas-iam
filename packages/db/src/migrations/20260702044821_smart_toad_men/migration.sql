DROP INDEX "user_profile_dirty_processing_started_at_idx";--> statement-breakpoint
ALTER TABLE "user_profile_dirty" ADD COLUMN "dirty_version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "user_profile_dirty_status_processing_started_at_idx" ON "user_profile_dirty" ("status","processing_started_at");