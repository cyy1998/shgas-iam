## ADDED Requirements

### Requirement: 用户搜索附带权限委托服务规则具备单元测试覆盖
系统 SHALL 为 public API 用户服务中的权限委托附带搜索规则提供 Bun 单元测试覆盖，且测试不得依赖真实数据库、Redis 或网络。

#### Scenario: 搜索用户附带委托拒绝不支持的组织祖先数量
- **WHEN** `searchUsersWithPrivilegeDelegation` 被调用且 `ancestorOrgCodes` 数量不是 1
- **THEN** 单元测试 SHALL 验证服务抛出“该接口ancestorOrgCodes元素数量只支持为1”
- **AND** 单元测试 SHALL 验证 `ancestorOrgCodes` 为空时抛出同样错误

#### Scenario: 搜索用户附带委托查询用户和委托
- **WHEN** `searchUsersWithPrivilegeDelegation` 被调用且 `ancestorOrgCodes` 包含且仅包含一个组织编码
- **THEN** 单元测试 SHALL 验证服务调用 `userRepository.searchUsers(query)`
- **AND** 单元测试 SHALL 验证服务调用 `privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege(usernames, orgCode, privilegeCode)`
- **AND** 单元测试 SHALL 验证返回结构包含 `users` 和 `delegations`
- **AND** 单元测试 SHALL 验证用户 DTO 和权限委托 DTO 映射正确
