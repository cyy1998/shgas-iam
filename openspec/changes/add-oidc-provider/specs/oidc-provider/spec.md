## ADDED Requirements

### Requirement: OIDC Provider Metadata 与 JWKS
系统 SHALL 发布标准 OIDC Discovery metadata 和 JWKS，使 OIDC client 可以发现 issuer、端点、支持的 flow、scope、认证方式和签名公钥。

#### Scenario: 查询 Discovery metadata
- **WHEN** OIDC client 请求 `GET /.well-known/openid-configuration` 或 provider 配置的等价 well-known endpoint
- **THEN** 响应 SHALL 包含 `issuer`、`authorization_endpoint`、`token_endpoint`、`userinfo_endpoint`、`jwks_uri`、`response_types_supported`、`grant_types_supported`、`scopes_supported`、`subject_types_supported`、`id_token_signing_alg_values_supported` 和 `code_challenge_methods_supported`
- **AND** `issuer` SHALL 与 ID Token 中的 `iss` 完全一致

#### Scenario: 查询 JWKS
- **WHEN** OIDC client 请求 `jwks_uri`
- **THEN** 响应 SHALL 返回当前有效 signing public key
- **AND** 响应 MAY 返回尚未过期 token 仍需要的上一代 signing public key
- **AND** 响应 SHALL NOT 包含任何 private key material

### Requirement: OIDC 授权端点支持 Authorization Code Flow
系统 SHALL 通过 OIDC authorization endpoint 支持 `response_type=code` 的 Authorization Code Flow，并在未登录时复用现有 SSO portal 登录。

#### Scenario: 已登录用户发起合法 authorize 请求
- **WHEN** 浏览器请求 authorization endpoint，携带已注册 OIDC client、精确匹配的 `redirect_uri`、`response_type=code`、包含 `openid` 的 scope、`state` 和满足 client 策略的 PKCE 参数
- **AND** 请求包含有效 `global_session`
- **THEN** provider SHALL 创建一次性 authorization code
- **AND** provider SHALL 重定向到 `redirect_uri`
- **AND** 重定向 URL SHALL 携带 `code` 和原始 `state`

#### Scenario: 未登录用户发起 authorize 请求
- **WHEN** 浏览器请求 authorization endpoint 且没有有效 `global_session`
- **THEN** provider SHALL 保存原始 OIDC authorize 上下文
- **AND** provider SHALL 重定向到现有 SSO portal 登录页
- **AND** 登录页回跳目标 SHALL 受 provider 生成的短期 return nonce、签名 token 或 allowed origin 校验保护

#### Scenario: redirect_uri 不精确匹配
- **WHEN** authorize 请求的 `redirect_uri` 与 OIDC client 注册的任一 redirect URI 不完全相同
- **THEN** provider SHALL 拒绝授权请求
- **AND** provider SHALL NOT 签发 authorization code

#### Scenario: public client 缺少 PKCE
- **WHEN** public OIDC client 发起 authorize 请求但缺少 `code_challenge` 或 `code_challenge_method=S256`
- **THEN** provider SHALL 拒绝授权请求
- **AND** provider SHALL NOT 签发 authorization code

#### Scenario: unsupported response type
- **WHEN** authorize 请求使用 `token`、`id_token` 或未启用的 response type
- **THEN** provider SHALL 拒绝授权请求
- **AND** provider SHALL NOT 使用 implicit flow 返回 token

### Requirement: OIDC Token Endpoint 签发标准 token response
系统 SHALL 通过 token endpoint 使用 POST 请求兑换 authorization code，并返回标准 OAuth/OIDC token response。

#### Scenario: 合法 authorization code 兑换
- **WHEN** OIDC client 使用 `POST /token` 提交 `grant_type=authorization_code`、authorization code、匹配的 `redirect_uri` 和有效 client authentication 或 PKCE verifier
- **THEN** provider SHALL 原子消费 authorization code
- **AND** provider SHALL 返回 `token_type=Bearer`、`expires_in`、`access_token` 和 `id_token`
- **AND** provider SHALL NOT 在 URL query 中接收或返回 `client_secret`、`access_token` 或 `id_token`

#### Scenario: authorization code 重复兑换
- **WHEN** 同一个 authorization code 已被成功兑换
- **THEN** 后续 token 请求 SHALL 被拒绝
- **AND** provider SHALL NOT 签发新的 `access_token` 或 `id_token`

