## MODIFIED Requirements

### Requirement: 用户搜索可附带权限委托
系统 SHALL 支持内部用户搜索同时返回与查询用户相关的权限委托。

#### Scenario: 搜索用户及委托
- **WHEN** `/internal/users/search-with-delegation` 请求包含且仅包含一个 ancestorOrgCode 和 privilegeCode
- **THEN** 系统 SHALL 使用 profile 搜索匹配用户
- **AND** 系统 SHALL 查询这些用户作为 delegator、组织范围包含该 ancestorOrgCode、包含该 privilegeCode、当前时间有效且 status 为 Enable 的 live 委托
- **AND** 响应 SHALL 返回 users 和 delegations
- **AND** users SHALL NOT 暴露 profile version、rebuiltAt 或 dirty 状态

#### Scenario: ancestorOrgCodes 数量不支持
- **WHEN** `/internal/users/search-with-delegation` 请求的 ancestorOrgCodes 数量不是 1
- **THEN** 系统 SHALL 拒绝请求并报告该接口 ancestorOrgCodes 元素数量只支持为 1

### Requirement: 用户搜索附带权限委托服务规则具备单元测试覆盖
系统 SHALL 为 public API 用户服务中的权限委托附带搜索规则提供 Bun 单元测试覆盖，且测试不得依赖真实数据库、Redis 或网络。

#### Scenario: 搜索用户附带委托拒绝不支持的组织祖先数量
- **WHEN** `searchUsersWithPrivilegeDelegation` 被调用且 `ancestorOrgCodes` 数量不是 1
- **THEN** 单元测试 SHALL 验证服务抛出“该接口ancestorOrgCodes元素数量只支持为1”
- **AND** 单元测试 SHALL 验证 `ancestorOrgCodes` 为空时抛出同样错误

#### Scenario: 搜索用户附带委托查询用户和委托
- **WHEN** `searchUsersWithPrivilegeDelegation` 被调用且 `ancestorOrgCodes` 包含且仅包含一个组织编码
- **THEN** 单元测试 SHALL 验证服务调用 profile 用户搜索
- **AND** 单元测试 SHALL 验证服务调用 `privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege(usernames, orgCode, privilegeCode)`
- **AND** 单元测试 SHALL 验证返回结构包含 `users` 和 `delegations`
- **AND** 单元测试 SHALL 验证用户 DTO 和权限委托 DTO 映射正确
