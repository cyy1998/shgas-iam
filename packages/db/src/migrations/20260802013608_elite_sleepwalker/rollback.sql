ALTER TABLE "subject_access_transition"
  DROP CONSTRAINT "subject_access_transition_target_check",
  ADD CONSTRAINT "subject_access_transition_target_check" CHECK ((
    ("status" = 'pending' AND "target_state" IS NULL)
    OR (
      "status" = 'committed'
      AND "target_state" IN ('enabled', 'disabled', 'rollback')
    )
    OR (
      "status" = 'rolled_back'
      AND "target_state" = 'rollback'
    )
  ));
