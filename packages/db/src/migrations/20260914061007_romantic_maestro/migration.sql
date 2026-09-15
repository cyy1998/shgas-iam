ALTER TABLE "client" ADD COLUMN "sso_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "sso_config" jsonb;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "sso_secret" varchar(255);--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "sso_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "sso_secret_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_sso_enabled_config_check" CHECK (NOT "sso_enabled" OR "sso_config" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_sso_credential_check" CHECK ((
    ("sso_secret" IS NULL AND "sso_credential_id" IS NULL AND "sso_secret_updated_at" IS NULL)
    OR ("sso_secret" IS NOT NULL AND length("sso_secret") > 0
      AND "sso_credential_id" IS NOT NULL AND "sso_secret_updated_at" IS NOT NULL)
  ));--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_sso_config_check" CHECK (("sso_config" IS NULL OR (
    jsonb_typeof("sso_config") = 'object' AND (
      ("sso_config"->>'protocol' = 'oidc'
        AND ("sso_config" - ARRAY['protocol','clientType','redirectUris','postLogoutRedirectUris','allowedScopes']) = '{}'::jsonb
        AND "sso_config"->>'clientType' IN ('public','confidential')
        AND jsonb_typeof("sso_config"->'redirectUris') = 'array'
        AND jsonb_array_length("sso_config"->'redirectUris') > 0
        AND jsonb_typeof("sso_config"->'postLogoutRedirectUris') = 'array'
        AND jsonb_typeof("sso_config"->'allowedScopes') = 'array'
        AND "sso_config"->'allowedScopes' @> '["openid"]'::jsonb)
      OR ("sso_config"->>'protocol' = 'custom-sso'
        AND ("sso_config" - ARRAY['protocol','callbackEndpoint','validRedirectUrls','subjectClaims','orcas']) = '{}'::jsonb
        AND jsonb_typeof("sso_config"->'callbackEndpoint') = 'string'
        AND "sso_config"->>'callbackEndpoint' ~ '^https?://[^[:space:]]+$'
        AND jsonb_typeof("sso_config"->'validRedirectUrls') = 'array'
        AND jsonb_array_length("sso_config"->'validRedirectUrls') > 0
        AND jsonb_typeof("sso_config"->'subjectClaims') = 'array'
        AND "sso_config"->'subjectClaims' @> '["subjectIdentifier"]'::jsonb
        AND (NOT ("sso_config" ? 'orcas') OR (
          jsonb_typeof("sso_config"->'orcas') = 'object'
          AND (("sso_config"->'orcas') - 'enabled') = '{}'::jsonb
          AND jsonb_typeof("sso_config"->'orcas'->'enabled') = 'boolean')))
    )
  )) IS TRUE);