#### Scenario: PKCE verifier 不匹配
- **WHEN** token 请求提交的 `code_verifier` 与 authorize 阶段的 `code_challenge` 不匹配
- **THEN** provider SHALL 拒绝 token 请求
- **AND** provider SHALL NOT 签发 token

#### Scenario: confidential client 认证失败
- **WHEN** confidential OIDC client 调用 token endpoint 但 client authentication 缺失、格式错误或 secret 校验失败
- **THEN** provider SHALL 拒绝 token 请求
- **AND** provider SHALL NOT 签发 token

### Requirement: ID Token 使用稳定不透明 subject 和受控 claims
系统 SHALL 签发符合 OIDC Core 的 ID Token，并使用 OIDC 专用稳定不透明 subject 表示 IAM 用户。

#### Scenario: ID Token 基础 claims
- **WHEN** provider 成功签发 ID Token
- **THEN** ID Token SHALL 包含 `iss`、`sub`、`aud`、`exp`、`iat` 和 `auth_time`
- **AND** `sub` SHALL 是 OIDC 专用稳定不透明标识
- **AND** `sub` SHALL NOT 直接使用数据库用户 ID、username、手机号或员工号

#### Scenario: authorize 请求包含 nonce
- **WHEN** 原始 authorize 请求包含 `nonce`
- **THEN** provider 签发的 ID Token SHALL 包含相同 `nonce`

#### Scenario: scope 控制 claims
- **WHEN** OIDC client 请求 `profile` 或 `phone` scope 且该 client 被允许使用对应 scope
- **THEN** ID Token 或 UserInfo SHALL 仅返回对应 scope 允许的 claims
- **AND** 未授权 scope 对应的 claims SHALL NOT 返回

### Requirement: UserInfo Endpoint 返回当前用户信息
系统 SHALL 通过 UserInfo endpoint 根据 Bearer access token 返回当前用户的标准 OIDC claims。

#### Scenario: 合法 access token 查询 UserInfo
- **WHEN** client 使用未过期且包含 `openid` scope 的 Bearer access token 请求 UserInfo endpoint
- **THEN** provider SHALL 返回 `sub`
- **AND** provider SHALL 按 access token 的 scope 和 client claim policy 返回允许的 `profile` 或 `phone` claims

#### Scenario: access token 无效或过期
- **WHEN** UserInfo 请求缺少 Bearer access token，或 token 无效、过期、已撤销
- **THEN** provider SHALL 拒绝请求
- **AND** provider SHALL NOT 返回用户 claims

#### Scenario: 用户已不可用
- **WHEN** access token 对应的 IAM 用户已被删除、禁用或无法解析
- **THEN** provider SHALL 拒绝 UserInfo 请求
- **AND** provider SHALL NOT 返回陈旧用户快照

### Requirement: OIDC End Session 清理全局会话
系统 SHALL 提供 OIDC end session endpoint，并保持与现有 IAM 全局会话清理语义一致。

#### Scenario: 合法退出请求
- **WHEN** 浏览器请求 end session endpoint，且能够通过 `id_token_hint` 或当前 `global_session` 解析有效用户会话
- **THEN** provider SHALL 清理对应 `global_session`
- **AND** provider SHALL 清理该全局会话下仍有效的 custom SSO local sessions

#### Scenario: post_logout_redirect_uri 精确匹配
- **WHEN** 退出请求携带 `post_logout_redirect_uri`
- **THEN** provider SHALL 要求该 URI 与 OIDC client 注册的任一 post logout redirect URI 完全相同
- **AND** 匹配成功后 provider SHALL 在退出完成后重定向到该 URI

#### Scenario: post_logout_redirect_uri 不匹配
- **WHEN** 退出请求携带未注册的 `post_logout_redirect_uri`
- **THEN** provider SHALL 拒绝该回跳或重定向到默认安全页面
- **AND** provider SHALL NOT 跳转到未注册 URI

### Requirement: OIDC 与既有 custom SSO 隔离
系统 SHALL 将 OIDC 协议端点与既有 `/sso` custom SSO 端点隔离，避免新协议行为改变旧业务系统接入语义。

#### Scenario: 既有 custom SSO 授权保持兼容
- **WHEN** 业务系统继续调用 `/sso/authorize`、`/sso/callback`、`/sso/token` 或 `/sso/logout`
- **THEN** 系统 SHALL 保持现有 custom SSO 响应结构和局部会话行为
- **AND** OIDC token response、JWKS、UserInfo 和 OIDC client 配置 SHALL NOT 影响该流程
