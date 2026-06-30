## Why

用户画像读模型将依赖异步重建、重试和补偿任务。当前仓库只有业务 Redis 使用方式，没有共享的后台任务队列基础设施，直接在各应用里手写 BullMQ 接入会造成连接、重试、jobId 和 payload 契约不一致。

## What Changes

- 新增共享 `packages/jobs`，提供薄层 BullMQ Queue/Worker 封装、专用 Redis connection 创建、默认 retry/backoff 和确定性 jobId 工具。
- 在 `packages/contracts` 中新增 user-profile 相关 job 契约，定义 queue/job 名称、payload schema、scope 类型和 dirty reason 枚举。
- 为 `apps/api` 与 `apps/admin-api` 后续作为 producer、`apps/api` worker 后续作为 consumer 提供一致的队列基础。
- 不在本 change 中实现 `user_profile` 表、dirty 表、profile builder、worker processor 或 API 查询切换。

## Capabilities

### New Capabilities
- `background-job-queue`: 共享后台任务队列基础设施和 typed job contract，用于后续异步用户画像重建任务。

### Modified Capabilities
- 无

## Impact

- 新增 workspace package：`packages/jobs`。
- 新增或扩展共享 contracts：`packages/contracts/src/jobs/*`。
- 新增依赖：BullMQ 及其运行所需的 Redis connection 使用约束。
- 影响后续 changes：`add-user-profile-read-model`、`switch-api-user-profile-reads`、`wire-profile-dirty-producers` 将依赖本 change 提供的队列机制和 job contract。
