## Context

用户画像 CQRS 读模型会在后续 changes 中通过 BullMQ 异步重建。当前仓库已经有 Redis runtime 和 `ioredis` 使用方式，但没有共享的后台任务队列机制，也没有跨 `apps/api`、`apps/admin-api` 和 worker 进程共享的 typed job contract。

本 change 只建立队列基础设施和 user-profile job 契约。它不创建 `user_profile`/`user_profile_dirty` 表，不实现 profile builder，不启动 worker processor，也不切换任何 API 查询路径。

## Goals / Non-Goals

**Goals:**

- 新增 `@iam/jobs` workspace package，封装 BullMQ Queue/Worker 的薄通用能力。
- 为队列使用创建专用 Redis connection，不复用 HTTP/session/cache 使用的 app Redis singleton。
- 统一确定性 jobId、默认 attempts/backoff、queue name 前缀和事件日志 hook 的接入点。
- 在 `@iam/contracts` 中定义 user-profile job payload schema、job name、scope 类型和 dirty reason 枚举，供 producer 和 worker 共享。

**Non-Goals:**

- 不实现用户画像读模型、dirty/outbox 表或 profile rebuild processor。
- 不把 `apps/api` 或 `apps/admin-api` 改成队列 producer。
- 不新增独立 worker app 或 Docker service。
- 不引入复杂 job registry、decorator 或模块系统。

## Decisions

### 新增 `packages/jobs`，保持薄通用封装

`@iam/jobs` 只提供机制能力，例如：

- `createJobQueue`
- `createJobWorker`
- `createBullMqConnection`
- `buildDeterministicJobId`
- 默认 retry/backoff options

它不包含 user-profile 业务常量、DB schema、profile dirty reason 或 builder 逻辑。

替代方案是把 BullMQ helper 放入 `packages/api-core`。不采用该方案，因为 `api-core` 已经承载 HTTP、session、Redis、uow 等基础设施，继续加入 queue 机制会扩大包职责；独立 `packages/jobs` 更容易被后续后台任务复用。

### 业务 job 契约放在 `packages/contracts`

user-profile job 的 queue name、job name、payload schema、scope 类型和 dirty reason 放在 `@iam/contracts`，而不是 `@iam/jobs` 或 `apps/api`。

这样 `apps/admin-api` 可以作为 producer 引用同一契约，而不需要 import `@api/...` 私有模块；`apps/api` worker 也能用同一 schema 校验收到的 job payload。

### BullMQ 使用专用 Redis connection

`@iam/jobs` 提供从 Redis 配置创建 BullMQ connection 的 helper。应用 runtime 传入 Redis 配置，jobs 包创建专用连接实例。

不复用现有 app Redis singleton 的原因是 BullMQ Queue/Worker 属于长生命周期后台任务对象，连接关闭、重连、阻塞命令和事件监听的生命周期应与 session/cache Redis 调用隔离。

### JobId 必须确定性

user-profile 相关契约采用确定性 jobId 策略：

- `rebuild-user-profile:{userId}`
- `expand-user-profile-scope:{scopeType}:{scopeId}:{bucket}`

用户级任务强去重；scope 任务按 scope 与时间桶去重，避免短时间重复变更刷爆队列。

### Payload 必须用 Zod schema 校验

Producer enqueue 前和 worker process 前都应 parse payload。schema 位于 `@iam/contracts`，并导出推导类型。为支持这一点，`@iam/contracts` 需要新增 `zod` 运行时依赖。

## Risks / Trade-offs

- [Risk] BullMQ 引入新的 Redis 使用形态，Redis 配置不当会影响任务可靠性。
  Mitigation: `@iam/jobs` 明确专用 connection 和默认 options；部署文档在后续 worker change 中补充 Redis 持久化与 `noeviction` 要求。

- [Risk] `packages/jobs` 过度抽象会拖慢首个业务落地。
  Mitigation: 只提供薄函数封装，不做 registry、decorator 或 app framework。

- [Risk] user-profile job contract 先于 read model 实现，可能与后续 dirty 表字段有轻微调整。
  Mitigation: contract 只覆盖稳定的 job name、scope、payload 和 dirty reason，具体 DB 状态字段留给后续 change。

## Migration Plan

1. 新增 `packages/jobs` 并纳入 workspace build/lint/typecheck。
2. 新增 `@iam/contracts` job exports 和 Zod payload schemas。
3. 为 `@iam/jobs` 与 `@iam/contracts` 添加 focused tests。
4. 本 change 合入后不会改变运行时行为；后续 changes 再接入 producer/worker。

Rollback 策略：移除 `packages/jobs` 和 contracts job exports 即可；本 change 不改变现有 API 或后台运行路径。

## Open Questions

- BullMQ 具体版本在实现时按当前 workspace 兼容性选择。
- Redis production 连接细节、worker concurrency 和 queue metrics 将在 worker/read-model changes 中落地。
