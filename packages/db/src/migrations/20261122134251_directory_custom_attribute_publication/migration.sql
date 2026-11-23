ALTER TABLE "organization_document_outbox" ADD COLUMN "attribute_code" text;--> statement-breakpoint
ALTER TABLE "organization_document_outbox" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_document_outbox" ALTER COLUMN "scope" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_document_outbox" ADD CONSTRAINT "organization_document_outbox_source_check" CHECK ((
        "organization_id" IS NOT NULL AND "scope" IS NOT NULL AND "attribute_code" IS NULL
      ) OR (
        "organization_id" IS NULL AND "scope" IS NULL AND "attribute_code" IS NOT NULL
        AND "attribute_code" ~ '^[a-z][a-z0-9_]{0,63}$'
      ));