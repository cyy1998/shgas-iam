## Context

当前 user-profile read model 已经拆到 `@iam/user-profile-read-model`，并由 `apps/api`、`apps/admin-api` 在源表写事务内持久化 `user_profile_dirty`，再通过 afterCommit best-effort enqueue BullMQ job 唤醒 `apps/worker`。这个方向是正确的：`user_profile_dirty` 是事实来源，BullMQ 只是唤醒器。

现有实现的薄弱点在于 rebuild job 使用永久固定 `rebuild-user-profile|<userId>` jobId，dirty row 也没有版本 CAS。BullMQ completed/failed job 保留期间，新的同 userId enqueue 可能被 duplicate 处理；worker 正在处理旧 dirty 时，如果同一用户再次被打脏，旧 worker 完成后也可能把新 dirty 标记为 processed。

本设计将 dirty/rebuild 管道升级为版本化状态机，使每个用户的 dirty 事实具有单调递增版本，并让 worker 只处理自己 claim 到的版本。

## Goals / Non-Goals

**Goals:**

- 为 `user_profile_dirty` 增加 per-user `dirty_version`，并用它保护 claim、processed、failed 状态转换。
- 让 `rebuild-user-profile` payload 和 deterministic jobId 都包含 `dirtyVersion`，去重维度从 userId 升级为 `userId + dirtyVersion`。
- 让 dirty marker 的 afterCommit enqueue 基于 `markManyDirty` 返回的实际 rows，而不是调用前推测 jobId 或版本。
- 明确 repair/backfill 分工：repair 只重入队当前版本；backfill/manual rebuild 产生新版本。
- 让 worker 对旧版本完成返回 stale no-op，不覆盖新 dirty，不让 BullMQ 重试旧版本。
- 让 backfill/repair command 使用 command-only composition，不启动 consumers 或 HTTP server。
- 保持外部 API response contract 不变，不向 public/open/admin/SSO 响应暴露 dirtyVersion。

**Non-Goals:**

- 不引入 durable outbox 或周期性自动 repair scheduler。
- 不新增 `user_profile_dirty_scope` 或 durable scope dirty 表。
- 不重命名 `user_profile_dirty` 表。
- 不实现 orphan profile cleanup command。
- 不为旧无版本 BullMQ job payload 提供长期兼容。

## Decisions

### 1. 使用 per-user `dirty_version` 作为并发令牌

`user_profile_dirty` 新增 `dirty_version bigint not null default 1`。每个 userId 独立递增，表示该用户当前 dirty/rebuild 事实的代际：

```text
user_id=123: dirty_version 1 -> 2 -> 3
user_id=456: dirty_version 1 -> 2
```

`markManyDirty` 对每个受影响 userId 原子 upsert：

```text
insert: dirty_version = 1
conflict update: dirty_version = dirty_version + 1
```

同一个 `markManyDirty` 输入批次内重复 userId 先合并 reasonCodes，只递增一次。新版本产生时 `status=pending`、`dirty_at=now`、`attempts=0`、`last_error=null`、`processing_started_at=null`、`processed_at=null`。`reason_codes` 表示当前 dirtyVersion 的原因集合，不无限累计历史原因。

`dirtyVersion` 对外使用 decimal string；只有 repository 在构造 SQL where/upsert 时转换为数据库 bigint。这样避免 JSON payload 传递 `bigint`，也避免使用 JS number 猜测安全范围。

### 2. `markManyDirty` 返回 rows 驱动 afterCommit enqueue

dirty marker 不再在写 dirty 前通过 userId 推测 jobId。流程改为：

```text
source write transaction
  -> dirtyRepository.markManyDirty(inputs)
       -> returning { userId, dirtyVersion, reasonCodes, lastJobId }
  -> afterCommit enqueue returned rows
```

`last_job_id` 在 dirty 写入时确定为预期 rebuild jobId：

```text
rebuild-user-profile|<userId>|<dirtyVersion>
```

