## ADDED Requirements

### Requirement: Profile builder resolves roles from unified role assignments
系统 SHALL 在 user-profile builder 中通过 `role_assignment` 解析每条 active employment 的 role codes。

#### Scenario: Builder includes position role assignments
- **WHEN** active employment 的岗位存在 active role assignment
- **THEN** builder SHALL 将对应 active role code 写入该 employment 的 detail 和 search document

#### Scenario: Builder includes employment role assignments
- **WHEN** active employment 本身存在 active role assignment
- **THEN** builder SHALL 将对应 active role code 写入该 employment 的 detail 和 search document

#### Scenario: Builder includes organization role assignments
- **WHEN** active employment 的组织或其 ancestor organization 存在 active role assignment
- **THEN** builder SHALL 按 `includeDescendants` 语义判断该 role 是否作用于该 employment
- **AND** 命中的 active role code SHALL 写入该 employment 的 detail 和 search document

#### Scenario: Builder deduplicates repeated role hits
- **WHEN** 同一个 role 通过多个 assignment source 命中同一个 employment
- **THEN** builder SHALL 在该 employment 的 roles 中只保留一个 role code

### Requirement: Role assignment writes mark affected profiles dirty
系统 SHALL 在角色分配创建、删除或组织作用范围修改时持久化受影响用户的 `user_profile_dirty` 记录，并在事务提交后唤醒 user-profile worker。

#### Scenario: Organization assignment change marks organization scope dirty
- **WHEN** organization role assignment 被创建、删除或修改 `includeDescendants`
- **THEN** 系统 SHALL 使用 `UserProfileScopeType.OrganizationId` 展开受影响用户
- **AND** dirty reason SHALL 使用 `UserProfileDirtyReason.RoleUpdated`

#### Scenario: Position assignment change marks position scope dirty
- **WHEN** position role assignment 被创建或删除
- **THEN** 系统 SHALL 使用 `UserProfileScopeType.PositionId` 展开受影响用户
- **AND** dirty reason SHALL 使用 `UserProfileDirtyReason.RoleUpdated`

#### Scenario: Employment assignment change marks employment scope dirty
- **WHEN** employment role assignment 被创建或删除
- **THEN** 系统 SHALL 使用 `UserProfileScopeType.EmploymentId` 展开受影响用户
- **AND** dirty reason SHALL 使用 `UserProfileDirtyReason.RoleUpdated`

#### Scenario: Assignment deletion preserves affected scope
- **WHEN** role assignment 删除会使关系本身不可再查询
- **THEN** 系统 SHALL 在删除前捕获 target type 和 target id
- **AND** 系统 SHALL 用删除前捕获的 scope 标记 user-profile dirty

## MODIFIED Requirements

### Requirement: Scope expansion and backfill jobs
系统 SHALL 提供 user-profile worker 处理 scope expansion、backfill 和 repair job 的能力。

#### Scenario: Organization scope includes descendants
- **WHEN** worker 处理 `organization-id` scope
- **THEN** worker SHALL 展开该组织自身和所有 descendant 组织下 active employments 的用户

#### Scenario: Role scope expands all assignment sources
- **WHEN** worker 处理 `role-id` scope
- **THEN** worker SHALL 从 `role_assignment` 中按 `targetType=employment`、`targetType=position` 和 `targetType=organization` 反向展开受影响用户
- **AND** organization assignment SHALL 按 `includeDescendants` 判断是否包含 descendant 组织下的 active employments

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
