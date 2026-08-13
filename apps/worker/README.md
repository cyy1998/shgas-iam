# @iam/worker

Background job runtime. The first module is `user-profile`, which consumes user-profile BullMQ jobs and exposes a
health endpoint plus an internal Bull Board dashboard.

## Commands

```bash
pnpm --filter @iam/worker serve
pnpm --filter @iam/worker employment:cutover-verify
pnpm --filter @iam/worker user-profile:backfill
pnpm --filter @iam/worker user-profile:repair
pnpm --filter @iam/worker run user-profile:repair -- --subject-access-only --limit 500
```

`employment:cutover-verify` 是 Employment 新生命周期切换前的显式只读 gate。命令只要求
`IAM_WORKER_DATABASE_URL`，不会启动 Worker consumer、HTTP server、Bull Board 或 Redis，也不会随普通 Worker 启动和请求
自动执行。它在 PostgreSQL `READ ONLY` transaction 中读取 Employment 及其 Position、Organization，输出稳定分类和全部相关
Employment ID；不执行 insert、update、delete，不读取或解释 `updateTime`，也不生成修复 SQL。

报告为 `passed` 时命令退出 0；存在任一非墓碑阻断异常时报告为 `failed` 并退出 1。Legacy Employment Tombstone 只在
`legacyTombstones` 中计数，不因缺少可信 `endTime` 阻断切换。运维人员应依据真实业务事实通过正式 Admin 入口修正数据，再重跑
同一命令；不得把 verifier 输出当作自动修复指令。

`user-profile:backfill` and `user-profile:repair` use command-only composition: they do not start consumers, the HTTP
server, or Bull Board. Actual profile rebuilds are handled by the BullMQ worker consumer.

Both repair modes run Subject Access maintenance in this order:

1. A bounded, single-statement PostgreSQL write transaction reaps stale `pending` transition intents, including the
   PG-only gap where an intent was durably created but never reached a Redis index. It uses PostgreSQL server time and
   `IAM_WORKER_USER_PROFILE_REPAIR_STALE_SECONDS` (default 300 seconds) as the stale threshold, orders by `update_time`
   and `id`, and selects at most `--limit` rows with `FOR UPDATE SKIP LOCKED`. Selected rows become
   `rolled_back`/`rollback`; fresh rows and rows locked by an active mutation transaction are left for a later invocation.
2. Redis transition recovery resolves indexed transition-recovery work against the exact PostgreSQL receipt under a row
   lock. Committed receipts move Redis toward their recorded target, pending receipts are atomically rolled back before
   Redis restores the previous record, and missing receipts are deferred rather than guessed.
3. Subject Access authority repair claims the indexed Barrier backlog and reconciles it with PostgreSQL account,
   Profile, Dirty, and Subject Facts state.

The default command starts User Profile dirty-row maintenance after transition recovery and runs it alongside step 3.
`--subject-access-only` skips BullMQ queue construction and User Profile maintenance, but it is not PostgreSQL read-only
and is not limited to Redis-indexed work. Its database role needs schema access plus `SELECT` and `UPDATE` on
`subject_access_transition`, in addition to the authority reads required by step 3. `--limit` bounds each Subject Access
stage independently. `--stale-before` applies only to User Profile dirty rows; the PG-only transition threshold always
uses PostgreSQL server time and the seconds-based environment setting above.

If the PostgreSQL reaper fails, the command exits non-zero before Redis transition recovery or authority repair. Monitor
the structured logs `Subject Access stale transition intent reap started` (`limit`, `staleAfterSeconds`),
`Subject Access stale transition intents reaped` (`rolledBack`, `limit`, `staleAfterSeconds`),
`Subject Access transition recovery backlog processed` (`prepared`, `rolledBack`, `deferred`, `failed`, `limit`), and
`Subject Access repair backlog processed` (`disabled`, `enabled`, `deferred`, `failed`, `stable`, `limit`). Alert on a
non-zero exit, a start log without its matching completion log, or sustained non-zero `deferred`/`failed` counts.
The repository provides no scheduler: a named deployment owner must configure periodic invocation and choose the stale
threshold, cadence, limit, repeated drain behavior, and alerts so the threshold, wait for the next run, and bounded drain
all fit within the documented worst-case recovery SLO.

## Runtime Modes

```bash
IAM_WORKER_ENABLED_MODULES=user-profile
IAM_WORKER_ENABLED_MODULES=all
IAM_WORKER_ENABLED_MODULES=none
```

`none` is for dashboard-only or health-only processes and does not consume jobs. Bull Board uses
`IAM_WORKER_BULL_BOARD_*`, defaults to read-only mode, and requires Basic Auth.
