## Purpose

定义 API 用户画像读模型、持久化重建状态、批量 builder、查询服务与 worker/backfill 能力，用于后续将现有用户读取路径切换到预计算 profile。
## Requirements
### Requirement: User profile tables
系统 SHALL 在 PostgreSQL 中维护 `user_profile` 和 `user_profile_dirty` 两张表，分别保存 API 用户画像读模型和每用户最新 profile rebuild 状态。

#### Scenario: User profile row stores response and search documents
- **WHEN** 系统为 active 用户重建 profile
- **THEN** `user_profile` SHALL 保存 `user_id`、`username`、`mobile`、`wx_id`、`status`、`is_delete`、`search_visible`、`profile_schema_version`、`detail jsonb`、`search_doc jsonb` 和 `rebuilt_at`
- **AND** 每个 `user_id` MUST 最多对应一行 `user_profile`

#### Scenario: Dirty row stores latest rebuild state
- **WHEN** 系统标记用户 profile 需要重建
- **THEN** `user_profile_dirty` SHALL 以 `user_id` 为唯一键保存最新 `dirty_version`、`status`、`reason_codes`、`dirty_at`、`attempts`、`last_error`、`last_job_id` 和处理时间字段
- **AND** `dirty_version` SHALL be a per-user monotonically increasing version for the latest dirty fact
- **AND** 系统 MUST 合并同一 `markManyDirty` 批次内同一用户的重复 dirty 标记，而不是为同一用户插入多行待处理记录

#### Scenario: New dirty version resets current rebuild state
- **WHEN** 系统为已存在 dirty row 的用户持久化新的 dirty 事实
- **THEN** 系统 SHALL increment that row's `dirty_version`
- **AND** 系统 SHALL set `status` to `pending`
- **AND** 系统 SHALL set `reason_codes` to the current dirty input reasons rather than accumulating historical reasons
- **AND** 系统 SHALL reset `attempts`、`last_error`、`processing_started_at` 和 `processed_at` for the new version

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

#### Scenario: Worker app consumes worker-side APIs
- **WHEN** `apps/worker` 处理 user-profile jobs、backfill 或 repair
- **THEN** worker SHALL 通过 `@iam/user-profile-read-model` 的 worker-side service、builder、repositories 和 module factory 执行
- **AND** `apps/api` SHALL NOT 保留 user-profile worker entry 或 worker-only composition

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

### Requirement: Profile builder preserves identity detail and active search visibility
系统 SHALL 在 `@iam/user-profile-read-model` 提供用户画像 builder，批量从规范化写模型构建当前 schema version 的用户画像；builder SHALL 为身份详情保留可读取的 detail，并通过 `searchVisible` 控制搜索可见性。

#### Scenario: Build profile detail
- **WHEN** builder 为用户构建 profile
- **THEN** `detail` SHALL 符合 `UserDetailDto` 契约，并包含 active employments、每个任职的 organization context、position summary、role codes 和 privilege codes

#### Scenario: Build profile search document
- **WHEN** builder 为用户构建 profile
- **THEN** `search_doc` SHALL 使用独立 schema 保存 user 字段和 employments 检索文档
- **AND** 每个 employment search document SHALL 包含 organization ancestor codes、ancestor depths、ancestor keys、position code、role codes、privilege codes 和 primary 标记

#### Scenario: Active-only relationship filtering
- **WHEN** 任职、岗位、角色或权限处于删除或禁用状态
- **THEN** builder SHALL 仅把符合当前 `apps/api` active 视角的关系数据写入 `detail` 和 `search_doc`

#### Scenario: Inactive user detail remains hidden from search
- **WHEN** 用户处于删除或禁用状态
- **THEN** builder MAY 保留该用户当前 schema version 的 `detail`，以支持按身份读取的一致返回
- **AND** builder SHALL 将该 profile 标记为不可搜索
- **AND** 搜索查询 SHALL NOT 返回不可搜索的 profile

#### Scenario: Organization status does not filter path
- **WHEN** 任职组织路径中的组织未删除但 status 不是启用
- **THEN** builder SHALL 保留该组织路径节点
- **AND** builder MUST 排除 `is_delete=true` 的组织路径节点

### Requirement: Profile schema versioning
系统 SHALL 使用 `profile_schema_version` 标记当前 `detail` 和 `search_doc` 结构版本。

#### Scenario: Builder writes current schema version
- **WHEN** builder upsert `user_profile`
- **THEN** 系统 SHALL 写入当前 `CURRENT_USER_PROFILE_SCHEMA_VERSION`

#### Scenario: Query only reads current schema version
- **WHEN** profile query service 查询用户画像
- **THEN** 系统 SHALL 只返回 `profile_schema_version` 等于当前版本的 profile
- **AND** 系统 SHALL NOT fallback 到旧版本 profile

### Requirement: Dirty table is rebuild source of truth
系统 SHALL 将 `user_profile_dirty` 作为 profile 重建真相来源，BullMQ job 只作为唤醒器。

