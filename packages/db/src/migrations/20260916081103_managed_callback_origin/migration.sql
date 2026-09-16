-- Prepare existing rows with client-managed-callback:upgrade before formal migration.
LOCK TABLE "client" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
ALTER TABLE "client" DROP CONSTRAINT IF EXISTS "client_sso_config_check", ADD CONSTRAINT "client_sso_config_check" CHECK (("sso_config" IS NULL OR (
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
        AND ("sso_config" - ARRAY['protocol','callbackType','callbackEndpoint','validRedirectUrls','subjectClaims','orcas']) = '{}'::jsonb
        AND "sso_config"->>'callbackType' IN ('managed','business')
        AND ("sso_config"->>'callbackType' = 'managed' OR NOT COALESCE(("sso_config"->'orcas'->>'enabled')::boolean, false))
        AND (("sso_config"->>'callbackType' = 'managed' AND NOT ("sso_config" ? 'callbackEndpoint'))
          OR ("sso_config"->>'callbackType' = 'business'
            AND jsonb_typeof("sso_config"->'callbackEndpoint') = 'string'
            AND "sso_config"->>'callbackEndpoint' ~ '^https?://[^[:space:]]+$'))
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