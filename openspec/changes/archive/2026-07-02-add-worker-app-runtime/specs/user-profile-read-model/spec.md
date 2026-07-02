## MODIFIED Requirements

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
- **WHEN** `apps/worker` user-profile backfill command 处理 all-users backfill
- **THEN** 系统 SHALL 分批扫描用户、upsert dirty 记录并 enqueue user-level rebuild jobs
- **AND** command SHALL NOT synchronously rebuild profiles outside BullMQ worker processing

#### Scenario: Repair enqueues repairable dirty rows
- **WHEN** `apps/worker` user-profile repair command 处理 failed 或 stale dirty rows
- **THEN** 系统 SHALL enqueue user-level rebuild jobs for repairable rows
- **AND** command SHALL report repair enqueue result
