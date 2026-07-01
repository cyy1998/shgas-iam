## Why

`apps/api` 当前的用户详情构建和用户搜索依赖多表联查与 N+1 角色/权限聚合，后续要切到 CQRS 读模型前，需要先建立可异步重建、可回填、可查询但尚不影响线上读路径的 `user_profile` 基础能力。

## What Changes

- 新增 `user_profile` 表，按一用户一行保存 active-only API 用户画像、响应快照 `detail jsonb`、DSL 检索文档 `search_doc jsonb`、可见性与 schema version 元数据。
- 新增 `user_profile_dirty` 表，按一用户一行记录 profile 重建状态、dirty 时间、失败信息和最近处理状态，作为 BullMQ 任务之外的持久真相来源。
- 新增 `apps/api` 用户画像 builder，支持 `buildOne(userId)` 与 `buildMany(userIds)`，批量组装 `UserDetailDto` 响应快照和独立的 `search_doc`。
- 新增 `apps/api` profile query service 与 repository，但本 change 不切换现有 route/session/open/search 调用。
- 新增 `apps/api` user-profile worker/backfill/repair 入口，使用已有 `@iam/jobs` 与 `@iam/contracts` 的 user-profile job contract 消费重建任务。
- 扩展 `apps/api` env contract，提供 user-profile worker concurrency 与 batch size 默认配置。
- 不在本 change 中接入 `api/admin-api` 写路径 dirty producer；不在本 change 中让线上 API 从 `user_profile` 读取。

## Capabilities

### New Capabilities
- `user-profile-read-model`: API 用户画像读模型、dirty 状态、批量 builder、异步重建 worker 与 backfill/repair 能力。

### Modified Capabilities
- `app-env-contracts`: `apps/api` runtime env 增加 user-profile worker/backfill 配置，并继续保持 `IAM_API_*` 前缀和 env boundary 约束。

## Impact

- 数据库：新增 Drizzle schema、relations/exports 和 migration，涉及 `packages/db`。
- 后端 API：新增 `apps/api/src/services/user-profile/`、worker entry、composition wiring 和 profile query repository。
- 队列：消费 `background-job-queue` capability 中定义的 user-profile job contract。
- 配置：新增 `IAM_API_USER_PROFILE_*` raw env 与 camelCase runtime config。
- 验证：需要 `@iam/db` schema/migration 检查，`@iam/api` typecheck/test，以及相关 shared package typecheck。
