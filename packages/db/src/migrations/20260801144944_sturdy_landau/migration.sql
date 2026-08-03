-- This tightening migration is intentionally transactional and uses a normal
-- unique index. The release runbook freezes user/client writes first; the
-- PostgreSQL rehearsal records the lock-wait behavior of that choice.
DO $$
DECLARE
  invalid_projection_count bigint;
  duplicate_subject_count bigint;
BEGIN
  SELECT count(*)
  INTO invalid_projection_count
  FROM "user" AS u
  FULL OUTER JOIN "user_profile" AS p ON p.user_id = u.id
  LEFT JOIN "user_profile_dirty" AS d ON d.user_id = u.id
  WHERE
    u.id IS NULL
    OR p.user_id IS NULL
    OR p.subject_identifier IS NULL
    OR p.subject_identifier IS DISTINCT FROM u.subject_identifier
    OR p.name IS NULL
    OR p.name = ''
    OR p.profile_schema_version <> 1
    OR p.source_dirty_version IS NULL
    OR p.source_dirty_version IS DISTINCT FROM d.dirty_version
    OR d.status IS DISTINCT FROM 'processed'
    OR p.subject_facts IS NULL
    OR jsonb_typeof(p.subject_facts) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p.subject_facts->'employments') IS DISTINCT FROM 'array'
    OR (p.subject_facts - 'employments'::text) <> '{}'::jsonb;

  IF invalid_projection_count > 0 THEN
    RAISE EXCEPTION
      'Subject Projection verification failed for % user/profile rows',
      invalid_projection_count
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO duplicate_subject_count
  FROM (
    SELECT subject_identifier
    FROM "user_profile"
    GROUP BY subject_identifier
    HAVING count(*) > 1
  ) AS duplicate_subjects;

  IF duplicate_subject_count > 0 THEN
    RAISE EXCEPTION
      'Subject Projection verification found % duplicate Subject Identifiers',
      duplicate_subject_count
      USING ERRCODE = '23514';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "user_profile" ALTER COLUMN "subject_identifier" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ALTER COLUMN "source_dirty_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ALTER COLUMN "subject_facts" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_profile_subject_identifier_idx" ON "user_profile" ("subject_identifier");--> statement-breakpoint
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
        AND "custom_sso_config"->>'subjectClaimCatalogVersion' = '1'
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
    ) IS TRUE));--> statement-breakpoint
ALTER TABLE "user_profile" DROP CONSTRAINT "user_profile_source_dirty_version_positive_check", ADD CONSTRAINT "user_profile_source_dirty_version_positive_check" CHECK ("source_dirty_version" > 0);--> statement-breakpoint
ALTER TABLE "user_profile" DROP CONSTRAINT "user_profile_subject_facts_object_check", ADD CONSTRAINT "user_profile_subject_facts_object_check" CHECK (jsonb_typeof("subject_facts") = 'object');
