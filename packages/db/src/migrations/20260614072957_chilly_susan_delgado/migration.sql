ALTER TABLE "client" ADD COLUMN "oidc_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "oidc_config" jsonb;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "oidc_secret_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "oidc_config_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "oidc_subject" uuid;--> statement-breakpoint
UPDATE "user" SET "oidc_subject" = gen_random_uuid() WHERE "oidc_subject" IS NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "oidc_subject" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "oidc_subject" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_oidc_subject_key" UNIQUE("oidc_subject");--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_oidc_enabled_config_check" CHECK (NOT "oidc_enabled" OR "oidc_config" IS NOT NULL);
