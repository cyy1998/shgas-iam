## MODIFIED Requirements

### Requirement: 管理端 tier 需要 admin client 和 admin role
系统 SHALL 在 admin 和 rpc tier 中校验请求来源 client 以及当前用户 admin role。

#### Scenario: Client 不在管理端允许列表
- **WHEN** admin 或 rpc 请求缺少 Client header，或 Client 不在 `IAM_ADMIN_API_ADMIN_CLIENT_CODES` runtime config 派生的允许列表中
- **THEN** 系统 SHALL 拒绝请求并报告无管理端访问权限

#### Scenario: 用户没有管理端角色
- **WHEN** admin 或 rpc 请求的 session 用户 roles 不包含 `IAM_ADMIN_API_ADMIN_ROLE_CODES` runtime config 派生列表中的任一 role
- **THEN** 系统 SHALL 拒绝请求并报告无管理端访问权限

#### Scenario: 管理端鉴权通过
- **WHEN** 请求 Client 在允许列表中，且 session 用户拥有任一 admin role
- **THEN** 系统 SHALL 将 userId、username 和 userDetailDto 写入请求上下文
