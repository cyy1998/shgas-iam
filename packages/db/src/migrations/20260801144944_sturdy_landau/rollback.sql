-- DDL payload for the Subject Projection tightening rollback. For a Drizzle-
-- migrated database, use `pnpm --filter @iam/db subject-projection:rollback`
-- so the exact journal identity is compensated in the same transaction. A
-- journal-less raw-SQL rehearsal may execute this idempotent DDL directly.
-- Run only with authentication traffic and user/client writes stopped.
DROP INDEX IF EXISTS "user_profile_subject_identifier_idx";

ALTER TABLE "user_profile"
  ALTER COLUMN "subject_identifier" DROP NOT NULL,
  ALTER COLUMN "name" DROP NOT NULL,
  ALTER COLUMN "source_dirty_version" DROP NOT NULL,
  ALTER COLUMN "subject_facts" DROP NOT NULL;

ALTER TABLE "user_profile"
  DROP CONSTRAINT "user_profile_source_dirty_version_positive_check",
  ADD CONSTRAINT "user_profile_source_dirty_version_positive_check"
    CHECK ("source_dirty_version" IS NULL OR "source_dirty_version" > 0),
  DROP CONSTRAINT "user_profile_subject_facts_object_check",
  ADD CONSTRAINT "user_profile_subject_facts_object_check"
    CHECK ("subject_facts" IS NULL OR jsonb_typeof("subject_facts") = 'object');

ALTER TABLE "client"
  DROP CONSTRAINT "client_custom_sso_state_check",
  ADD CONSTRAINT "client_custom_sso_state_check" CHECK ((
    (
      "custom_sso_config" IS NULL
      AND NOT "custom_sso_enabled"
      AND "custom_sso_secret_hash" IS NULL
    )
    OR
    (
      "custom_sso_config" IS NOT NULL
      AND (
        (
          "custom_sso_config"->>'mode' = 'gateway'
          AND "custom_sso_secret_hash" IS NULL
        )
        OR
        (
          "custom_sso_config"->>'mode' = 'independent'
          AND "custom_sso_secret_hash" IS NOT NULL
        )
      )
    )
  ));
