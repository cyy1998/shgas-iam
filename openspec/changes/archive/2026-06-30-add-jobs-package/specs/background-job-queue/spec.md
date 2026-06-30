## ADDED Requirements

### Requirement: Shared job queue package
系统 SHALL 提供一个共享 `@iam/jobs` workspace package，用于创建 BullMQ-backed Queue 和 Worker，并隐藏重复的默认 options、queue name 前缀和基础事件接入逻辑。

#### Scenario: Backend app creates a queue
- **WHEN** 后端应用通过 `@iam/jobs` 使用 queue name 和 Redis 配置创建 Queue
- **THEN** 系统 SHALL 返回可 enqueue job 的 BullMQ Queue 实例，并应用统一默认 attempts/backoff 配置

#### Scenario: Backend worker creates a worker
- **WHEN** worker 进程通过 `@iam/jobs` 使用 queue name、processor 和 Redis 配置创建 Worker
- **THEN** 系统 SHALL 返回可消费对应 queue 的 BullMQ Worker 实例，并允许调用方传入并发配置

### Requirement: Dedicated queue Redis connection
系统 SHALL 为 BullMQ Queue 和 Worker 创建专用 Redis connection，不要求复用 `apps/api` 或 `apps/admin-api` 的业务 Redis singleton 实例。

#### Scenario: Queue connection is created from app config
- **WHEN** 应用向 `@iam/jobs` 传入 Redis host、port、password 和 db 配置
- **THEN** 系统 SHALL 创建供 BullMQ 使用的独立 Redis connection

#### Scenario: Business Redis lifecycle stays isolated
- **WHEN** BullMQ Queue 或 Worker 关闭自己的 Redis connection
- **THEN** 系统 SHALL NOT 关闭应用用于 session、cache、CAP 或 SMS 的业务 Redis singleton

### Requirement: Deterministic job identifiers
系统 SHALL 提供确定性 jobId 工具，支持按业务实体去重的任务入队策略。

#### Scenario: User profile rebuild job id
- **WHEN** producer 为 `userId=123` 构造 user-profile rebuild jobId
- **THEN** 系统 SHALL 生成 `rebuild-user-profile:123`

#### Scenario: User profile scope expansion job id
- **WHEN** producer 为 `scopeType=organization-id`、`scopeId=9` 和时间桶 `2026-06-30T10:00` 构造 scope expansion jobId
- **THEN** 系统 SHALL 生成包含 `expand-user-profile-scope:organization-id:9:2026-06-30T10:00` 的确定性 jobId

### Requirement: User profile job contracts
系统 SHALL 在 `@iam/contracts` 中提供 user-profile job contract，包括 queue name、job name、scope 类型、dirty reason 和 Zod payload schema，供 producer 与 worker 共同校验。

#### Scenario: Producer validates rebuild payload
- **WHEN** producer enqueue `rebuild-user-profile` job
- **THEN** 系统 SHALL 使用共享 Zod schema 校验 payload 至少包含有效 `userId`

#### Scenario: Worker rejects invalid payload
- **WHEN** worker 收到不符合 user-profile job schema 的 payload
- **THEN** 系统 SHALL 将 payload 校验为失败，并阻止 processor 使用未校验数据继续执行

#### Scenario: Admin API does not import API private modules
- **WHEN** `apps/admin-api` 后续作为 user-profile job producer
- **THEN** 系统 SHALL 允许它只依赖 `@iam/contracts` 的 job contract 和 `@iam/jobs` 的 queue helper，而不依赖 `@api` 私有模块
