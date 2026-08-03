ALTER TABLE "client" ADD COLUMN "custom_sso_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "custom_sso_config" jsonb;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "custom_sso_secret_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "custom_sso_config_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_custom_sso_state_check" CHECK ((
      ("custom_sso_config" IS NULL AND NOT "custom_sso_enabled" AND "custom_sso_secret_hash" IS NULL)
      OR
      (
        "custom_sso_config" IS NOT NULL
        AND (
          ("custom_sso_config"->>'mode' = 'gateway' AND "custom_sso_secret_hash" IS NULL)
          OR
          ("custom_sso_config"->>'mode' = 'independent' AND "custom_sso_secret_hash" IS NOT NULL)
        )
      )
    ));--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_custom_sso_config_version_check" CHECK ("custom_sso_config_version" >= 0);