#### Scenario: Worker skips job without matching dirty version
- **WHEN** worker 收到 `rebuild-user-profile` job 但没有对应 `user_id`、`dirty_version` 且状态为 pending 或 failed 的 dirty row
- **THEN** worker SHALL no-op
- **AND** worker SHALL NOT build or update `user_profile`

#### Scenario: Worker claims a matching dirty version
- **WHEN** worker 收到合法 `rebuild-user-profile` job
- **THEN** worker SHALL claim the row only when `user_id`、`dirty_version` match the payload and status is `pending` or `failed`
- **AND** claim SHALL set status to `processing`、write `processing_started_at`、write `last_job_id` and clear `last_error`
- **AND** claim SHALL NOT reset `attempts`

#### Scenario: Worker marks successful rebuild with version CAS
- **WHEN** worker 成功重建用户 profile
- **THEN** worker SHALL upsert `user_profile`
- **AND** worker SHALL mark the dirty row `processed` only when `user_id`、`dirty_version` and status `processing` still match
- **AND** worker SHALL write `processed_at`

#### Scenario: Worker deletes stale profile when source user is missing
- **WHEN** worker claim 成功但 builder 无法为该 userId 找到源用户主行并返回 null
- **THEN** worker SHALL delete the corresponding `user_profile` row if present
- **AND** worker SHALL mark the matching dirty version `processed`

#### Scenario: Worker records rebuild failure with version CAS
- **WHEN** worker 重建用户 profile 失败
- **THEN** worker SHALL mark the dirty row `failed` only when `user_id`、`dirty_version` and status `processing` still match
- **AND** worker SHALL increment `attempts`
- **AND** worker SHALL update `last_error`
- **AND** worker SHALL rethrow the processing error so BullMQ retry policy can apply

#### Scenario: Older worker completion becomes stale
- **WHEN** worker attempts to mark processed or failed for an older dirtyVersion after a newer dirty version has been persisted
- **THEN** worker SHALL treat the update as stale no-op
- **AND** worker SHALL NOT throw for BullMQ retry only because the version CAS affected zero rows
- **AND** worker logs SHALL include `userId`、`dirtyVersion` and `jobId`

### Requirement: Scope expansion and backfill jobs
系统 SHALL 提供 user-profile worker 处理 scope expansion、backfill 和 repair job 的能力。

#### Scenario: Organization scope includes descendants
- **WHEN** worker 处理 `organization-id` scope
- **THEN** worker SHALL 展开该组织自身和所有 descendant 组织下 active employments 的用户

#### Scenario: Role scope expands all assignment sources
- **WHEN** worker 处理 `role-id` scope
- **THEN** worker SHALL 从 `employment_role`、`position_role` 和 `organization_role` 反向展开受影响用户

#### Scenario: Privilege scope expands through roles
- **WHEN** worker 处理 `privilege-id` scope
- **THEN** worker SHALL 通过 `role_privilege` 找到 roleIds 后按 role scope 规则展开受影响用户

#### Scenario: Backfill enqueues versioned user-level rebuilds
- **WHEN** `apps/worker` user-profile backfill command 处理 all-users backfill
- **THEN** 系统 SHALL 分批扫描 users 主表中的所有用户
- **AND** 系统 SHALL upsert dirty records with reason `Backfill` and create new dirty versions
- **AND** 系统 SHALL enqueue user-level rebuild jobs using the returned `dirtyVersion`
- **AND** command SHALL NOT synchronously rebuild profiles outside BullMQ worker processing

#### Scenario: Repair enqueues current dirty versions
- **WHEN** `apps/worker` user-profile repair command 处理 failed 或 stale dirty rows
- **THEN** 系统 SHALL enqueue user-level rebuild jobs for the current `dirty_version` of repairable rows
- **AND** repair SHALL NOT increment `dirty_version`
- **AND** repair SHALL NOT overwrite existing `reason_codes` with `ManualRebuild`
- **AND** command SHALL report repair enqueue result

#### Scenario: Repair resets stale processing before enqueue
- **WHEN** repair finds a `processing` dirty row whose `processing_started_at` is older than the stale threshold
- **THEN** repair SHALL reset the same `dirty_version` to `pending` before enqueue
- **AND** repair SHALL NOT change `dirty_at`

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

#### Scenario: Legacy search supports user name filters
- **WHEN** query service 使用包含 `names` 的旧 `UserQueryDto` 搜索用户
- **THEN** 系统 SHALL 将 `names` 编译为 `user.name` 的精确匹配条件
- **AND** 多个 `names` 值 SHALL 匹配任一姓名
- **AND** `names` SHALL 与 username、phone、wxId 和 employment 条件按现有 legacy AND 组合语义共同生效