它表示本版本预期/最近唤醒 jobId，不表示 enqueue 已经成功。afterCommit enqueue 失败只记录日志，dirty row 保持 pending，后续由 repair 扫描 stale pending 兜底。

### 3. Rebuild job contract 和 jobId 都带版本

`RebuildUserProfileJobPayload` 增加必填 `dirtyVersion`：

```ts
{
  userId: number;
  dirtyVersion: string;
  reason: UserProfileDirtyReason;
  requestedAt?: string;
  requestId?: string;
  traceId?: string;
}
```

contract 使用 decimal string schema 校验 `dirtyVersion`。rebuild jobId 构造规则改为：

```text
rebuild-user-profile|<userId>|<dirtyVersion>
```

同一用户同一版本重复 enqueue 会被 BullMQ 去重；同一用户新版本必须产生新 jobId，不能被旧 completed/failed retained job 阻塞。

旧无版本 payload 不兼容新 worker contract。部署 runbook 应要求清理旧 `user-profile` queue 或部署后运行 repair。新 worker 对旧 payload schema parse failure 只产生 queue-level failed job，不进入业务 dirty 状态。

### 4. Worker 状态转换全部用版本 CAS

worker claim：

```text
where user_id = payload.userId
  and dirty_version = payload.dirtyVersion
  and status in (pending, failed)
```

claim 成功后写入 `status=processing`、`processing_started_at=now`、`last_job_id=jobId`、`last_error=null`，但不重置 attempts。

`markProcessed` 和 `markFailed` 都必须带 `userId + dirtyVersion + status=processing` CAS。影响 0 行时表示旧版本 worker 已被新 dirty 取代，worker 返回 `stale` 并 no-op，不抛错给 BullMQ 重试。

processor 每次业务失败都写 DB failed 并继续 throw 给 BullMQ，让 BullMQ attempts/backoff 负责短期自动重试。DB `attempts` 表示当前 dirtyVersion 的 rebuild 失败次数；新 dirtyVersion 产生时重置为 0。

`buildOne(userId) === null` 表示源用户主行不存在或无法生成有效 profile。worker SHALL 删除对应 `user_profile` 行，再将 dirty 版本标记 processed，避免保留旧画像。

### 5. Repair 只重入队当前版本，backfill 产生新版本

repair 的职责是修复丢唤醒、failed dirty、stale pending、stale processing，不代表源表发生新变化。因此 repair 不调用会递增 dirtyVersion 的 markDirty 入口。

repair 流程：

```text
scan repairable rows
  status=failed
  OR status=pending and dirty_at < staleBefore
  OR status=processing and processing_started_at < staleBefore

for stale processing rows:
  CAS reset same version to pending

enqueue rebuild-user-profile(userId, dirtyVersion)
```

默认 `staleBefore = now - IAM_WORKER_USER_PROFILE_REPAIR_STALE_SECONDS`，默认建议 300 秒。

backfill 是主动要求全量用户重新生成当前 profile，因此继续扫描所有 users 主表行，调用 `markManyDirty(reason=Backfill)` 产生新 dirtyVersion，再 enqueue versioned rebuild jobs。backfill 不过滤 disabled/deleted 用户，因为 builder 应将这些用户收敛为 `searchVisible=false`。

manual rebuild 与 repair 分离：manual rebuild 才使用 `ManualRebuild` reason 并产生新版本；repair 不篡改已有 reasonCodes。

### 6. Scope expansion 保留为 worker/运维能力，不作为业务写路径事实来源

业务源表写路径继续在事务内展开 affected userIds，并持久化 user-level dirty rows。`expand-user-profile-scope` job 保留给 worker/运维或未来 manual scope rebuild command，但 API/admin-api 业务写路径 SHALL NOT 仅 enqueue scope job 作为唯一事实来源。

`@iam/user-profile-read-model` 的 producer-facing API 应避免向 API/admin-api service port 暴露 `enqueueScopeExpansionJob`。如果保留导出，也需要架构测试或 import guard 防止业务 app 误用。

