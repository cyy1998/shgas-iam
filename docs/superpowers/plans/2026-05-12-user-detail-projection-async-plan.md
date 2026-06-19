# UserDetailDto 异步搜索投影实施计划

> 给 agentic worker 的说明：按任务逐项实现。保持变更聚焦，运行每个任务末尾列出的验证命令；在 projection table、worker、enqueue trigger 和 backfill command 全部到位之前，不要把非 admin 读路径切换到 projection。

## 概览

实现 `docs/superpowers/specs/2026-05-12-user-detail-projection-async-design.md` 中的设计。

该功能会增加一个基于 PostgreSQL 的 `UserDetailDto` read model，并通过 BullMQ 异步刷新。关系表仍然是事实来源。Projection 存储公开的 `detail` JSONB 和私有的 `searchIndex` JSONB。在 backfill 路径存在后，非 admin 用户读取将切换到 projection。

关键选择：

- BullMQ queue name：`iam:async-jobs`
- Worker 部署方式：嵌入 API 进程
- Job envelope：通用 `AsyncJobEnvelope`
- 第一个 job：`projection.refresh`，并带 `projection: "user-detail"`
- User projection jobId：`projection:user-detail:user:${userId}`
- Projection miss 行为：search 省略该用户；detail 返回 404
- 读取时不回退到 source
- 本功能不刷新 Redis session
- 不做字段级 patch；按 `userId` 重建完整 projection
- Employment 搜索条件：只有存在至少一个 employment 条件时，才要求 active employment

## 任务 1：增加 BullMQ 依赖和运行时配置

- 将 `bullmq` 添加到 `apps/api/package.json`。
- 增加 API env 配置来控制 worker 行为：
  - `ASYNC_JOBS_ENABLED`：类 boolean 值，默认在测试外启用。
  - `ASYNC_JOBS_WORKER_CONCURRENCY`：数字默认值，建议为 `2`。
- Redis 连接设置基于现有 `@api/lib/clients/redis` 配置值。
- 不引入新的 Redis 部署或连接来源。

验证：

```bash
pnpm install
pnpm --filter @iam/api typecheck
```

## 任务 2：创建 User Detail Projection Schema

- 在 `apps/api/src/db/schema/core/` 下为 `user_detail_projection` 增加 Drizzle schema 文件。
- 使用 `snakeCase.table`。
- 定义列：
  - `id`
  - `userId`
  - `username`
  - `mobile`
  - `wxId`
  - `status`
  - `detail`，JSONB，类型为 `UserDetailDto`
  - `searchIndex`，JSONB，类型为 `UserDetailSearchIndex`
  - `refreshedAt`
  - 与本地 schema helper 一致的时间戳列
- 增加索引：
  - unique `userId`
  - unique `username`
  - btree `mobile`
  - btree `wxId`
  - btree `status`
  - GIN `searchIndex`
- 从 `apps/api/src/db/schema/core/index.ts` 导出该 schema。
- 在有用的位置增加通过 `drizzle-orm/zod` 派生的 Zod schema。

验证：

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api db:generate
```

## 任务 3：定义 Projection 类型和 Search Index Schema

- 增加 service 级类型和 schema：
  - `UserDetailSearchIndex`
  - `UserDetailProjection`
- 保持 `UserDetailDto` 不变。
- 写入前使用 Zod 校验 `searchIndex`。
- 包含 employment 索引字段：
  - `employmentId`
  - `status`
  - `isDelete`
  - `orgCode`
  - `compCode`
  - `posCode`
  - `roleCodes`
  - `privilegeCodes`
  - `ancestorOrgs: { orgCode, depth }[]`

验证：

```bash
pnpm --filter @iam/api typecheck
```

## 任务 4：实现通用 Async Job 基础设施

- 创建 `apps/api/src/lib/async-jobs/`。
- 定义 `AsyncJobEnvelope<TName, TPayload>`，并为支持的 job union 增加 Zod schema。
- 创建名为 `iam:async-jobs` 的 BullMQ queue singleton。
- 增加通用 enqueue helper，要求：
  - 填充 `meta.requestedAt`
  - 应用默认 attempts/backoff/remove 选项
  - 接受确定性的 `jobId`
  - 记录 enqueue 失败日志，并且默认不在业务写路径中抛出
- 增加嵌入式 worker initializer，要求：
  - singleton-safe
  - 检查 `ASYNC_JOBS_ENABLED`
  - 使用配置的 concurrency
  - dispatch 前使用 Zod 解析 job data
  - 记录 completed 和 failed job
- 从 API 启动流程接入 worker 初始化，不改变 route 行为。

验证：

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api lint
```

