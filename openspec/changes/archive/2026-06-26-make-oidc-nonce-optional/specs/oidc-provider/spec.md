## RENAMED Requirements

- FROM: `### Requirement: Authorization Code Flow 强制 state nonce 与 PKCE`
- TO: `### Requirement: Authorization Code Flow 强制 state 与 PKCE，nonce 可选`

## MODIFIED Requirements

### Requirement: Authorization Code Flow 强制 state 与 PKCE，nonce 可选
系统 SHALL 仅支持 Authorization Code Flow，并对 public 和 confidential client 都强制 `state` 与 PKCE S256；`nonce` SHALL 为可选参数。合法 authorize 生成的 Authorization Code SHALL 登记为 Session Kernel ProtocolArtifact ref。

#### Scenario: 合法 authorize 请求包含 nonce
- **WHEN** 请求包含可用 client、精确匹配 redirect URI、`response_type=code`、合法 scopes、`state`、`nonce`、`code_challenge` 和 `code_challenge_method=S256`
- **THEN** provider SHALL 创建一次性 Authorization Code
- **AND** provider SHALL 为该 code 登记 `protocol=oidc`、`artifactType=authorization_code` 的 Kernel ProtocolArtifact ref
- **AND** artifact metadata SHALL 记录 clientCode、PrincipalSession、ClientBinding、redirect URI fingerprint、scopes、nonce 和 `oidcConfigVersion`
- **AND** provider SHALL 重定向到注册 redirect URI，并返回原始 `state`

#### Scenario: 合法 authorize 请求省略 nonce
- **WHEN** 请求包含可用 client、精确匹配 redirect URI、`response_type=code`、合法 scopes、`state`、`code_challenge` 和 `code_challenge_method=S256`
- **AND** 请求未包含 `nonce`
- **THEN** provider SHALL 创建一次性 Authorization Code
- **AND** provider SHALL 为该 code 登记 `protocol=oidc`、`artifactType=authorization_code` 的 Kernel ProtocolArtifact ref
- **AND** artifact metadata SHALL 记录 clientCode、PrincipalSession、ClientBinding、redirect URI fingerprint、scopes 和 `oidcConfigVersion`
- **AND** artifact metadata SHALL NOT require or synthesize nonce
- **AND** provider SHALL 重定向到注册 redirect URI，并返回原始 `state`

#### Scenario: 缺少安全参数
- **WHEN** authorize 请求缺少 state、code challenge 或使用非 S256 method
- **THEN** provider SHALL 拒绝请求
- **AND** SHALL NOT 签发 Authorization Code
- **AND** SHALL NOT 创建 Kernel authorization code artifact

#### Scenario: 请求未允许 scope
- **WHEN** requested scopes 不是 client allowedScopes 的子集或不包含 `openid`
- **THEN** provider SHALL 返回标准 scope 错误
- **AND** SHALL NOT 创建 Kernel authorization code artifact

#### Scenario: Prompt none 已登录
- **WHEN** 请求使用 `prompt=none` 且存在满足要求的 PrincipalSession
- **THEN** provider SHALL 无交互完成 authorize

#### Scenario: Prompt none 需要登录
- **WHEN** 请求使用 `prompt=none` 但缺少有效 PrincipalSession，或 max_age 要求重认证
- **THEN** provider SHALL 返回 `login_required`
- **AND** SHALL NOT 跳转登录页

#### Scenario: Prompt login
- **WHEN** 请求使用 `prompt=login`
- **THEN** provider SHALL 强制通过现有 SSO 登录页重新认证

#### Scenario: Max age 超限
- **WHEN** 当前时间减去 PrincipalSession `authTime` 大于请求 `max_age`
- **THEN** provider SHALL 要求重新认证
- **AND** `max_age=0` SHALL 始终要求重新认证

### Requirement: ID Token 使用稳定 public subject
系统 SHALL 使用 `user.oidcSubject` 作为单 issuer 下稳定、随机、不透明的 public `sub`。

#### Scenario: 签发包含 nonce 的 ID Token
- **WHEN** token exchange 成功
- **AND** 原始 authorize 请求包含 `nonce`
- **THEN** ID Token SHALL 包含 `iss`、`sub`、`aud`、`exp`、`iat`、`auth_time` 和原始 `nonce`
- **AND** `sub` SHALL 等于用户不可变 `oidcSubject`
- **AND** SHALL NOT 使用 user id、username、手机号或员工号作为 `sub`

#### Scenario: 签发不含 nonce 的 ID Token
- **WHEN** token exchange 成功
- **AND** 原始 authorize 请求未包含 `nonce`
- **THEN** ID Token SHALL 包含 `iss`、`sub`、`aud`、`exp`、`iat` 和 `auth_time`
- **AND** ID Token SHALL NOT 包含 `nonce`
- **AND** `sub` SHALL 等于用户不可变 `oidcSubject`
- **AND** SHALL NOT 使用 user id、username、手机号或员工号作为 `sub`

#### Scenario: Profile 和 phone claims
- **WHEN** 实际 scope 包含 `profile`
- **THEN** claims MAY 包含 `name` 和 `preferred_username`
- **AND** `preferred_username` SHALL 映射现有 username但不得被定义为稳定主键
- **WHEN** 实际 scope 包含 `phone`
- **THEN** claims MAY 包含 `phone_number`

#### Scenario: Authorization claim
- **WHEN** 实际 scope 包含 `iam:authorization`
- **THEN** provider SHALL NOT 将任职、角色或权限写入 ID Token
