## MODIFIED Requirements

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

### Requirement: 用户搜索按角色过滤
系统 SHALL 在用户目录查询中支持按 role code 过滤用户。

#### Scenario: 角色过滤用户
- **WHEN** 用户搜索请求包含 roleCodes
- **THEN** 系统 SHALL 匹配用户 active employment 上通过统一 `role_assignment` 的岗位、任职直接或组织来源获得的 active role
- **AND** 系统 SHALL 只返回启用且未软删除用户

#### Scenario: 组织角色按深度匹配
- **WHEN** 角色来自 organization role assignment 且匹配下级组织
- **THEN** 系统 SHALL 仅在 closure depth 大于 0 且 `role_assignment.includeDescendants` 为 true 时匹配后代组织
