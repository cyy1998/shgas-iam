# authorization-model Specification

## Purpose
描述当前系统已经实现的数据层角色/权限模型、用户详情权限聚合、用户搜索角色过滤，以及管理端 tier 的 admin client/admin role 鉴权。该 baseline 不声明尚未实现的细粒度路由权限策略。
## Requirements
### Requirement: 角色和权限通过显式关联表建模
系统 SHALL 使用显式 join table 表达角色到权限，以及角色到组织、岗位和任职目标的分配关系。

#### Scenario: 角色权限关系
- **WHEN** 系统表达 role 与 privilege 的关联
- **THEN** 系统 SHALL 使用 `role_privilege` 的 `(roleId, privilegeId)` 复合主键

#### Scenario: 统一角色分配关系
- **WHEN** 系统表达 role 与 organization、position 或 employment 的关联
- **THEN** 系统 SHALL 使用 `role_assignment`
- **AND** `role_assignment.roleId` SHALL 指向 role
- **AND** `role_assignment.targetType` SHALL 使用 `organization`、`position` 或 `employment`
- **AND** `role_assignment.targetId` SHALL 保存对应目标的主键 id

#### Scenario: 角色分配不重复
- **WHEN** 系统保存 role assignment
- **THEN** 同一个 `(roleId, targetType, targetId)` 组合 SHALL 最多存在一条记录

#### Scenario: 组织角色下级语义
- **WHEN** 系统表达 organization role assignment 是否作用于下级组织
- **THEN** 系统 SHALL 使用 `role_assignment.includeDescendants`
- **AND** 该语义 SHALL 仅对 `targetType=organization` 生效

#### Scenario: 不支持用户直接角色
- **WHEN** 系统表达 role assignment target type
- **THEN** 系统 SHALL NOT 支持 user 直接角色 target type

### Requirement: 查询雇佣角色
系统 SHALL 为指定 employment 查询 active roles，角色来源包括统一分配表中的岗位、组织和任职直接分配。

#### Scenario: 岗位角色生效
- **WHEN** role 通过 `role_assignment` 以 `targetType=position` 分配到 employment 的岗位
- **THEN** 系统 SHALL 将该 role 视为 employment 的角色

#### Scenario: 组织本级角色生效
- **WHEN** role 通过 `role_assignment` 以 `targetType=organization` 分配到 employment 的组织
- **THEN** 系统 SHALL 将该 role 视为 employment 的角色

#### Scenario: 组织下级角色生效
- **WHEN** organization role assignment 的 `includeDescendants` 为 true，且 assignment target organization 是 employment 组织的祖先
- **THEN** 系统 SHALL 将该 role 视为 employment 的角色

#### Scenario: 组织下级角色不生效
- **WHEN** organization role assignment 的 `includeDescendants` 为 false，且 assignment target organization 不是 employment 的直接组织
- **THEN** 系统 SHALL NOT 将该 role 视为 employment 的角色

#### Scenario: 任职直接角色生效
- **WHEN** role 通过 `role_assignment` 以 `targetType=employment` 直接分配到 employment
- **THEN** 系统 SHALL 将该 role 视为 employment 的角色

#### Scenario: 只返回 active role
- **WHEN** role status 不是 `RoleStatus.Enable` 或 role 已软删除
- **THEN** 系统 SHALL NOT 将该 role 视为 employment 的 active role

#### Scenario: 多来源角色去重
- **WHEN** 同一个 role 同时通过岗位、组织或任职直接分配命中同一个 employment
- **THEN** employment 的角色结果 SHALL 按 role 去重

### Requirement: 查询角色权限
系统 SHALL 通过 role_privilege 关系查询角色拥有的权限。

#### Scenario: 根据 roleIds 查询权限
- **WHEN** 系统获得一个或多个 role id
- **THEN** 系统 SHALL 查询 role_privilege 关联的 privilege 记录

#### Scenario: roleIds 为空
- **WHEN** 系统请求查询权限时 roleIds 为空数组
- **THEN** 系统 SHALL 返回空权限列表

### Requirement: 用户详情聚合角色权限
系统 SHALL 在用户详情中聚合所有启用雇佣的角色和权限。

#### Scenario: 聚合用户角色权限
- **WHEN** 系统构建用户详情
- **THEN** 系统 SHALL 查询该用户 status 为 Enable 且未软删除的 employments
- **AND** 系统 SHALL 为每个 employment 查询 roles 和 privileges
- **AND** 用户详情 SHALL 包含去重后的 role code 列表和 privilege code 列表

