## ADDED Requirements

### Requirement: Shared user-profile read model package
系统 SHALL 提供 `@iam/user-profile-read-model` workspace package，作为 `user_profile` 读模型实现的共享能力包。

#### Scenario: Package owns read model implementation
- **WHEN** 系统实现 user-profile read model 的 schema、repository、builder、query service、dirty repository、scope repository、dirty marker、job producer 或 worker service
- **THEN** 这些实现 SHALL 归属 `@iam/user-profile-read-model`
- **AND** `@iam/user-profile-read-model` SHALL NOT import `@api/*` 或 `@admin-api/*` 私有模块

#### Scenario: API consumes query and producer side APIs
- **WHEN** `apps/api` 查询 user profile、编译 legacy search/DSL、标记 dirty 或 enqueue user-profile job
- **THEN** `apps/api` SHALL 从 `@iam/user-profile-read-model` 使用对应 query、repository、dirty marker 或 producer API
- **AND** `apps/api` SHALL NOT 继续拥有 user-profile read model 的私有 builder、repository、query 或 dirty 实现

#### Scenario: Admin API consumes producer side APIs
- **WHEN** `apps/admin-api` 在源表写事务中标记 user-profile dirty 或 enqueue user-profile job
- **THEN** `apps/admin-api` SHALL 从 `@iam/user-profile-read-model` 使用 dirty marker、scope repository、dirty repository 或 producer API
- **AND** `apps/admin-api` SHALL NOT import `@api/*` 私有 user-profile 模块

#### Scenario: Transitional API worker entry uses shared implementation
- **WHEN** 本 change 完成后 `apps/api` 过渡期 user-profile worker 入口仍存在
- **THEN** 该入口 SHALL 通过 `@iam/user-profile-read-model` 的 worker-side service、builder 和 repositories 处理 jobs
- **AND** 该入口 SHALL NOT 依赖 `apps/api/src/services/user-profile` 中的私有实现

### Requirement: User-profile contracts remain stable
系统 SHALL 保持 user-profile job、dirty 和 scope 的稳定 contract 归属在 `@iam/contracts`，供 API、admin-api、worker 和数据库 schema 共享。

#### Scenario: Contracts stay outside read model package
- **WHEN** `@iam/user-profile-read-model`、`apps/api`、`apps/admin-api` 或 `packages/db` 需要 user-profile queue name、job name、payload schema、scope type、dirty reason 或 dirty status
- **THEN** 它们 SHALL 从 `@iam/contracts` 导入这些 contract
- **AND** `packages/db` SHALL NOT depend on `@iam/user-profile-read-model`

#### Scenario: Producer uses shared contracts
- **WHEN** user-profile producer enqueue rebuild 或 scope expansion job
- **THEN** producer SHALL 使用 `@iam/contracts` 中的 Zod schema 校验 payload
- **AND** producer SHALL 使用 `@iam/jobs` 提供的 deterministic job id helper 构造 jobId

## MODIFIED Requirements

### Requirement: Active-only profile builder
系统 SHALL 在 `@iam/user-profile-read-model` 提供用户画像 builder，批量从规范化写模型构建 active-only API 用户画像。

#### Scenario: Build profile detail
- **WHEN** builder 为用户构建 profile
- **THEN** `detail` SHALL 符合 `UserDetailDto` 契约，并包含 active employments、每个任职的 organization context、position summary、role codes 和 privilege codes

#### Scenario: Build profile search document
- **WHEN** builder 为用户构建 profile
- **THEN** `search_doc` SHALL 使用独立 schema 保存 user 字段和 employments 检索文档
- **AND** 每个 employment search document SHALL 包含 organization ancestor codes、ancestor depths、ancestor keys、position code、role codes、privilege codes 和 primary 标记

#### Scenario: Active-only filtering
- **WHEN** 用户、任职、岗位、角色或权限处于删除或禁用状态
- **THEN** builder SHALL 仅把符合当前 `apps/api` active 视角的数据写入 `detail` 和 `search_doc`

#### Scenario: Organization status does not filter path
- **WHEN** 任职组织路径中的组织未删除但 status 不是启用
- **THEN** builder SHALL 保留该组织路径节点
- **AND** builder MUST 排除 `is_delete=true` 的组织路径节点

### Requirement: Profile query service
系统 SHALL 在 `@iam/user-profile-read-model` 提供 `UserProfileQueryService`，并由 `apps/api` 接入作为 API 用户详情、用户搜索和 internal DSL 搜索的 profile 读取来源。

#### Scenario: Query detail by identity
- **WHEN** 调用方按 userId、username、mobile 或 wxId 查询 profile
- **THEN** query service SHALL 返回当前 schema version 的 `UserDetailDto`
- **AND** 如果 profile 缺失，query service SHALL 返回未找到错误而不是 fallback 到源表
- **AND** 响应 SHALL NOT 暴露 `profile_schema_version`、`rebuilt_at` 或 dirty/worker 状态

#### Scenario: Legacy search preserves nested employment semantics
- **WHEN** query service 使用旧 `UserQueryDto` 搜索用户
- **THEN** 系统 SHALL 将 employment 条件编译为同一个 employment 元素内满足条件的 nested 查询语义
- **AND** 系统 SHALL 只返回当前 schema version 且 `search_visible=true` 的 profile

#### Scenario: DSL requires explicit nested employment
- **WHEN** filter DSL 查询引用 employment 字段
- **THEN** DSL MUST 使用显式 nested employment 表达式
- **AND** 非 nested 上下文引用 employment 字段 SHALL 校验失败

#### Scenario: Internal DSL search is bounded
- **WHEN** internal API 调用 profile DSL 搜索并提供 `limit`
- **THEN** 系统 SHALL 拒绝超过 API user-profile DSL 最大限制的请求
- **AND** 未提供 `limit` 时系统 SHALL 使用服务端默认限制
- **AND** DSL 搜索 SHALL NOT 暴露给 public 或 open API
