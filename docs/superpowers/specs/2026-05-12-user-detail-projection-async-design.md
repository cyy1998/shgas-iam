# UserDetailDto 异步搜索投影设计

## Summary

为非 admin 用户读接口新增 PostgreSQL 内的 `UserDetailDto` 搜索投影，降低用户搜索和详情读取对多表关联查询的依赖。关系表仍是唯一事实来源；投影表是最终一致的 read model。

本设计不引入 Elasticsearch。搜索数据存储在 PostgreSQL，异步刷新使用 BullMQ + 现有 Redis。第一版 worker 嵌入 API 进程，业务写操作提交后 enqueue 刷新任务；入队失败只记录日志，不阻断业务。

非 admin 用户读接口改用投影：

- `public/internal users/search`
- 非 admin 用户详情读取
- 密码校验、登录时密码比对仍查用户主表，不读投影

投影缺失时不回源：search 查不到，detail 返回 404。Redis session 中已缓存的用户详情本次暂不跟随刷新。

## Data Model

新增投影表 `user_detail_projection`。建议放在 `apps/api/src/db/schema/core/`，使用 `snakeCase.table` 定义，并在 schema index 中导出。

核心字段：

```ts
id: serial primary key
userId: integer not null unique
username: varchar(64) not null unique
mobile: varchar(20)
wxId: varchar(255)
status: integer not null
detail: jsonb not null
searchIndex: jsonb not null
refreshedAt: timestamp not null
createdAt / updatedAt
```

`detail` 保存 `UserDetailDto`，用于接口响应。`searchIndex` 是内部查询索引，不对外返回。禁止写入 `password` 等敏感字段。

建议索引：

- unique: `user_id`
- unique: `username`
- btree: `mobile`
- btree: `wx_id`
- btree: `status`
- GIN: `search_index`

第一版不加 `search_text`。如果后续要把 admin fuzzy search 或非 admin 文本搜索也迁入投影，再引入 `searchText + pg_trgm`。

内部 `searchIndex` 结构：

```ts
type UserDetailSearchIndex = {
  employments: Array<{
    employmentId: number;
    status: number;
    isDelete: boolean;
    orgCode: string;
    compCode: string;
    posCode: string;
    roleCodes: string[];
    privilegeCodes: string[];
    ancestorOrgs: Array<{
      orgCode: string;
      depth: number;
    }>;
  }>;
};
```

`ancestorOrgs` 从 `organization_closure + organization` 构建，用于保留现有 `ancestorOrgCodes/ancestorOrgDepths` 查询能力，同时不污染对外 DTO。

## Async Job Design

新增通用异步任务模块，建议目录：

```txt
apps/api/src/lib/async-jobs/
```

职责：

- 创建 BullMQ queue
- 创建嵌入式 worker
- 定义通用 job envelope
- 使用 Zod 校验 job data
- 分发到业务 handler
- 统一 attempts/backoff/logging

通用 envelope：

```ts
type AsyncJobEnvelope<TName extends string, TPayload> = {
  name: TName;
  version: 1;
  payload: TPayload;
  meta: {
    reason: string;
    source?: string;
    requestId?: string;
    requestedAt: string;
  };
};
```

当前第一种任务：

```ts
type ProjectionRefreshJob = AsyncJobEnvelope<
  "projection.refresh",
  {
    projection: "user-detail";
    target: {
      entityType: "user";
      entityId: number;
    };
  }
>;
```

队列名第一版使用单队列：

```txt
iam:async-jobs
```

用户投影刷新 jobId：

```txt
projection:user-detail:user:${userId}
```

默认任务选项：

```ts
attempts: 5
backoff: { type: "exponential", delay: 1000 }
removeOnComplete: 1000
removeOnFail: false
```

worker 嵌入 API 进程启动。初始化必须单例化，设置较小并发上限，避免重建任务挤占请求资源。API 多副本部署时，每个副本都可以启动 worker，由 BullMQ 竞争消费。

worker 分发：

```ts
switch (job.data.name) {
  case "projection.refresh":
    return handleProjectionRefresh(job.data);
}
```

投影 handler 再按 `payload.projection` 分发：

```ts
switch (job.payload.projection) {
  case "user-detail":
    return refreshUserDetailProjection(job.payload.target.entityId);
}
```

业务层只调用 enqueue helper，不直接依赖 BullMQ：

```ts
enqueueUserDetailProjectionRefresh(userIds, {
  reason: "employment.changed",
  source: "employment.update",
});
```

写操作提交后再 enqueue。入队失败只记录错误日志，不回滚业务事务。

## Projection Build And Invalidation

刷新粒度固定为 `userId`。不做字段级 patch，每次从事实表完整重建投影。

核心刷新流程：

```ts
refreshUserDetailProjection(userId: number): Promise<void>
```

流程：

1. 查询用户主表。
2. 用户不存在、禁用或软删除时，删除对应投影。
3. 用户有效时，从事实表构建完整 `UserDetailDto`。
4. 同时构建内部 `UserDetailSearchIndex`。
5. 使用 `UserDetailDtoSchema` 和 searchIndex Zod schema 校验。
6. upsert `user_detail_projection`。

