CREATE TABLE "user_document" (
	"user_id" integer PRIMARY KEY,
	"subject_identifier" uuid NOT NULL,
	"schema_version" integer NOT NULL,
	"source_version" bigint NOT NULL,
	"published_at" timestamp NOT NULL,
	"document" jsonb,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_document_source_version_positive_check" CHECK ("source_version" > 0),
	CONSTRAINT "user_document_document_object_check" CHECK ("document" IS NULL OR jsonb_typeof("document") = 'object')
);
--> statement-breakpoint
DROP TABLE "user_profile";--> statement-breakpoint
CREATE UNIQUE INDEX "user_document_subject_identifier_idx" ON "user_document" ("subject_identifier");--> statement-breakpoint
CREATE INDEX "user_document_username_idx" ON "user_document" (("document"->'user'->>'username'));--> statement-breakpoint
CREATE INDEX "user_document_schema_version_idx" ON "user_document" ("schema_version");--> statement-breakpoint
CREATE INDEX "user_document_document_gin_idx" ON "user_document" USING gin ("document");