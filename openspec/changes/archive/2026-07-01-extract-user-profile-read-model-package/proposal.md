## Why

当前 user-profile read model 的核心实现散落在 `apps/api`、`packages/domain` 和 `packages/jobs` 中，导致后台 worker 逻辑虽然可以独立进程运行，但代码身份仍依赖 API 私有模块。后续要新增独立 `apps/worker` 并承载更多任务类型，必须先把 user-profile read model 抽成可被 API、admin-api 和 worker 共同消费的能力包。

## What Changes

- 新增 `packages/user-profile-read-model` workspace package，作为 `user_profile` 读模型的 schema、repository、builder、query、dirty、producer 和 worker service 的单一代码归属。
- 将 user-profile detail/search/DSL schema 从 `apps/api` 私有目录迁入新包，使 `user_profile.detail` 存储格式和 API 响应格式共享同一来源。
- 将 user-profile dirty repository、scope repository 和 dirty marker 从 `packages/domain` 迁入新包。
- 将 user-profile job producer 从 `packages/jobs` 迁入新包；`packages/jobs` 保留 BullMQ queue/worker/job-id/default options 等通用基础设施。
- 调整 `apps/api` 和 `apps/admin-api` composition，使其从 `@iam/user-profile-read-model` 使用 producer、dirty marker、query service 和 profile repository。
- 过渡期保留 `apps/api` 的 user-profile worker 入口，但改为依赖 `@iam/user-profile-read-model`；后续 `add-worker-app-runtime` change 将删除该入口并迁入 `apps/worker`。
- 不改变现有 API 响应语义、搜索语义、dirty 表语义、BullMQ queue name 或 job payload contract。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `user-profile-read-model`: 明确 user-profile read model 的共享包归属，并要求 API/admin-api/过渡 worker 入口不得依赖 API 私有实现来构建或查询 profile。
- `background-job-queue`: 明确 `@iam/jobs` 只提供通用 BullMQ 基础设施，业务 job producer 归属各自 capability package。

## Impact

- 新增 workspace package：`packages/user-profile-read-model`。
- 受影响应用：`apps/api`、`apps/admin-api`。
- 受影响共享包：`packages/domain`、`packages/jobs`、`packages/contracts`、`packages/db`。
- 需要更新导出、依赖、composition、架构 guard 测试和 user-profile 相关单元测试。
- 不新增数据库表或迁移；不改变 `user_profile` / `user_profile_dirty` schema。
- 不新增 `apps/worker`、Dockerfile、compose worker service、health endpoint 或 BullMQ 面板；这些属于后续 `add-worker-app-runtime` change。
