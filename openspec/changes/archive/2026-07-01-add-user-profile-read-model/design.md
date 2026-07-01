## Context

`apps/api` 当前用户详情由 live `user` 查询加 `userDetailBuilder` 组装，搜索由 `user.repository.searchUsers` 进行多表 `EXISTS` 查询。详情构建会按任职逐个查询角色和权限；搜索需要跨用户、任职、组织闭包、岗位和三类角色来源。

本 change 建立 CQRS 读模型的第二阶段基础：新增 `user_profile`/`user_profile_dirty`，实现批量 profile builder、query service、BullMQ worker/backfill/repair 入口。它依赖已有 `background-job-queue` capability 中的 `@iam/jobs` 和 user-profile job contracts。

本 change 不改变现有 public/open/internal/sso route 的读路径，也不把 admin/api 写路径接入 dirty producer。后续 `switch-api-user-profile-reads` 和 `wire-profile-dirty-producers` 分别完成读切换和增量失效接入。

## Goals / Non-Goals

**Goals:**

- 在 `packages/db` 新增 `user_profile` 和 `user_profile_dirty` schema、relations/exports 和 migration。
- 在 `apps/api` 新增 active-only 用户画像 builder，支持 `buildOne(userId)` 和 `buildMany(userIds)`。
- 生成两个解耦 JSONB 文档：`detail` 面向 `UserDetailDto` 响应快照，`search_doc` 面向 filter-only DSL/legacy search。
- 新增 `UserProfileQueryService`，支持按 id/username/mobile/wxId 查询当前版本 profile，并支持 legacy search 和 filter DSL 查询，但暂不接入现有 routes。
- 新增独立 `apps/api` worker entry，消费 user-profile rebuild、scope expansion 和 backfill/repair job。
- 新增 `apps/api` user-profile worker/backfill env 配置，并遵守 `IAM_API_*` app 前缀约束。

**Non-Goals:**

- 不切换 `/public/user-info`、`/open/users/userInfo`、`/internal/users/search` 或 `/public/users/search` 到 profile。
- 不新增 `/internal/users/search-dsl` route。
- 不在 `apps/api` 或 `apps/admin-api` 写路径中标记 dirty 或 enqueue producer。
- 不为 admin-api 创建管理员视角 profile；第一版只服务 `apps/api` active-only 画像。
- 不实现全文检索、相关性打分或 ES/OpenSearch 集成。

## Decisions

### `user_profile` 一用户一行，active-only API 画像

`user_profile` 表使用一用户一行：

- `user_id` primary key
- `username`、`mobile`、`wx_id`
- `status`、`is_delete`、`search_visible`
- `profile_schema_version`
- `detail jsonb`
- `search_doc jsonb`
- `rebuilt_at`、`create_time`、`update_time`

`profile_schema_version` 只保留当前可读版本，原地覆盖，不为同一用户保存多版本 profile。读侧只认当前版本；升级 schema 时先 backfill 新版本，覆盖率达标后再切常量。

`search_visible=false` 用于保留禁用/删除用户最后画像，同时让搜索不返回这些用户。认证边界会在后续读切换中保持 live check，不依赖 profile 旧状态。

### `detail` 和 `search_doc` 解耦

`detail` 存 `UserDetailDto` 响应快照，保持对外响应契约稳定。

`search_doc` 存内部查询文档，面向 DSL 和 legacy search，不要求结构等同于 `detail`。它保留 nested employment 语义，例如：

```json
{
  "user": {
    "id": 1,
    "username": "zhangsan",
    "name": "张三",
    "mobile": "138...",
    "wxId": "wx",
    "userType": "formal",
    "status": 1
  },
  "employments": [
    {
      "id": 10,
      "org": {
        "id": 20,
        "code": "D001",
        "ancestorCodes": ["SR", "D001"],
        "ancestorDepths": [2, 0],
        "ancestorKeys": ["SR#2", "D001#0"],
        "companyCodes": ["SHGAS"]
      },
      "position": {
        "id": 30,
        "code": "P001"
      },
      "roles": ["tender:default-user"],
      "privileges": ["ui:button:x"],
      "isPrimary": true
    }
  ]
}
```

旧 `ancestorOrgCodes + ancestorOrgDepths` 语义保持交叉组合，编译为 `ancestorKeys` 的 cross product containment。新 DSL 中 employment 条件必须显式 nested；本 change 只实现 service 层能力，不暴露 route。

### `user_profile_dirty` 是重建真相来源

`user_profile_dirty` 一用户一行，字段包括：

