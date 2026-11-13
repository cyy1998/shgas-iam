ALTER TABLE "client" ADD COLUMN "admission_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "admission_filter" jsonb;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_admission_enabled_filter_check" CHECK (NOT "admission_enabled" OR "admission_filter" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_admission_filter_object_check" CHECK ("admission_filter" IS NULL OR jsonb_typeof("admission_filter") = 'object');