组织/岗位等 scope repository 暂时沿用 active employment 展开规则。删除/禁用类写路径必须保证不会漏掉旧 affected users：要么在变更前捕获 userIds，要么通过业务约束确认无 affected users。

### 7. afterCommit enqueue 使用批量/限流

当前无界 `Promise.all(userIds.map(enqueue))` 会在大 fanout 场景制造 Redis 瞬时压力。新的 producer 应提供批量 enqueue 接口，优先使用 BullMQ `queue.addBulk`，并按配置或常量分批，例如每批 500。

批量 enqueue 仍是 best-effort。部分失败不回写 dirty 表；日志必须包含 queue name、batch size、失败数量或失败 rows、requestId、traceId 和 error。repair 后续扫描 pending/failed/stale rows 兜底。

### 8. Worker command 使用 command-only composition

`user-profile-backfill` 和 `user-profile-repair` 是 producer/ops command，不应启动 BullMQ consumers 或 worker HTTP server。`apps/worker` 需要提供 command-only composition 或参数化 composition：

```text
create module / workerService / queue
do not startConsumers
do not start HTTP server
close queue/db/redis after command
```

常驻 consumer service 和 one-shot command 分离，避免命令一边 enqueue 一边消费 jobs。

### 9. 观测与日志显式包含 dirtyVersion

worker 和 command 日志不能只依赖解析 jobId。rebuild job 处理日志应包含 `userId`、`dirtyVersion`、`jobId`、`jobName` 和结果状态 `rebuilt | missing | skipped | stale`。失败日志应包含 error 与 DB attempts。

运维指标和日志应区分 backlog 与历史状态：`status=processed` 行继续保留，表示每用户最新 rebuild state；backlog 只包括 `pending`、`processing`、`failed`。

## Risks / Trade-offs

- [Risk] 旧无版本 BullMQ jobs 在新 worker 下失败。
  Mitigation: 部署 runbook 明确清理旧 `user-profile` queue 或部署后运行 repair；旧 payload failure 不写业务 dirty failed。

- [Risk] 大组织/岗位变更仍会在事务内展开大量 userIds。
  Mitigation: 本轮保留现有一致性模型；afterCommit enqueue 分批；后续如规模压力变大再设计 `user_profile_dirty_scope` 或 durable scope outbox。

- [Risk] repair 仍是手动命令，丢唤醒自愈 SLA 依赖运维触发。
  Mitigation: 本轮保留 manual repair；后续可增加带分布式锁的周期性 repair scheduler。

- [Risk] `dirtyVersion` 使用 bigint/string 增加类型转换复杂度。
  Mitigation: 将转换封装在 `@iam/user-profile-read-model` repository/producer 边界，contract 层只接受 decimal string。

- [Risk] `processed` rows 长期保留会让表名和 backlog 语义混淆。
  Mitigation: 不改表名，但在 spec、docs 和指标中明确 `user_profile_dirty` 是每用户最新 rebuild state，processed 不计入 backlog。

## Migration Plan

1. 生成 PostgreSQL migration：`user_profile_dirty.dirty_version bigint not null default 1`，并补充 `status, processing_started_at` repair 查询索引。
2. 更新 `@iam/contracts` rebuild payload schema 和相关测试，要求 `dirtyVersion` decimal string。
3. 更新 `@iam/user-profile-read-model` dirty repository、marker、producer、worker service、repair/backfill service 及测试。
4. 更新 `apps/api`、`apps/admin-api` composition/service tests，确保 afterCommit enqueue 基于 `markManyDirty` 返回 rows。
5. 更新 `apps/worker` env、command-only composition、repair/backfill command 及测试。
6. 部署前停止 user-profile worker 并清理旧无版本 queue jobs，或部署后立即运行 repair。
7. 回滚时需要注意：如果代码回滚到旧 payload contract，已入队的新版本 job 不兼容旧 worker；应同时清理 queue 或回滚 worker/producer/db migration 到一致状态。

## Open Questions

- 无。自动 repair scheduler、orphan profile cleanup、durable scope dirty/outbox 和 manual scope rebuild command 均作为后续扩展，不进入本 change。
