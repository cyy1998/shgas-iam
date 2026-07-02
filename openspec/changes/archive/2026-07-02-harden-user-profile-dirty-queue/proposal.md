## Why

当前 user-profile rebuild 管道以 `user_profile_dirty` 作为持久事实、BullMQ job 作为唤醒器，但同一用户 rebuild job 使用永久固定 jobId，且 dirty 状态更新没有版本 CAS。这样在 completed/failed job 保留、worker 正在处理时再次打脏、repair 重入队等场景下，可能出现新 dirty 被 BullMQ 去重吞掉或被旧 worker 标记为 processed 的风险。

本 change 需要把 user-profile dirty/rebuild 队列升级为版本化、可修复、可观测的状态机，使 API/admin-api 源表写入后的 profile 最终一致性不依赖脆弱的队列状态。

## What Changes

- 为 `user_profile_dirty` 引入 per-user `dirty_version`，每次新的 dirty 事实产生时递增，并作为 worker claim、processed、failed 的 CAS 条件。
- 将 `rebuild-user-profile` job contract 和 deterministic jobId 升级为 `userId + dirtyVersion` 维度，避免旧 retained job 阻塞新版本唤醒。
- 调整 dirty marker 和 producer：afterCommit enqueue 必须基于 `markManyDirty` 返回的实际 dirty rows，且批量/限流 enqueue versioned rebuild jobs。
- 调整 worker 状态机：旧版本 job 完成时 no-op 为 stale，不覆盖新版本 dirty；`buildOne === null` 时删除对应 `user_profile` 行。
- 调整 repair/backfill 分工：repair 只重新 enqueue 当前 dirtyVersion，不产生新版本；backfill/manual rebuild 产生新 dirtyVersion。
- 改善 worker 运维命令和观测：repair 使用可配置 stale window，backfill/repair 使用 command-only composition，不启动 consumers/http，并在日志中显式记录 dirtyVersion。
- 保留 `expand-user-profile-scope` 作为 worker/运维扩展能力，但禁止业务写路径仅依赖 scope job 作为 dirty 事实来源。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `user-profile-read-model`: 修改 dirty 表状态语义、rebuild worker 状态机、repair/backfill 行为和 source write dirty 生产要求。
- `background-job-queue`: 修改 user-profile job contract 和 deterministic rebuild jobId 规则，增加 dirtyVersion 维度。
- `worker-app-runtime`: 修改 user-profile repair/backfill command 运行语义和 repair stale window 配置要求。
- `app-env-contracts`: 增加 worker user-profile repair stale window env contract。

## Impact

- Affected packages: `packages/db`, `packages/contracts`, `packages/user-profile-read-model`, `packages/jobs`。
- Affected apps: `apps/api`, `apps/admin-api`, `apps/worker`。
- Database: `user_profile_dirty` 需要新增 `dirty_version` migration，并补充 repair 查询索引。
- Jobs: `rebuild-user-profile` payload 和 jobId contract 会变化；旧无版本 BullMQ jobs 不兼容，应通过部署 runbook 清理旧 queue 或部署后运行 repair。
- APIs: public/open/admin/SSO 用户查询响应不暴露 dirtyVersion，外部 API response contract 不变。
