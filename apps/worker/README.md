# @iam/worker

Background job runtime. The first module is `user-profile`, which consumes user-profile BullMQ jobs and exposes a
health endpoint plus an internal Bull Board dashboard.

## Commands

```bash
pnpm --filter @iam/worker serve
pnpm --filter @iam/worker user-profile:backfill
pnpm --filter @iam/worker user-profile:repair
```

`user-profile:backfill` and `user-profile:repair` use command-only composition: they do not start consumers, the HTTP
server, or Bull Board. Actual profile rebuilds are handled by the BullMQ worker consumer.

`user-profile:repair` repairs failed rows plus stale pending/processing dirty rows. Without `--stale-before`, it uses
`IAM_WORKER_USER_PROFILE_REPAIR_STALE_SECONDS` to compute the repair threshold; the default is 300 seconds.

## Runtime Modes

```bash
IAM_WORKER_ENABLED_MODULES=user-profile
IAM_WORKER_ENABLED_MODULES=all
IAM_WORKER_ENABLED_MODULES=none
```

`none` is for dashboard-only or health-only processes and does not consume jobs. Bull Board uses
`IAM_WORKER_BULL_BOARD_*`, defaults to read-only mode, and requires Basic Auth.
