DO $migration$
DECLARE
  invalid_client_code text;
BEGIN
  SELECT "client_code"
  INTO invalid_client_code
  FROM "client"
  WHERE "custom_sso_config" IS NOT NULL
    AND (
      CASE
        WHEN jsonb_typeof("custom_sso_config"->'subjectClaims') = 'array' THEN
          jsonb_array_length("custom_sso_config"->'subjectClaims') > 0
          AND "custom_sso_config"->'subjectClaims' @> '["subjectIdentifier"]'::jsonb
          AND "custom_sso_config"->'subjectClaims' <@ '[
            "subjectIdentifier",
            "profile:username",
            "profile:name",
            "profile:phone",
            "profile:employments",
            "iam:authorization"
          ]'::jsonb
          AND jsonb_array_length("custom_sso_config"->'subjectClaims') = (
            SELECT count(DISTINCT claim)
            FROM jsonb_array_elements_text("custom_sso_config"->'subjectClaims') AS claims(claim)
          )
        ELSE false
      END
    ) IS NOT TRUE
  ORDER BY "client_code"
  LIMIT 1;

  IF invalid_client_code IS NOT NULL THEN
    RAISE EXCEPTION 'Custom SSO config for client % does not satisfy the active Subject Claim Catalog', invalid_client_code
      USING ERRCODE = '23514';
  END IF;
END
$migration$;

ALTER TABLE "client" DROP CONSTRAINT "client_custom_sso_state_check";

UPDATE "client"
SET "custom_sso_config" = "custom_sso_config" - 'subjectClaimCatalogVersion'
WHERE "custom_sso_config" IS NOT NULL;

ALTER TABLE "client" ADD CONSTRAINT "client_custom_sso_state_check" CHECK (((
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
        AND NOT jsonb_path_exists(
          "custom_sso_config",
          '$.validRedirectUrls[*] ? (@.type() != "string" || @ == "")'
        )
        AND jsonb_typeof("custom_sso_config"->'subjectClaims') = 'array'
        AND jsonb_array_length("custom_sso_config"->'subjectClaims') > 0
        AND "custom_sso_config"->'subjectClaims' @> '["subjectIdentifier"]'::jsonb
        AND (
          (
            "custom_sso_config"->>'mode' = 'gateway'
            AND "custom_sso_secret_hash" IS NULL
            AND ("custom_sso_config" - ARRAY[
              'validRedirectUrls',
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
              'subjectClaims',
              'mode',
              'callbackEndpoint',
              'logoutEndpoint'
            ]::text[]) = '{}'::jsonb
            AND jsonb_typeof("custom_sso_config"->'callbackEndpoint') = 'string'
            AND "custom_sso_config"->>'callbackEndpoint' <> ''
            AND "custom_sso_config"->>'callbackEndpoint' ~ '^[A-Za-z][A-Za-z0-9+.-]*:[^[:space:]]+$'
            AND jsonb_typeof("custom_sso_config"->'logoutEndpoint') = 'string'
            AND "custom_sso_config"->>'logoutEndpoint' <> ''
            AND "custom_sso_config"->>'logoutEndpoint' ~ '^[A-Za-z][A-Za-z0-9+.-]*:[^[:space:]]+$'
          )
        )
      )
    ) IS TRUE));
