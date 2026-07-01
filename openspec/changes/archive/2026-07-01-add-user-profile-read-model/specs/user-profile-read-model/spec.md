## ADDED Requirements

### Requirement: User profile tables
系统 SHALL 在 PostgreSQL 中维护 `user_profile` 和 `user_profile_dirty` 两张表，分别保存 API 用户画像读模型和持久化重建状态。

#### Scenario: User profile row stores response and search documents
- **WHEN** 系统为 active 用户重建 profile
- **THEN** `user_profile` SHALL 保存 `user_id`、`username`、`mobile`、`wx_id`、`status`、`is_delete`、`search_visible`、`profile_schema_version`、`detail jsonb`、`search_doc jsonb` 和 `rebuilt_at`
- **AND** 每个 `user_id` MUST 最多对应一行 `user_profile`

#### Scenario: Dirty row stores latest rebuild state
- **WHEN** 系统标记用户 profile 需要重建
- **THEN** `user_profile_dirty` SHALL 以 `user_id` 为唯一键保存最新 `status`、`reason_codes`、`dirty_at`、`attempts`、`last_error`、`last_job_id` 和处理时间字段
- **AND** 系统 MUST 合并同一用户的重复 dirty 标记，而不是为同一用户插入多行待处理记录

### Requirement: Active-only profile builder
系统 SHALL 提供 `apps/api` 用户画像 builder，批量从规范化写模型构建 active-only API 用户画像。

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

#### Scenario: Worker skips job without dirty row
- **WHEN** worker 收到 `rebuild-user-profile` job 但没有对应 pending 或 failed dirty 状态
- **THEN** worker SHALL no-op

#### Scenario: Worker marks successful rebuild
- **WHEN** worker 成功重建用户 profile
- **THEN** worker SHALL upsert `user_profile`
- **AND** worker SHALL 将对应 dirty 记录标记为 `processed` 并写入 `processed_at`

#### Scenario: Worker records rebuild failure
- **WHEN** worker 重建用户 profile 失败
- **THEN** worker SHALL 将对应 dirty 记录标记为 `failed`
- **AND** worker SHALL 更新 `attempts` 和 `last_error`

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

#### Scenario: Backfill enqueues user-level rebuilds
- **WHEN** worker 或 command 处理 `all-users` backfill
- **THEN** 系统 SHALL 分批扫描用户、upsert dirty 记录并 enqueue user-level rebuild jobs

### Requirement: Profile query service
系统 SHALL 在 `apps/api` 提供 `UserProfileQueryService`，用于后续 API 读路径切换，但本 change SHALL NOT 接入现有 routes。

#### Scenario: Query detail by identity
- **WHEN** 调用方按 userId、username、mobile 或 wxId 查询 profile
- **THEN** query service SHALL 返回当前 schema version 的 `UserDetailDto`
- **AND** 如果 profile 缺失，query service SHALL 返回未找到错误而不是 fallback 到源表

#### Scenario: Legacy search preserves nested employment semantics
- **WHEN** query service 使用旧 `UserQueryDto` 搜索用户
- **THEN** 系统 SHALL 将 employment 条件编译为同一个 employment 元素内满足条件的 nested 查询语义

#### Scenario: DSL requires explicit nested employment
- **WHEN** filter DSL 查询引用 employment 字段
- **THEN** DSL MUST 使用显式 nested employment 表达式
- **AND** 非 nested 上下文引用 employment 字段 SHALL 校验失败

### Requirement: Profile indexes
系统 SHALL 为 `user_profile` 创建支持身份查找和 JSONB 检索的索引。

#### Scenario: Identity lookup indexes
- **WHEN** migration 创建 `user_profile`
- **THEN** 系统 SHALL 为 `user_id`、`username`、`mobile`、`wx_id` 和 `search_visible, profile_schema_version` 创建适合查询的索引或约束

#### Scenario: Search document index
- **WHEN** migration 创建 `user_profile`
- **THEN** 系统 SHALL 为 `search_doc` 创建 GIN 索引
- **AND** 系统 SHALL NOT 为 `detail` 创建 GIN 索引
