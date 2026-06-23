## MODIFIED Requirements

### Requirement: Global session 使用统一 envelope
系统 SHALL 使用 Session Kernel PrincipalSession 作为 IAM 浏览器登录态权威来源，并 SHALL 由 OIDC provider 通过 Kernel resolver 解析、校验和续期该登录态。

#### Scenario: 创建新全局会话
- **WHEN** 用户成功完成密码、手机验证码或受支持的第三方认证
- **THEN** API SHALL 通过 Session Kernel 创建 PrincipalSession
- **AND** PrincipalSession SHALL 保存原始 `authTime`、`amr`、最小 PrincipalSnapshot、idle `expiresAt` 和 `absoluteExpiresAt`
- **AND** PrincipalSession SHALL NOT 保存完整 `UserDetailDto`、OIDC claims snapshot 或 `oidcSubject`

#### Scenario: 滑动续期
- **WHEN** OIDC authorize 成功使用有效 PrincipalSession
- **THEN** provider SHALL 通过 Session Kernel 按前台交互规则刷新 PrincipalSession idle TTL
- **AND** SHALL NOT 修改 `authTime`
- **AND** SHALL 仅延长 renewal policy 允许随 PrincipalSession 续期的 binding 或 credential

#### Scenario: 后台协议请求
- **WHEN** 请求为 Discovery、JWKS、Token 或 UserInfo
- **THEN** 系统 SHALL NOT 因该请求刷新浏览器 PrincipalSession TTL

#### Scenario: 读取旧格式 session
- **WHEN** Redis 中存在旧 `global_session:*` 或不符合 Session Kernel schema 的会话对象
- **THEN** provider SHALL 将其视为无效并要求重新登录
- **AND** 发布流程 SHALL 在上线前清理全部旧 global/local session 和旧 OIDC token index

### Requirement: Authorize 使用现有登录与一次性 return handle
系统 SHALL 以 Session Kernel PrincipalSession 判断登录，并使用 Kernel ProtocolArtifact 形式的一次性 opaque return handle 在 SSO portal 与 provider interaction 之间桥接。

#### Scenario: 已登录 authorize
- **WHEN** authorize 请求合法且浏览器包含有效 PrincipalSession
- **THEN** provider SHALL 使用 PrincipalSession 的 `subjectId`、`authTime` 和 `amr` 完成登录 prompt 判断
- **AND** provider SHALL 通过 OIDC account repository 将 Kernel subject 映射为 OIDC `sub`
- **AND** SHALL NOT 要求用户再次提交密码，除非 prompt、max_age 或 freshness requirement 要求重认证

#### Scenario: 已登录用户不可用
- **WHEN** PrincipalSession 对应用户已非 Enable 或已删除
- **THEN** provider SHALL 拒绝继续 authorize
- **AND** Kernel SHALL lazy revoke 该用户的所有 PrincipalSession 和 OIDC credential

#### Scenario: 未登录 authorize
- **WHEN** authorize 请求合法但没有有效 PrincipalSession
- **THEN** provider SHALL 保存必要 interaction 状态
- **AND** provider SHALL 通过 Session Kernel 创建 `protocol=oidc`、`artifactType=login_return_handle` 的一次性 ProtocolArtifact
- **AND** provider SHALL 将浏览器重定向到 SSO portal 并仅携带 opaque handle

#### Scenario: 恢复 interaction
- **WHEN** 登录成功后浏览器携带 handle 返回固定 provider resume endpoint
- **THEN** provider SHALL 通过 Session Kernel 原子消费 return handle artifact
- **AND** provider SHALL 校验 interaction、client、`oidcConfigVersion`、浏览器绑定和当前 PrincipalSession
- **AND** 校验成功后 SHALL 恢复原 authorize 请求

#### Scenario: Return handle 重放
- **WHEN** handle 已消费、已撤销、过期或绑定不匹配
- **THEN** provider SHALL 拒绝恢复 interaction
- **AND** 已消费 handle SHALL 命中 `reason=consumed` 的 artifact tombstone
- **AND** provider SHALL NOT 跳转到 client redirect URI

### Requirement: Authorization Code Flow 强制 state nonce 与 PKCE
系统 SHALL 仅支持 Authorization Code Flow，并对 public 和 confidential client 都强制 PKCE S256；合法 authorize 生成的 Authorization Code SHALL 登记为 Session Kernel ProtocolArtifact ref。

#### Scenario: 合法 authorize 请求
- **WHEN** 请求包含可用 client、精确匹配 redirect URI、`response_type=code`、合法 scopes、`state`、`nonce`、`code_challenge` 和 `code_challenge_method=S256`
- **THEN** provider SHALL 创建一次性 Authorization Code
- **AND** provider SHALL 为该 code 登记 `protocol=oidc`、`artifactType=authorization_code` 的 Kernel ProtocolArtifact ref
- **AND** artifact metadata SHALL 记录 clientCode、PrincipalSession、ClientBinding、redirect URI fingerprint、scopes、nonce 和 `oidcConfigVersion`
- **AND** provider SHALL 重定向到注册 redirect URI，并返回原始 `state`

