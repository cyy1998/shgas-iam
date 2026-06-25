## ADDED Requirements

### Requirement: API 旧 Redis SessionService 不得作为运行时会话路径
系统 SHALL 只通过 Session Kernel adapter 创建、解析、授权和撤销 IAM 浏览器会话与 custom SSO local session，并 SHALL 不再通过 API 旧 `SessionService` 或 legacy Redis authority key helper 管理运行时会话。

#### Scenario: API 服务组合不暴露旧 SessionService
- **WHEN** `apps/api` composition 创建服务集合
- **THEN** 服务集合 SHALL NOT 创建或返回旧 `SessionService`
- **AND** auth、SSO、public authentication 和 gateway authz 路径 SHALL 依赖 Session Kernel-backed `customSsoSession` 或等价端口

#### Scenario: custom SSO 主路径不写旧 authority key
- **WHEN** 用户完成登录、`/sso/authorize`、`/sso/callback`、`/sso/token`、`/auth/authz` 或 `/sso/logout`
- **THEN** 系统 SHALL NOT 调用 `createGlobalSession`、`writeLocalSession`、`readGlobalSession`、`readValidatedLocalSessionUser` 或等价 legacy helper 作为会话权威操作
- **AND** 系统 SHALL NOT 创建新的 `global_session:*`、`local_*_session:*`、`local_session_reverse:*` 或 `local_session_set:*` authority key

### Requirement: Admin API 不得回退旧 Redis session
Admin API SHALL 使用 Session Kernel PrincipalSession 作为唯一登录态来源，并 SHALL 在缺失或无法解析 PrincipalSession 时 fail closed。

#### Scenario: Admin 请求缺少 Kernel PrincipalSession token
- **WHEN** `/admin` 或 `/rpc` 请求携带允许的 `Client` header 但没有 `global_session` cookie 或 `Authorization` token
- **THEN** admin authentication SHALL 返回未登录错误
- **AND** admin authentication SHALL NOT 尝试读取 legacy `global_session:*` Redis envelope

#### Scenario: Admin 请求携带无效 Kernel token
- **WHEN** `/admin` 或 `/rpc` 请求携带的 `global_session` cookie 或 `Authorization` token 不能解析为 active Session Kernel PrincipalSession
- **THEN** admin authentication SHALL 清理 `global_session` 和 `orcas_sso_sessionid` cookie
- **AND** admin authentication SHALL 返回未登录错误
- **AND** admin authentication SHALL NOT 回退到 legacy `createAdminAuthenticationHandler`

#### Scenario: Admin 用户与 PrincipalSession 不一致
- **WHEN** Kernel PrincipalSession 可解析，但实时用户不存在、已禁用、用户 ID 不匹配或缺少管理员角色
- **THEN** admin authentication SHALL 拒绝请求
- **AND** 对未登录类失败 SHALL 清理浏览器主会话 cookie