## 任务 5：增加 Projection Refresh Job Handler

- 增加 `projection.refresh` job schema：

```ts
{
  name: "projection.refresh",
  version: 1,
  payload: {
    projection: "user-detail",
    target: { entityType: "user", entityId: number }
  },
  meta: { reason, source, requestId?, requestedAt }
}
```

- 实现 handler dispatch：
  - `projection.refresh`
  - `projection: "user-detail"`
- 增加公共 helper：

```ts
enqueueUserDetailProjectionRefresh(userIds, meta)
```

- enqueue 前对输入 userIds 去重。
- 使用 `jobId = projection:user-detail:user:${userId}`。

验证：

```bash
pnpm --filter @iam/api typecheck
```

## 任务 6：从 Source Tables 构建 Projection

- 增加只读 source 的 builder，不读取 `user_detail_projection`，也不 enqueue jobs：

```ts
buildUserDetailProjectionFromSource(userId: number)
```

- 尽可能复用现有 DTO schema 和 converter。
- 重建：
  - `UserDetailDto.detail`
  - `UserDetailSearchIndex.searchIndex`
- 从 `organization_closure + organization` 构建 `ancestorOrgs`。
- 保持 role 和 privilege 聚合行为与现有 `UserDetailDto` 兼容。
- 如果用户缺失、禁用或软删除，返回 delete signal，而不是 projection payload。

验证：

```bash
pnpm --filter @iam/api typecheck
```

## 任务 7：增加 Projection Repository

- 实现 repository 函数：

```ts
upsertUserDetailProjection(projection)
deleteUserDetailProjectionByUserId(userId)
getUserDetailProjectionByUsername(username)
getUserDetailProjectionByUserId(userId)
searchUserDetailProjections(query)
```

- `upsert` 必须更新 `username/mobile/wxId/status/detail/searchIndex/refreshedAt`。
- 当 source user 被禁用、删除或缺失时，使用 `delete`。
- Repository SQL helper 保持隔离；不要把 JSONB SQL 分散到 service 文件中。

验证：

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api lint
```

## 任务 8：实现 Projection Search 语义

- 使用不变的输入和输出语义实现 `searchUserDetailProjections(query: UserQueryDto)`，但应用新的 employment 规则。
- 用户级过滤：
  - `usernames`
  - `phones`
  - `wxIds`
  - enabled status
  - 未删除的 projection records
- Employment 级过滤：
  - `ancestorOrgCodes`
  - `ancestorOrgDepths`
  - `positionCodes`
  - `roleCodes`
- 只有在至少提供一个 employment-level filter 时，才增加 active employment JSONB 条件。
- 当存在 employment filters 时，要求同一条 active employment 满足所有已提供的 employment filters。
- 使用类似如下的 repository helper：

```ts
userDetailProjectionEmploymentMatches(query)
```

- 优先使用 `jsonb_path_exists`，或把等价 JSONB 逻辑包在一个 helper 中。

验证场景：

- 只按 username 搜索时，即使用户没有 active employment，也会返回 enabled user。
- 按 `ancestorOrgCodes` 搜索时，要求 active employment。
- 按 `ancestorOrgCodes + positionCodes + roleCodes` 搜索时，要求同一条 active employment 满足全部条件。

验证：

```bash
pnpm --filter @iam/api typecheck
```

## 任务 9：实现 Refresh Handler

- 实现：

```ts
refreshUserDetailProjection(userId: number): Promise<void>
```

- Handler 流程：
  - 调用 source builder
  - 对缺失、禁用、删除的用户删除 projection
  - 校验 DTO 和 search index
  - upsert projection
- 确保 handler 幂等且可安全重试。
- 失败时记录足够上下文：
  - `userId`
  - job name
  - job id
  - meta 中的 reason/source

验证：

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api lint
```

