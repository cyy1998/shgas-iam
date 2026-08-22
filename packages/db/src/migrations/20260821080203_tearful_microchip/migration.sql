ALTER TABLE "client" DROP CONSTRAINT "client_custom_sso_state_check", ADD CONSTRAINT "client_custom_sso_state_check" CHECK (((
      (
        "custom_sso_config" IS NULL
        AND NOT "custom_sso_enabled"
        AND "custom_sso_secret_hash" IS NULL
      )
      OR
      (
        "custom_sso_config" IS NOT NULL
        AND "custom_sso_config_version" > 0
        AND jsonb_typeof("custom_sso_config") = 'object'
        AND jsonb_typeof("custom_sso_config"->'validRedirectUrls') = 'array'
        AND jsonb_array_length("custom_sso_config"->'validRedirectUrls') > 0
        AND jsonb_typeof("custom_sso_config"->'subjectClaims') = 'array'
        AND jsonb_array_length("custom_sso_config"->'subjectClaims') > 0
        AND "custom_sso_config"->'subjectClaims' @> '["subjectIdentifier"]'::jsonb
        AND jsonb_typeof("custom_sso_config"->'subjectClaimCatalogVersion') = 'number'
        AND "custom_sso_config"->>'subjectClaimCatalogVersion' = '2'
        AND (
          (
            "custom_sso_config"->>'mode' = 'gateway'
            AND "custom_sso_secret_hash" IS NULL
            AND ("custom_sso_config" - ARRAY[
              'validRedirectUrls',
              'subjectClaimCatalogVersion',
              'subjectClaims',
              'mode',
              'orcas'
            ]::text[]) = '{}'::jsonb
            AND jsonb_typeof("custom_sso_config"->'orcas') = 'object'
            AND (("custom_sso_config"->'orcas') - 'enabled'::text) = '{}'::jsonb
            AND jsonb_typeof("custom_sso_config"->'orcas'->'enabled') = 'boolean'
          )
          OR
          (
            "custom_sso_config"->>'mode' = 'independent'
            AND "custom_sso_secret_hash" IS NOT NULL
            AND ("custom_sso_config" - ARRAY[
              'validRedirectUrls',
              'subjectClaimCatalogVersion',
              'subjectClaims',
              'mode',
              'callbackEndpoint',
              'logoutEndpoint'
            ]::text[]) = '{}'::jsonb
            AND jsonb_typeof("custom_sso_config"->'callbackEndpoint') = 'string'
            AND "custom_sso_config"->>'callbackEndpoint' <> ''
            AND jsonb_typeof("custom_sso_config"->'logoutEndpoint') = 'string'
            AND "custom_sso_config"->>'logoutEndpoint' <> ''
          )
        )
      )
    ) IS TRUE)) NOT VALID;