#### Scenario: 缺少安全参数
- **WHEN** authorize 请求缺少 state、nonce、code challenge 或使用非 S256 method
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

### Requirement: Token endpoint 签发不透明 Access Token 与 RS256 ID Token
系统 SHALL 通过 POST token endpoint 原子兑换 Authorization Code，并 SHALL 将签发的不透明 Access Token 登记为 Session Kernel IssuedCredential。

#### Scenario: Public client 合法兑换
- **WHEN** public client 提交匹配 redirect URI、有效 code 和正确 PKCE verifier
- **THEN** provider SHALL 原子消费 code
- **AND** provider SHALL 原子消费对应 Kernel authorization code artifact 并写入 `reason=consumed` tombstone
- **AND** provider SHALL 为签发的 opaque access token 创建 `protocol=oidc`、`credentialType=access_token` 的 Kernel IssuedCredential
- **AND** provider SHALL 返回 Bearer opaque access token 和 RS256 ID Token

#### Scenario: Confidential client 合法兑换
- **WHEN** confidential client 同时提供有效 `client_secret_basic`、匹配 redirect URI、有效 code 和正确 PKCE verifier
- **THEN** provider SHALL 原子消费 code
- **AND** provider SHALL 原子消费对应 Kernel authorization code artifact
- **AND** provider SHALL 为签发的 opaque access token 创建 Kernel IssuedCredential
- **AND** provider SHALL 返回 Bearer opaque access token 和 RS256 ID Token

#### Scenario: Code 重放或版本变化
- **WHEN** code 已消费、已撤销、已过期或保存的 `oidcConfigVersion` 与当前版本不同
- **THEN** provider SHALL 拒绝兑换
- **AND** provider SHALL NOT 签发任何 token
- **AND** 已消费 code SHALL 命中 `reason=consumed` 的 artifact tombstone

#### Scenario: Token exchange 时用户不可用
- **WHEN** Authorization Code 对应用户已非 Enable 或已删除
- **THEN** provider SHALL 拒绝兑换
- **AND** provider SHALL NOT 签发 Access Token 或 ID Token
- **AND** Kernel SHALL lazy revoke 该用户相关 PrincipalSession 或 OIDC credential

#### Scenario: PKCE 或 client authentication 失败
- **WHEN** verifier 不匹配或 confidential client authentication 失败
- **THEN** provider SHALL 返回标准错误
- **AND** provider SHALL NOT 泄露 client 是否存在或 secret 是否错误
- **AND** provider SHALL NOT 消费 Kernel authorization code artifact

#### Scenario: Refresh token 请求
- **WHEN** client 请求 `refresh_token` grant 或 `offline_access`
- **THEN** provider SHALL 拒绝该请求
- **AND** provider SHALL NOT 发行 refresh token

#### Scenario: Token TTL 绑定 PrincipalSession
- **WHEN** provider 签发 access token 或 ID Token
- **THEN** 实际 TTL SHALL 取全局配置 TTL 与 PrincipalSession 剩余 TTL 的较小值
- **AND** OIDC access token credential renewal policy SHALL 为 `fixed_at_issue`

#### Scenario: Kernel credential 登记失败
- **WHEN** provider code 与 Kernel artifact 已成功消费，但 Access Token 对应 Kernel IssuedCredential 创建失败
- **THEN** provider SHALL fail closed
- **AND** provider SHALL NOT 向 client 返回可用 Access Token 或 ID Token
- **AND** provider SHALL best-effort 清理本次创建的 OIDC 私有 token payload

### Requirement: UserInfo 返回 scope 控制的 Redis 快照
系统 SHALL 使用 opaque Access Token 通过 Session Kernel credential lookup 校验运行时状态，并在通过后读取签发时保存的 OIDC 专用 UserInfo 快照。

#### Scenario: 合法 UserInfo 请求
- **WHEN** Bearer token 可通过 Session Kernel lookup 解析为 active `protocol=oidc`、`credentialType=access_token` 的 IssuedCredential
- **AND** credential、ClientBinding、PrincipalSession、user、client 和 `oidcConfigVersion` 均有效
- **THEN** UserInfo SHALL 返回 `sub`
- **AND** SHALL 按实际 scope 返回 profile、phone 和 `iam:authorization`

