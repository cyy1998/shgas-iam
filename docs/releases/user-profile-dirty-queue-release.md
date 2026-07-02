# User Profile Dirty Queue Release Runbook

Status: Current
Last verified: 2026-07-02
Next review: 2026-09-30

## Deployment Order

1. Stop the `user-profile` worker consumer before applying the database migration.
2. Apply the `user_profile_dirty.dirty_version` migration.
3. Deploy API, Admin API, and Worker builds that require versioned `rebuild-user-profile` payloads.
4. Clear old unversioned `user-profile` queue jobs before starting the new worker, or start the new stack and immediately run:

```bash
pnpm --filter @iam/worker user-profile:repair
```

5. Start the `user-profile` worker consumer and watch logs for `userId`, `dirtyVersion`, `jobId`, `jobName`, and result status.

## Rollback Note

Versioned queue payloads are not compatible with older workers. If rolling code back across this change, clear the
`user-profile` queue or roll back worker, producer, and database state together.