## 任务 10：增加受影响用户 Resolver 函数

- 增加 resolver repository 函数：

```ts
findUserIdsByOrganizationScope(orgId: number, includeSubtree: boolean)
findUserIdsByPosition(posId: number)
findUserIdsByRole(roleId: number)
findUserIdsByPrivilege(privilegeId: number)
```

- `findUserIdsByOrganizationScope` 必须支持：
  - 仅直接组织
  - 通过 `organization_closure` 覆盖组织子树
- `findUserIdsByRole` 必须包含通过以下路径受影响的用户：
  - `employment_role`
  - `position_role`
  - `organization_role`
  - `organization_role.is_all_sub`
- 返回去重后的 userIds。

验证：

```bash
pnpm --filter @iam/api typecheck
```

## 任务 11：从写路径 Enqueue Refresh Jobs

在业务事务成功后增加 enqueue 调用。不要在 transaction commit 前 enqueue。

用户写路径：

- create user
- update user
- update user status
- delete user
- set mobile
- resign user

任职写路径：

- create employment
- update employment
- update employment status
- delete employment
- transfer employment
- set primary employment

组织写路径：

- update organization
- update organization status
- delete organization

岗位写路径：

- update position
- update position status
- delete position

角色与权限绑定路径：

- role assigned to employment
- role removed from employment
- role assigned to position
- role assigned to organization
- role privilege assigned
- any future role privilege removal path

每次 enqueue 调用都必须设置有用的 metadata：

```ts
reason: "employment.changed"
source: "employment.update"
```

验证：

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api lint
```

## 任务 12：增加 Backfill Command

- 增加 API package script：

```bash
projection:rebuild:user-detail
```

- 实现一个 Bun script，要求：
  - 扫描所有应该拥有 projection 的有效用户
  - 分批处理 userIds
  - enqueue `projection.refresh/user-detail`
  - 记录 total count、enqueue success count 和 failures
- 该脚本不得直接构建 projection JSON；它应该 enqueue jobs，使生产和 backfill 使用同一个 builder。

验证：

```bash
pnpm --filter @iam/api projection:rebuild:user-detail
```

## 任务 13：将非 Admin 用户读取切换到 Projection

- 更新非 admin `searchUsers(query)`，改为从 `user_detail_projection` 读取。
- 更新非 admin 用户详情读取，使用 projection：
  - by id
  - by username
  - by mobile
  - by wxId
- 密码检查和任何 password-sensitive 路径继续使用 source `users` 表。
- 除非 admin search/detail 路径明确消费同一个非 admin service，否则本任务不改变 admin 路径。
- 保持响应 DTO 不变。
- Projection miss 行为：
  - search 省略缺失 records
  - detail 抛出 `UserNotFoundError` 或现有等价 404

验证：

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api lint
```

手动冒烟：

- `POST /users/search` 只按 username 搜索。
- `POST /users/search` 带 `ancestorOrgCodes` 搜索。
- 对 projected 和 non-projected users 调用 `GET /internal/users/:username`。
- 登录后访问 public current-user detail route，确认它不使用 projection 中的 password 字段。

## 任务 14：Migration 与 Rollout 验证

- 生成并审查 Drizzle migration SQL。
- 启动本地依赖。
- 应用 migration。
- 启动已启用嵌入式 worker 的 API。
- 运行 backfill command。
- 对比 source detail 与 projection detail 的样例：
  - user base fields
  - employments
  - roles
  - privileges
  - ancestor search index
- 验证写入触发刷新：
  - update user name
  - transfer employment
  - update organization name
  - update position name
  - change role privilege binding

最终验证：

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api lint
pnpm --filter @iam/api db:generate
```

## 回滚说明

- 如果 projection reads 行为异常，只回滚非 admin read-path switch，恢复到原 source-table services。
- 如果 projection table、worker 和 enqueue triggers 没有造成运维问题，可以保留它们；在修复 query 期间它们可以继续预热数据。
- 如果 worker processing 造成压力，用 `ASYNC_JOBS_ENABLED=false` 禁用。
- 不需要将数据迁回 source tables，因为 projection data 是派生数据。