为避免循环依赖，投影 builder 必须只读事实表，不读投影表，不 enqueue 任务。现有 `getUserDetailById/getUserDetailByUsername` 后续可能改为读投影，因此 builder 应抽为独立底层函数，例如：

```ts
buildUserDetailProjectionFromSource(userId: number)
```

写入口到 affected userIds 的映射：

- 用户创建、更新、状态变更、删除、手机号绑定：刷新该用户。
- 任职创建、更新、状态变更、删除、转岗、设置主岗、离职：刷新该任职所属用户。
- 组织更新、状态变更、删除：查询该组织及子孙组织下的活跃任职用户，批量刷新。
- 岗位更新、状态变更、删除：查询使用该岗位的活跃任职用户，批量刷新。
- 任职角色绑定变更：刷新该任职所属用户。
- 岗位角色绑定变更：刷新使用该岗位的活跃任职用户。
- 组织角色绑定变更：按 `organization_role.is_all_sub` 决定刷新直属组织或组织子树下的活跃任职用户。
- 角色权限绑定变更：查询通过该 role 获得权限的所有用户，批量刷新。

建议新增 resolver repository 方法集中处理复杂映射：

```ts
findUserIdsByOrganizationScope(orgId: number, includeSubtree: boolean): Promise<number[]>
findUserIdsByPosition(posId: number): Promise<number[]>
findUserIdsByRole(roleId: number): Promise<number[]>
findUserIdsByPrivilege(privilegeId: number): Promise<number[]>
```

批量 enqueue 时去重 userIds，并依赖 BullMQ jobId 合并同一用户短时间内的重复刷新。

## Query Semantics

非 admin 用户查询 DTO 和响应 DTO 保持不变，只替换数据来源。

用户级条件走投影表普通列：

- `usernames`
- `phones`
- `wxIds`
- `status`
- 非删除、可用用户

任职级条件包括：

- `ancestorOrgCodes`
- `ancestorOrgDepths`
- `positionCodes`
- `roleCodes`

新的 employment 匹配规则：

- 如果没有传任一任职级条件，不要求用户存在 active employment。
- 如果传了任一任职级条件，必须存在同一个 active employment 同时满足所有传入条件。

投影查询用 `searchIndex.employments` 表达同一任职匹配，避免把不同任职上的组织、岗位、角色拍平成用户级数组后产生误命中。

概念查询：

```ts
exists employment in searchIndex.employments where
  employment.status == Enable
  employment.isDelete == false
  and posCode matches positionCodes when provided
  and roleCodes overlaps query.roleCodes when provided
  and ancestorOrgs matches ancestorOrgCodes/depths when provided
```

PostgreSQL 实现优先封装为 repository helper，例如：

```ts
userDetailProjectionEmploymentMatches(query)
```

Drizzle 中使用受控 SQL helper 生成 `jsonb_path_exists` 或等价 JSONB 条件，不在业务 service 中散落字符串 SQL。

投影缺失策略：

- search：缺失投影的用户不会出现在结果中。
- detail：缺失投影返回 404。
- 不同步回源，不在请求链路内重建。

## Backfill, Operations, And Validation

新增批量重建命令：

```bash
pnpm --filter @iam/api projection:rebuild:user-detail
```

命令职责：

- 扫描所有有效用户。
- 按批次 enqueue `projection.refresh/user-detail`。
- 支持日志输出总数、成功入队数、失败数。
- 不直接在 CLI 中拼装投影，保持重建逻辑集中在 worker/builder。

上线顺序：

1. 新增表结构、索引和 BullMQ 依赖。
2. 部署带 worker 的 API。
3. 运行批量重建命令。
4. 抽样对比投影结果与事实表关联查询结果。
5. 将非 admin 用户读路径切换到投影。

最小验证：

- `pnpm --filter @iam/api typecheck`
- `pnpm --filter @iam/api lint`
- Drizzle migration 生成和审查。
- 批量重建后抽样校验用户详情字段、任职角色、权限、组织祖先索引。
- 手测非 admin `users/search`：
  - 只传用户名/手机号/微信号，没有任职条件时，不要求 active employment。
  - 传 `ancestorOrgCodes` 时，只返回同一 active employment 命中的用户。
  - 传 `ancestorOrgCodes + positionCodes + roleCodes` 时，必须同一 employment 同时满足。
  - 投影缺失用户不返回。
- 手测非 admin detail：
  - 投影存在时返回 `UserDetailDto`。
  - 投影缺失时返回 404。
- 手测写操作后 BullMQ 刷新：
  - 用户更新。
  - 任职转岗。
  - 组织/岗位名称变更。
  - 角色权限绑定变更。

## Assumptions And Defaults

- 关系表仍是唯一事实来源；投影表只服务读优化。
- 投影刷新是秒级最终一致。
- 第一版不保证数据库提交和 BullMQ 入队的原子性；入队失败只记录日志。
- 第一版 worker 嵌入 API 进程，不单独部署 worker 服务。
- 第一版不刷新或踢出 Redis session 中已缓存的旧 `UserDetailDto`。
- 第一版不引入 Elasticsearch，不新增 PostgreSQL 外的搜索组件。
- 第一版不做字段级 patch，统一按 userId 完整重建。
- 第一版不引入 `searchText/pg_trgm`，除非后续把模糊搜索也迁入投影。
