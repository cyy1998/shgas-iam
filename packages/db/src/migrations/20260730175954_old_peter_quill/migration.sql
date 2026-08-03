ALTER TABLE "user_profile" ADD COLUMN "subject_identifier" uuid;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "name" varchar(64);--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "source_dirty_version" bigint;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "subject_facts" jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_source_dirty_version_positive_check" CHECK ("source_dirty_version" IS NULL OR "source_dirty_version" > 0);--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_subject_facts_object_check" CHECK ("subject_facts" IS NULL OR jsonb_typeof("subject_facts") = 'object');