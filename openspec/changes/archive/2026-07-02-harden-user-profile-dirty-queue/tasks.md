## 1. 数据库与 Contracts

- [x] 1.1 为 `user_profile_dirty` schema 增加 `dirtyVersion` bigint 字段、默认值和 Zod/TypeScript 类型映射，并补充 `status, processing_started_at` repair 查询索引。
- [x] 1.2 生成并检查 Drizzle migration，确保已有 dirty rows 初始化为 `dirty_version=1`，且 schema/index exports 保持同步。
- [x] 1.3 更新 `@iam/contracts` 的 `RebuildUserProfileJobPayloadSchema`，要求必填 decimal-string `dirtyVersion`。
- [x] 1.4 更新 user-profile job contract tests，覆盖缺失/非法 dirtyVersion、合法 payload 和旧无版本 payload 拒绝。
- [x] 1.5 更新 `@iam/jobs` deterministic rebuild jobId helper 或 user-profile producer helper，使 rebuild jobId 使用 `jobName|userId|dirtyVersion`。

## 2. Dirty Repository 与 Producer

- [x] 2.1 在 `@iam/user-profile-read-model` 增加 dirtyVersion 格式化/解析 helper，保证对外使用 decimal string、repository 内部转换为数据库 bigint。
- [x] 2.2 重写 `createUserProfileDirtyRepository.markManyDirty`，实现批次内同 userId 合并、每用户版本递增一次、当前 reasonCodes 覆盖历史原因、状态重置和 returning rows。
- [x] 2.3 调整 `claimForProcessing`、`markProcessed`、`markFailed`，全部使用 `userId + dirtyVersion + status` CAS，并区分 skipped/stale 结果。
- [x] 2.4 增加 repair repository 方法，支持扫描 failed/stale pending/stale processing rows，并将 stale processing 同版本 CAS reset 为 pending。
- [x] 2.5 调整 `createUserProfileJobProducer`，支持 versioned `buildRebuildJobId`、单条 enqueue 和批量 `enqueueRebuildJobs`，批量实现使用 `queue.addBulk` 或分批限流。
- [x] 2.6 调整 `createUserProfileDirtyMarker`，afterCommit enqueue 基于 `markManyDirty` 返回 rows，且不再在写 dirty 前推测 jobId/dirtyVersion。

## 3. Worker Service 状态机

- [x] 3.1 更新 `processRebuildUserProfile`，从 payload 读取 dirtyVersion，claim matching dirty row，claim 失败返回 skipped。
- [x] 3.2 更新 rebuild 成功路径，按 version CAS mark processed；affected rows 为 0 时返回 stale no-op，不抛错给 BullMQ。
- [x] 3.3 更新 rebuild 失败路径，按 version CAS mark failed 并 rethrow；affected rows 为 0 时返回 stale no-op，不让旧版本重试。
- [x] 3.4 为 `buildOne === null` 增加 `user_profile` 删除路径，并在删除后 mark matching dirtyVersion processed。
- [x] 3.5 调整 worker logs 和 module completed/failed logs，显式包含 `userId`、`dirtyVersion`、`jobId`、`jobName` 和结果状态。

## 4. Repair、Backfill 与 Worker Runtime

- [x] 4.1 调整 `backfillAllUsers`，扫描所有 users 主表行，调用 markManyDirty 产生新 dirtyVersion，并 enqueue returned versioned rebuild rows。
- [x] 4.2 调整 `repairFailedOrStale`，只 enqueue 当前 dirtyVersion，不 bump 版本、不覆盖 reasonCodes、不更新 dirtyAt，并处理 stale processing reset。
- [x] 4.3 为 `apps/worker` 增加 `IAM_WORKER_USER_PROFILE_REPAIR_STALE_SECONDS` env 解析、默认值、runtime config 和 env tests。
- [x] 4.4 调整 user-profile repair command，默认使用 `now - repairStaleSeconds` 作为 staleBefore，并保留显式 `--stale-before` 覆盖。
- [x] 4.5 拆分或参数化 worker composition，使 backfill/repair command 使用 command-only composition，不启动 consumers、HTTP server 或 BullMQ dashboard。
- [x] 4.6 更新 worker command tests，覆盖 command-only 语义、repair stale window、backfill/repair enqueue 结果日志。

## 5. App 接入与写路径覆盖

- [x] 5.1 更新 `apps/api` 和 `apps/admin-api` composition/tx wiring，使 profileDirtyMarker 使用新的 dirty repository/producer port 形状。
- [x] 5.2 审查 API/admin-api user、employment、organization、position 写路径，确认删除/禁用类操作不会在关系不可发现后漏掉 affected users。
- [x] 5.3 更新写路径 service/handler tests，覆盖 user create/update/disable/delete、employment create/update/status/delete/transfer/setPrimary/resign、organization update/status/delete、position update/status/delete 的 dirtyVersion enqueue 语义。
- [x] 5.4 增加 architecture 或 import guard，防止 API/admin-api 业务写路径直接依赖 `enqueueScopeExpansionJob` 作为唯一事实来源。
- [x] 5.5 确认 public/open/admin/SSO 用户查询响应不暴露 dirtyVersion、dirty status、attempts 或 jobId。

## 6. 验证与发布准备

- [x] 6.1 运行 `pnpm --filter @iam/contracts test typecheck`。
- [x] 6.2 运行 `pnpm --filter @iam/db db:generate` 或等效 migration 检查，并运行 `pnpm --filter @iam/db typecheck`。
- [x] 6.3 运行 `pnpm --filter @iam/user-profile-read-model test typecheck`。
- [x] 6.4 运行 `pnpm --filter @iam/worker test typecheck`。
- [x] 6.5 运行受影响 app checks：`pnpm --filter @iam/api test typecheck` 和 `pnpm --filter @iam/admin-api test typecheck`。
- [x] 6.6 运行 `openspec validate harden-user-profile-dirty-queue --strict`。
- [x] 6.7 在 release notes 或运维文档中记录部署顺序：停止 user-profile worker、迁移 DB、部署 producer/worker、清理旧无版本 queue jobs 或部署后运行 repair。