#### Scenario: 用户或 client 不可用
- **WHEN** 用户非 Enable、已删除，或 client 非 Enable、已删除、OIDC 已禁用
- **THEN** UserInfo SHALL 拒绝请求
- **AND** SHALL NOT 返回 Redis 中的旧快照
- **AND** Kernel SHALL 按校验失败类型 lazy revoke 对应 user sessions 或 client OIDC protocol objects

#### Scenario: PrincipalSession 已失效
- **WHEN** Access Token 关联的 PrincipalSession 不存在、已撤销或已过期
- **THEN** UserInfo SHALL 拒绝请求
- **AND** 系统 SHALL lazy revoke 或清理该 token

#### Scenario: Credential tombstone 命中
- **WHEN** UserInfo 请求携带的 Bearer token 命中 Kernel credential tombstone
- **THEN** provider SHALL 拒绝请求
- **AND** provider SHALL NOT 读取 OIDC UserInfo snapshot 或 provider token payload

#### Scenario: JSON 响应
- **WHEN** UserInfo 请求成功
- **THEN** 响应 SHALL 使用 `application/json`
- **AND** SHALL NOT 返回签名或加密 JWT UserInfo

### Requirement: Redis 支持版本校验和主动撤销
系统 SHALL 使用 Session Kernel credential index 维护 OIDC Access Token 的 user、client、PrincipalSession、binding 和 protocol 反向索引，并 SHALL 使用配置版本作为协议对象有效性的最终判断。

#### Scenario: 保存 Access Token
- **WHEN** provider 签发 Access Token
- **THEN** OIDC adapter SHALL 保存 OIDC 专用 UserInfo snapshot 和 provider token payload
- **AND** Session Kernel SHALL 保存 OIDC IssuedCredential，包含 user subject、clientCode、PrincipalSession、ClientBinding、scopes、authTime、`oidcConfigVersion` 引用和 lookup hash
- **AND** Session Kernel SHALL 将 credential 注册到 user、client、PrincipalSession、binding 和 protocol 索引

#### Scenario: 配置或 client 状态变化
- **WHEN** OIDC 配置、secret、启用状态、client 全局状态或 client maintenance 状态变化
- **THEN** 旧版本 code、return handle、binding 和 token SHALL 在下次使用时失败
- **AND** 系统 SHALL 通过 Session Kernel best-effort 主动撤销该 client 的 OIDC protocol 对象
- **AND** 撤销 SHALL 为相关 credential 和 artifact 写入 tombstone

#### Scenario: 用户状态变化
- **WHEN** 用户被禁用或删除
- **THEN** 系统 SHALL 通过 Session Kernel user index 撤销该用户的 PrincipalSession 和 OIDC Access Token
- **AND** OIDC adapter SHALL best-effort 清理 provider token payload

#### Scenario: Provider payload cleanup 失败
- **WHEN** Kernel 已为 OIDC credential、artifact 或 binding 写入 tombstone，但 OIDC 私有 payload cleanup 失败
- **THEN** 系统 SHALL 在 revoke summary 或 system log 中记录 cleanup failure
- **AND** 后续 resolve SHALL 因 tombstone 拒绝对应 external bearer

### Requirement: RP-Initiated Logout 执行全局单点退出
系统 SHALL 支持 `id_token_hint`、`post_logout_redirect_uri` 和可选 state，并 SHALL 通过 Session Kernel 清理当前浏览器 PrincipalSession。

#### Scenario: 带合法 hint 和回跳 URI退出
- **WHEN** end session 请求包含可识别 client 的有效 `id_token_hint`
- **AND** `post_logout_redirect_uri` 精确匹配该 client 注册值
- **THEN** provider SHALL 通过 Session Kernel 撤销当前浏览器 PrincipalSession
- **AND** Kernel SHALL 清理该 PrincipalSession 下 custom SSO local session credential、OIDC binding 和 OIDC Access Token credential
- **AND** provider SHALL 跳转到该 URI，并原样返回可选 state

#### Scenario: 无 hint 退出
- **WHEN** 请求没有 `id_token_hint` 但当前 PrincipalSession 可用
- **THEN** provider SHALL 通过 Session Kernel 执行当前 PrincipalSession 退出
- **AND** provider SHALL 进入默认安全页面
- **AND** provider SHALL NOT 跳转到 client URI

#### Scenario: 回跳 URI 不匹配
- **WHEN** `post_logout_redirect_uri` 未注册或 client 未配置任何 post logout URI
- **THEN** provider SHALL 拒绝该跳转
- **AND** provider SHALL NOT 导航到任意外部 URI

#### Scenario: Cleanup failure 不阻断退出
- **WHEN** RP-Initiated Logout 的 Kernel revoke summary 包含 OIDC 或 custom SSO cleanup failure
- **THEN** provider SHALL 保留已写 tombstone
- **AND** provider SHALL 记录 cleanup failure
- **AND** provider SHALL 按安全退出路径完成 cookie 清理或默认安全页面响应