### Requirement: 用户搜索按角色过滤
系统 SHALL 在用户目录查询中支持按 role code 过滤用户。

#### Scenario: 角色过滤用户
- **WHEN** 用户搜索请求包含 roleCodes
- **THEN** 系统 SHALL 匹配用户 active employment 上通过统一 `role_assignment` 的岗位、任职直接或组织来源获得的 active role
- **AND** 系统 SHALL 只返回启用且未软删除用户

#### Scenario: 组织角色按深度匹配
- **WHEN** 角色来自 organization role assignment 且匹配下级组织
- **THEN** 系统 SHALL 仅在 closure depth 大于 0 且 `role_assignment.includeDescendants` 为 true 时匹配后代组织

### Requirement: 管理端 tier 需要 admin client 和 admin role
系统 SHALL 在 admin 和 rpc tier 中校验请求来源 client 以及当前用户 admin role。

#### Scenario: Client 不在管理端允许列表
- **WHEN** admin 或 rpc 请求缺少 Client header，或 Client 不在 `IAM_ADMIN_API_ADMIN_CLIENT_CODES` 配置列表中
- **THEN** 系统 SHALL 拒绝请求并报告无管理端访问权限

#### Scenario: 用户没有管理端角色
- **WHEN** admin 或 rpc 请求的 session 用户 roles 不包含 `IAM_ADMIN_API_ADMIN_ROLE_CODES` 配置列表中的任一 role
- **THEN** 系统 SHALL 拒绝请求并报告无管理端访问权限

#### Scenario: 管理端鉴权通过
- **WHEN** 请求 Client 在允许列表中，且 session 用户拥有任一 admin role
- **THEN** 系统 SHALL 将 userId、username 和 userDetailDto 写入请求上下文

### Requirement: Authorization errors use unified CustomError model
Authorization failures SHALL be represented by centralized errors that inherit from `CustomError` and preserve HTTP status.

#### Scenario: User lacks admin access
- **WHEN** an admin route rejects a user due to missing admin permission
- **THEN** the backend SHALL throw a centralized forbidden authorization error
- **AND** Hono and tRPC SHALL expose the same business error semantics

#### Scenario: Internal client secret is invalid
- **WHEN** an internal route rejects a missing or invalid client secret
- **THEN** the backend SHALL throw a centralized unauthorized authorization error

## Open Questions
- 角色权限绑定能力是否外部维护需要确认；当前角色管理不提供权限绑定管理。
- `getPrivilegesByRoleIds` 没有按 privilege status 或 isDelete 过滤；是否会返回已停用或软删除权限需要人工确认。
- `getRolesByEmploymentId` 对岗位和任职直接角色没有检查 employment.isDelete；调用方通常传入已查询到的未软删除 employment，但边界仍需确认。
- 管理端 tier 只校验是否拥有 admin role，不做每个 operation 的细粒度 privilege 判断；这是否符合当前目标态需要单独确认。

## Evidence Review
- 角色和权限通过显式关联表建模: 证据 `packages/db/src/schema/core/role-privileges.ts`, `packages/db/src/schema/core/role-assignments.ts`, `roles.ts`, `privileges.ts`。状态: 有 schema 证据。
- 查询雇佣角色: 证据 `apps/api/src/services/role/role.repository.ts`, `apps/admin-api/src/services/role/role.repository.ts`, `packages/db/src/schema/core/organization-closures.ts`。状态: 有代码证据，角色来源已统一到 `role_assignment`。
- 查询角色权限: 证据 `apps/api/src/services/privilege/privilege.repository.ts`, `apps/admin-api/src/services/privilege/privilege.repository.ts`。状态: 有代码证据；权限状态过滤需确认。
- 用户详情聚合角色权限: 证据 `apps/api/src/services/user/user.service.ts`, `apps/admin-api/src/services/user/user.service.ts`, `packages/domain/src/user/schema.ts`。状态: 有代码证据。
- 用户搜索按角色过滤: 证据 `packages/user-profile-read-model/src/user-profile.repository.ts`, `packages/user-profile-read-model/src/user-profile-build.repository.ts`, `apps/api/src/services/user/user.schema.ts`。状态: 有代码证据。
- 管理端 tier 需要 admin client 和 admin role: 证据 `apps/admin-api/src/routes/admin/_middleware.ts`, `apps/admin-api/src/routes/trpc/_middleware.ts`, `packages/api-core/src/middlewares/auth.ts`, `apps/admin-api/src/env.ts`。状态: 有代码证据；细粒度权限不是当前实现。
