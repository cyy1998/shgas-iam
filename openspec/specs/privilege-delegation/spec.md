# privilege-delegation Specification

## Purpose
描述当前内部 API 的权限委托能力，包括委托查询、创建、更新、委托权限明细、组织范围匹配和有效期冲突检测。该 baseline 记录现状，不新增审批、撤销或通知流程。

## Requirements
### Requirement: 内部 API 暴露权限委托操作
系统 SHALL 通过 internal delegation API 暴露权限委托搜索、更新和创建操作。

#### Scenario: 搜索委托
- **WHEN** 调用 `/internal/delegations/search` 并提交查询条件
- **THEN** 系统 SHALL 校验输入并返回权限委托详情列表

#### Scenario: 更新委托
- **WHEN** 调用 `/internal/delegations/:id` 并提交可更新字段
- **THEN** 系统 SHALL 校验委托 id 和请求体，并更新该委托

#### Scenario: 创建委托
- **WHEN** 调用 `/internal/delegations/` 并提交委托创建请求
- **THEN** 系统 SHALL 校验输入并创建权限委托及其权限明细

### Requirement: 查询权限委托
系统 SHALL 按授权人、受托人、组织范围、权限和有效时间查询未软删除委托。

#### Scenario: 按用户查询委托
- **WHEN** 查询条件包含 delegatorUsernames 或 delegateeUsernames
- **THEN** 系统 SHALL 通过用户表匹配 delegatorUserId 或 delegateeUserId

#### Scenario: 按组织范围查询委托
- **WHEN** 查询条件包含 orgCodes
- **THEN** 系统 SHALL 使用 organization_closure 判断委托 organizationScope 是否包含这些组织

#### Scenario: 按权限查询委托
- **WHEN** 查询条件包含 privCodes
- **THEN** 系统 SHALL 查询 delegation_detail 关联 privilegeCode 的委托

#### Scenario: 按有效时间查询委托
- **WHEN** 查询条件包含 validTime
- **THEN** 系统 SHALL 只返回 startTime 小于等于 validTime 且 endTime 大于等于 validTime 的委托

### Requirement: 创建权限委托
系统 SHALL 在事务内校验授权人、受托人、组织、权限和冲突后创建 Enable 委托。

#### Scenario: 引用对象不存在
- **WHEN** 创建请求引用的 delegatorUsername、delegateeUsername、orgCode 或 privilegeCodes 无法匹配 active 数据
- **THEN** 系统 SHALL 拒绝创建并报告对应对象不存在

#### Scenario: 授权权限有时间冲突
- **WHEN** 同一授权人已有未软删除且非 Disable 的委托在时间区间上与新请求重叠，并且涉及相同 privilege
- **THEN** 系统 SHALL 拒绝创建并报告已被授权的权限编码

#### Scenario: 创建委托成功
- **WHEN** 创建请求通过校验且没有冲突
- **THEN** 系统 SHALL 插入 status 为 Enable 的 privilege_delegation 记录
- **AND** 系统 SHALL 为每个 privilegeId 插入 delegation_detail 记录
- **AND** 响应 SHALL 返回委托详情 DTO

### Requirement: 更新权限委托
系统 SHALL 禁止修改已结束委托，并允许更新未结束委托的时间、状态和描述。

#### Scenario: 委托不存在
- **WHEN** 更新请求的 id 无法匹配 privilege_delegation 记录
- **THEN** 系统 SHALL 拒绝请求并报告委托记录不存在

#### Scenario: 委托已结束
- **WHEN** 更新请求的委托 status 为 `PrivilegeDelegationStatus.Disable`
- **THEN** 系统 SHALL 拒绝修改并报告该委托已结束

#### Scenario: 更新委托字段
- **WHEN** 更新请求的委托存在且未结束
- **THEN** 系统 SHALL 更新请求包含的 startTime、endTime、status 或 description 字段
- **AND** 响应 SHALL 返回 true

### Requirement: 委托详情 DTO 包含用户组织权限摘要
系统 SHALL 在返回委托详情时附带授权人、受托人、组织范围和权限列表。

#### Scenario: 构建委托详情
- **WHEN** 系统返回委托详情
- **THEN** 响应 SHALL 包含 delegatorUsername、delegatorName、delegateeUsername、delegateeName
- **AND** 响应 SHALL 包含 delegatorUser、delegateeUser、organizationScope 和 privileges

### Requirement: 用户搜索可附带权限委托
系统 SHALL 支持内部用户搜索同时返回与查询用户相关的权限委托。

#### Scenario: 搜索用户及委托
- **WHEN** `/internal/users/search-with-delegation` 请求包含且仅包含一个 ancestorOrgCode 和 privilegeCode
- **THEN** 系统 SHALL 查询匹配用户
- **AND** 系统 SHALL 查询这些用户作为 delegator、组织范围包含该 ancestorOrgCode、包含该 privilegeCode、当前时间有效且 status 为 Enable 的委托
- **AND** 响应 SHALL 返回 users 和 delegations

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
- **THEN** 单元测试 SHALL 验证服务调用 `userRepository.searchUsers(query)`
- **AND** 单元测试 SHALL 验证服务调用 `privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege(usernames, orgCode, privilegeCode)`
- **AND** 单元测试 SHALL 验证返回结构包含 `users` 和 `delegations`
- **AND** 单元测试 SHALL 验证用户 DTO 和权限委托 DTO 映射正确

## Open Questions
- 创建委托时使用 `getUserByUsername`、`getOrganizationByCode` 和 `searchPrivileges`；其中 privilege 查询没有显式过滤 status/isDelete，权限有效性语义需要确认。
- 更新委托不会重新检查时间冲突；是否允许后续更新造成重叠需要人工确认。
- 查询委托未按 status 过滤，除非 validTime 等条件间接限制；是否应默认隐藏 Disable 委托需确认。
- 创建委托 schema 允许 privilegeIds 可选但 service 会用 privilegeCodes 查出的 privileges 覆盖；外部传入 privilegeIds 的语义未明确。

## Evidence Review
- 内部 API 暴露权限委托操作: 证据 `apps/api/src/routes/internal/delegation/delegation.routes.ts`, `delegation.handlers.ts`, `delegation.index.ts`。状态: 有代码证据。
- 查询权限委托: 证据 `apps/api/src/services/privilege/privilegeDelegation.service.ts`, `privilegeDelegation.repository.ts`, `privilegeDelegation.schema.ts`。状态: 有代码证据。
- 创建权限委托: 证据 `apps/api/src/services/privilege/privilegeDelegation.service.ts`, `privilegeDelegation.repository.ts`, `packages/db/src/schema/core/privilege-delegations.ts`, `delegation-details.ts`。状态: 有代码证据；权限状态过滤与更新时间冲突需确认。
- 更新权限委托: 证据 `apps/api/src/services/privilege/privilegeDelegation.service.ts`, `privilegeDelegation.repository.ts`, `packages/contracts/src/enums/privilegeDelegation.status.ts`。状态: 有代码证据。
- 委托详情 DTO 包含用户组织权限摘要: 证据 `apps/api/src/services/privilege/privilegeDelegation.schema.ts`。状态: 有代码证据。
- 用户搜索可附带权限委托: 证据 `apps/api/src/routes/internal/user/user.routes.ts`, `user.handlers.ts`, `apps/api/src/services/user/user.service.ts`, `apps/api/src/services/privilege/privilegeDelegation.repository.ts`。状态: 有代码证据。
