ALTER TABLE "subject_access_transition" DROP CONSTRAINT "subject_access_transition_target_check", ADD CONSTRAINT "subject_access_transition_target_check" CHECK ((
        ("status" = 'pending' and "target_state" is null)
        or (
          "status" = 'committed'
          and "target_state" is not null
          and "target_state" in ('enabled', 'disabled', 'rollback')
        )
        or (
          "status" = 'rolled_back'
          and "target_state" is not null
          and "target_state" = 'rollback'
        )
      ));