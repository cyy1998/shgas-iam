ALTER TABLE "organization" ADD COLUMN "custom_attributes" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "position" ADD COLUMN "custom_attributes" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_custom_attributes_object_check" CHECK (jsonb_typeof("custom_attributes") = 'object');--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_custom_attributes_object_check" CHECK (jsonb_typeof("custom_attributes") = 'object');