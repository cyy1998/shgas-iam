-- Apply only after the fixed pre-contraction Worker candidate has completed
-- client-sso:upgrade apply and independent verify --all while writers are stopped.
-- This gate prevents unconverted configured Clients from losing their source data.
LOCK TABLE "client" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "client"
    WHERE (("oidc_config" IS NOT NULL OR "custom_sso_config" IS NOT NULL) AND "sso_config" IS NULL)
       OR ("sso_config"->>'protocol' = 'oidc' AND "oidc_config" IS NULL AND "custom_sso_config" IS NOT NULL)
       OR ("sso_config"->>'protocol' = 'custom-sso' AND "custom_sso_config" IS NULL AND "oidc_config" IS NOT NULL)
       OR (("sso_config"->>'protocol' = 'oidc' AND "sso_config"->>'clientType' = 'confidential'
            OR "sso_config"->>'protocol' = 'custom-sso' AND "custom_sso_config"->>'mode' = 'independent')
           AND ("sso_secret" IS NULL OR "sso_credential_id" IS NULL OR "sso_secret_updated_at" IS NULL
                OR "sso_secret" !~ '^[A-Za-z0-9_-]{43}$'
                OR "sso_secret" IS NOT DISTINCT FROM "oidc_secret_hash"
                OR "sso_secret" IS NOT DISTINCT FROM "custom_sso_secret_hash"))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Client SSO upgrade must be verified before schema contraction';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "client" DROP CONSTRAINT "client_oidc_enabled_config_check";--> statement-breakpoint
ALTER TABLE "client" DROP CONSTRAINT "client_custom_sso_state_check";--> statement-breakpoint
ALTER TABLE "client" DROP CONSTRAINT "client_custom_sso_config_version_check";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "oidc_enabled";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "oidc_config";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "oidc_secret_hash";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "oidc_config_version";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "custom_sso_enabled";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "custom_sso_config";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "custom_sso_secret_hash";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "custom_sso_config_version";