- `user_id` primary key
- `status`: `pending | processing | processed | failed`
- `reason_codes` jsonb 或 text array
- `dirty_at`
- `processing_started_at`
- `processed_at`
- `attempts`
- `last_error`
- `last_job_id`
- `create_time`、`update_time`

BullMQ job 是唤醒器；worker 收到 user-level rebuild job 后先检查 dirty 状态，只有存在 pending/failed stale 状态才重建。成功后标记 processed；失败后记录 failed、attempts 和 last_error。再次 dirty 时覆盖为 pending 并合并 reason。

### Builder 批量友好，不复用现有 N+1 builder

新增 profile builder 不直接复用现有 `userDetailBuilder`，而是按 userIds 批量查询：

- users
- active employments
- positions
- organization_closure + organizations
- position_roles / employment_roles / organization_roles + roles
- role_privileges + privileges

在内存中组装 `detail` 和 `search_doc`。默认 batch size 为 100，通过 env 配置覆盖。组织 path 只排除 `is_delete=true`，不因 organization status 变化过滤，保持当前 API 行为。

### Worker 作为 `apps/api` 独立入口

新增 `apps/api/src/workers/user-profile.ts`，复用 `apps/api` env、logger、DB repositories 和 `@iam/jobs` connection helper。部署上可以用同一个 API 镜像起独立进程，但本 change 不修改 Docker service。

Worker 支持：

- `rebuild-user-profile`: 读取 dirty，重建单用户 profile。
- `expand-user-profile-scope`: 根据 scope 展开受影响 userIds，批量 upsert dirty，再 enqueue user-level jobs。
- `backfill/repair`: 分批扫描用户或 dirty 状态，upsert dirty 并 enqueue user-level jobs。

scope 展开规则：

- `organization-id`: 包含自身和所有 descendants。
- `position-id`: 影响 active employments 使用该 position 的用户。
- `role-id`: 反向展开 employment_role、position_role、organization_role。
- `privilege-id`: 经 role_privilege 找到 roleIds 后按 role 规则展开。
- `employment-id`: 定位到该 employment 的 userId。
- `user-ids` 和 `all-users`: 直接批量处理。

### Query service 可实现但不接入 route

`UserProfileQueryService` 提供：

- `getDetailByUserId`
- `getDetailByUsername`
- `getDetailByMobile`
- `getDetailByWxId`
- `searchLegacyUsers`
- `searchDsl`

本 change 只新增 service/repository/test，不更改 `UserService` 或 route wiring。读切换将由后续 `switch-api-user-profile-reads` 完成。

### 索引策略

第一版索引：

- `user_id` primary key
- `username` btree
- `mobile` btree
- `wx_id` btree
- `search_visible, profile_schema_version` btree 组合索引
- `search_doc` GIN

`detail` 不建 GIN 索引，避免把响应快照误用作查询文档。

## Risks / Trade-offs

- [Risk] profile 与源表短暂不一致。
  Mitigation: 本 change 不切线上读；后续读切换会明确允许旧画像，但认证边界保持 live check。

- [Risk] builder 一次性批量查询过重。
  Mitigation: batch size 默认 100，worker concurrency 默认较低且可配置；测试覆盖多任职、多组织、多角色来源。

- [Risk] scope expansion 多重建用户。
  Mitigation: dirty 表一用户一行去重；第一版宁可多重建不漏更新。

- [Risk] schema version 升级后部分 profile 不可读。
  Mitigation: 切换当前版本前必须通过 backfill/coverage gate；读侧不兼容旧版本以降低运行时复杂度。

- [Risk] `search_doc` JSONB DSL 过早固化。
  Mitigation: `detail` 与 `search_doc` 解耦，`search_doc` 有独立 Zod schema，可按查询需求演进。

## Migration Plan

1. 新增 DB schema 和 migration，但不让现有 API 读取新表。
2. 部署 builder、worker 和 backfill command。
3. 在非生产或预生产运行 backfill，验证 `user_profile` 覆盖率、schema_version 和 failed dirty 数量。
4. 生产部署后先运行 backfill/repair，确认 profile 可用。
5. 后续 change 再切 API 读路径和写路径 dirty producer。

Rollback 策略：停止 user-profile worker；现有 API 仍走旧路径。新表保留不会影响现有运行时。

## Open Questions

- 具体 BullMQ attempts/backoff 默认值沿用 `@iam/jobs`；如果 read-model worker 需要覆盖，在实现时通过 env 或 worker options 设置。
- `search_doc` 的 DSL AST 具体 TypeScript 类型可在实现中细化，但必须保持 nested employment 显式语义。
