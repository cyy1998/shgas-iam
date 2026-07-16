# User Profile Dirty Queue 发布手册

Type: runbook
Status: Current
Last verified: 2026-07-16
Next review: 2026-10-31

## 适用范围

本手册用于发布 versioned user-profile dirty/rebuild 队列能力。事实来源包括
`packages/contracts/src/jobs/user-profile.ts`、`packages/user-profile-read-model/src/` 及其测试、
`apps/worker/package.json`、`apps/worker/src/env.ts`、相关数据库 migration，以及
`docker/docker-compose-dev.yml` 和 `docker/docker-compose-prod.yml`。

该发布会把 `rebuild-user-profile` job payload 和 deterministic jobId 升级为 `userId + dirtyVersion` 维度，
并要求 `user_profile_dirty.dirty_version` 已存在。旧的未版本化 job 与新 worker 不兼容。

## 发布前置条件

- 已审查并准备应用 `user_profile_dirty.dirty_version` migration，例如
  `packages/db/src/migrations/20260702044821_smart_toad_men/migration.sql`。
- `@iam/api`、`@iam/admin-api` 和 `@iam/worker` 来自同一变更集；producer 与 worker 必须同时理解
  `dirtyVersion`。
- 已确认 worker 环境变量，尤其是 `IAM_WORKER_ENABLED_MODULES`、`IAM_WORKER_HEALTH_PATH`、
  `IAM_WORKER_BULL_BOARD_PATH`、`IAM_WORKER_BULL_BOARD_READ_ONLY`、
  `IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE` 和 `IAM_WORKER_USER_PROFILE_REPAIR_STALE_SECONDS`。
- 运维窗口内可以停止 `worker-user-profile` consumer，并可以访问 `worker-dashboard` 的 Bull Board。
- 生产 Bull Board 必须启用 Basic Auth；如需执行 retry、clean、remove 等写操作，必须显式设置
  `IAM_WORKER_BULL_BOARD_READ_ONLY=false`，并只在维护窗口内开放。

## 发布顺序

1. 停止 `worker-user-profile`，保持 API 与 admin-api 暂时继续服务，避免新旧 worker 并发消费。
2. 应用数据库 migration，确认 `user_profile_dirty.dirty_version` 为 `bigint`、`not null` 且有默认值。
3. 部署同一版本的 `@iam/api`、`@iam/admin-api` 和 `@iam/worker` 镜像或构建产物。
4. 在启动新 worker 前处理旧 BullMQ job：
   - 如果队列中只剩旧 jobId 形态 `rebuild-user-profile|<userId>`，在维护窗口内清理这些旧 job。
   - 不要清理其它队列，也不要删除 `user_profile_dirty` 表中的 pending/failed 事实。
   - 如果无法可靠枚举旧 job，先保持 consumer 停止，启动 dashboard 核对队列，再运行 repair 重新唤醒当前 dirty 行。
5. 启动 `worker-user-profile`，确认日志显示启用模块包含 `user-profile`。
6. 如存在 pending、failed 或 stale processing dirty 行，运行 repair：

```bash
pnpm --filter @iam/worker user-profile:repair
```

7. 只有在需要主动全量重建所有用户画像时，才运行 backfill。backfill 会产生新的 `dirtyVersion`，不是 no-op：

```bash
pnpm --filter @iam/worker user-profile:backfill
```

## Smoke 验收

- 访问 worker health，开发 compose 默认入口为 `http://localhost:30016/healthz`：

```bash
curl -fsS http://localhost:30016/healthz
```

- 打开 Bull Board，开发 compose 默认入口为 `http://localhost:30016/admin/queues`，确认能看到 user-profile 队列；
  dashboard-only service 应使用 `IAM_WORKER_ENABLED_MODULES=none`，不得消费 job。
- 触发一条会写 user-profile dirty 的源表变更，确认 afterCommit enqueue 成功，jobId 形如
  `rebuild-user-profile|<userId>|<dirtyVersion>`。
- 查询 worker 日志，确认 `rebuild-user-profile` 的完成、跳过、stale 或失败日志包含
  `userId`、`dirtyVersion`、`jobId`、`jobName` 和结果状态。
- 运行 `user-profile:repair` 后，记录 enqueue count 和受影响批次摘要；确认 repair 不递增 `dirty_version`。
- 如执行 backfill，记录扫描批次、enqueue count 和 reason `Backfill`，并确认业务 API 响应不暴露
  `dirtyVersion`、`dirty_version`、dirty status、attempts 或 job id。

## 回滚与恢复

| 场景 | 处理方式 | 注意事项 |
|---|---|---|
| 仅 worker 发布失败，API/admin-api 尚未产生新版 job | 停止新 worker，恢复旧 worker | 确认队列中没有 `rebuild-user-profile|<userId>|<dirtyVersion>` 新 job。 |
| 新 producer 已产生 versioned job | 同时回滚 API、admin-api、worker，并清理 user-profile 队列中的 versioned job | 旧 worker 不能消费 versioned payload。 |
| migration 已应用 | 通常保留 `dirty_version` 列并回滚代码 | 删除列会破坏新旧运行证据，只有在确认没有新版代码和 job 后才考虑数据库回滚。 |
| afterCommit enqueue 失败或 job 丢失 | 修复依赖后运行 `pnpm --filter @iam/worker user-profile:repair` | repair 使用当前 `dirtyVersion` 重新入队，不生成新版本。 |
| 大量 profile 需要重新生成 | 确认业务窗口后运行 `pnpm --filter @iam/worker user-profile:backfill` | backfill 会产生新 dirty 事实并增加队列压力。 |

回滚后重新执行 health、Bull Board、repair 和日志 smoke。任何队列清理都必须限定在 user-profile 队列和明确识别的
`rebuild-user-profile` job 上，避免误删其它 BullMQ 运行时对象。