#### Scenario: DSL requires explicit nested employment
- **WHEN** filter DSL 查询引用 employment 字段
- **THEN** DSL MUST 使用显式 nested employment 表达式
- **AND** 非 nested 上下文引用 employment 字段 SHALL 校验失败

#### Scenario: Internal DSL search is bounded
- **WHEN** internal API 调用 profile DSL 搜索并提供 `limit`
- **THEN** 系统 SHALL 拒绝超过 API user-profile DSL 最大限制的请求
- **AND** 未提供 `limit` 时系统 SHALL 使用服务端默认限制
- **AND** DSL 搜索 SHALL NOT 暴露给 public 或 open API

### Requirement: Profile indexes
系统 SHALL 为 `user_profile` 创建支持身份查找和 JSONB 检索的索引。

#### Scenario: Identity lookup indexes
- **WHEN** migration 创建 `user_profile`
- **THEN** 系统 SHALL 为 `user_id`、`username`、`mobile`、`wx_id` 和 `search_visible, profile_schema_version` 创建适合查询的索引或约束

#### Scenario: Search document index
- **WHEN** migration 创建 `user_profile`
- **THEN** 系统 SHALL 为 `search_doc` 创建 GIN 索引
- **AND** 系统 SHALL NOT 为 `detail` 创建 GIN 索引

### Requirement: Source writes produce profile dirty records
系统 SHALL 在会影响 API user profile 的源表写事务中持久化受影响用户的 `user_profile_dirty` 记录，并在事务提交后唤醒 user-profile worker。

#### Scenario: User-level write marks dirty in transaction
- **WHEN** 源表写操作已确定单个受影响 userId
- **THEN** 系统 SHALL 在同一业务事务内 upsert 该 userId 的 `user_profile_dirty` 记录
- **AND** dirty reason SHALL 使用与写操作匹配的 `UserProfileDirtyReason`
- **AND** repeated marks for the same user in one `markManyDirty` call SHALL merge current input reason codes and increment `dirty_version` once

#### Scenario: Scope write persists expanded users before wake-up
- **WHEN** 源表写操作影响组织、岗位或其它多用户 scope
- **THEN** 系统 SHALL 在同一业务事务内解析受影响 userIds 并持久化这些用户的 dirty 记录
- **AND** 系统 SHALL NOT 仅依赖 BullMQ scope expansion job 作为受影响用户的唯一事实来源

#### Scenario: Deleting or disabling relationships does not lose affected users
- **WHEN** 源表写操作会移除、禁用或删除进入 profile 的用户关系
- **THEN** 系统 SHALL capture affected userIds before the relationship becomes undiscoverable
- **OR** 系统 SHALL reject the write unless existing constraints prove that no affected users exist

#### Scenario: Worker wake-up happens after commit
- **WHEN** 业务事务成功提交
- **THEN** 系统 SHALL 通过 afterCommit best-effort enqueue versioned user-profile rebuild jobs based on dirty rows returned by `markManyDirty`
- **AND** enqueue failure SHALL be logged
- **AND** enqueue failure SHALL NOT roll back the already committed business transaction

#### Scenario: Dirty rows are repairable after enqueue failure
- **WHEN** afterCommit enqueue 失败或 job 丢失导致 dirty row 长时间停留在 pending 状态
- **THEN** user-profile repair SHALL be able to scan stale pending dirty rows
- **AND** repair SHALL enqueue rebuild jobs for those pending rows using their current dirtyVersion

#### Scenario: Producer uses shared contracts
- **WHEN** `apps/api` 或 `apps/admin-api` enqueue user-profile job
- **THEN** producer SHALL validate payloads using shared `@iam/contracts` user-profile job schemas
- **AND** producer SHALL use deterministic job identifiers for duplicate wake-up suppression at `userId + dirtyVersion` granularity

#### Scenario: Admin API does not import API private producer
- **WHEN** `apps/admin-api` marks user-profile dirty or enqueues user-profile jobs
- **THEN** it SHALL NOT import `@api` private modules
- **AND** it SHALL depend only on shared contracts/jobs/db modules, `@iam/user-profile-read-model`, or app-local ports wired to shared helpers

### Requirement: Dirty rebuild state indexes
系统 SHALL provide indexes that support repair scans and rebuild backlog observation for `user_profile_dirty`.

#### Scenario: Repair can scan stale processing rows
- **WHEN** migration creates or updates `user_profile_dirty`
- **THEN** 系统 SHALL provide an index suitable for filtering by `status` and `processing_started_at`
- **AND** 系统 SHALL keep an index suitable for filtering by `status` and `dirty_at`

### Requirement: Dirty version is internal only
系统 SHALL treat `dirtyVersion` as an internal worker/job/ops contract and SHALL NOT expose it through business API responses.

#### Scenario: User profile query hides rebuild internals
- **WHEN** public、open、admin、SSO 或 internal business read APIs return user profile data
- **THEN** responses SHALL NOT include `dirtyVersion`、`dirty_version`、dirty status、worker attempts or worker job ids
