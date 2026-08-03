CREATE INDEX "subject_access_transition_pending_update_time_idx" ON "subject_access_transition" ("update_time","id") WHERE
        "status" = 'pending'
        and "target_state" is null
      ;
