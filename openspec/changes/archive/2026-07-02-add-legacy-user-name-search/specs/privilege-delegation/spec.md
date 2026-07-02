## MODIFIED Requirements

### Requirement: 用户搜索可附带权限委托
系统 SHALL 支持内部用户搜索同时返回与查询用户相关的权限委托。

#### Scenario: 搜索用户及委托
- **WHEN** `/internal/users/search-with-delegation` 请求包含且仅包含一个 ancestorOrgCode 和 privilegeCode
- **THEN** 系统 SHALL 使用 profile 搜索匹配用户
- **AND** 请求中的 legacy `names` 姓名列表 SHALL 作为 profile 用户搜索过滤条件生效
- **AND** 系统 SHALL 查询这些用户作为 delegator、组织范围包含该 ancestorOrgCode、包含该 privilegeCode、当前时间有效且 status 为 Enable 的 live 委托
- **AND** 响应 SHALL 返回 users 和 delegations
- **AND** users SHALL NOT 暴露 profile version、rebuiltAt 或 dirty 状态

#### Scenario: ancestorOrgCodes 数量不支持
- **WHEN** `/internal/users/search-with-delegation` 请求的 ancestorOrgCodes 数量不是 1
- **THEN** 系统 SHALL 拒绝请求并报告该接口 ancestorOrgCodes 元素数量只支持为 1
