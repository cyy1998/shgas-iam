# oidc-provider Specification

## Purpose
TBD - created by archiving change add-oidc-provider. Update Purpose after archive.
## Requirements
### Requirement: Provider 发布固定 issuer Metadata 与 RS256 JWKS
系统 SHALL 在同一 IAM origin 的 `/oidc` issuer 下发布标准 Discovery metadata 和 RS256 JWKS。

#### Scenario: 查询 Discovery metadata
- **WHEN** client 请求 OIDC well-known endpoint
- **THEN** 响应 SHALL 包含 issuer、authorization、token、userinfo、jwks 和 end session endpoint
- **AND** SHALL 声明仅支持 `code`、`authorization_code`、`public` subject、`RS256` 和 PKCE `S256`
- **AND** SHALL 声明 scopes `openid`、`profile`、`phone` 和 `iam:authorization`
- **AND** issuer SHALL 与 ID Token `iss` 完全一致

#### Scenario: 查询 JWKS
- **WHEN** client 请求 `jwks_uri`
- **THEN** 响应 SHALL 返回 current signing key 的 public JWK
- **AND** MAY 返回仍需验证未过期 ID Token 的 previous public JWK
- **AND** SHALL NOT 返回 private key material

#### Scenario: Signing key 配置非法
- **WHEN** current/previous JWK 缺少唯一 `kid`、不是可用 RS256 key 或包含冲突配置
- **THEN** provider SHALL 启动失败
- **AND** SHALL NOT 降级为临时或内存 signing key

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

### Requirement: 内部可信 client 自动批准授权
系统 SHALL 对管理员预配置的内部 client 自动批准合法 requested scopes，并 SHALL NOT 展示 consent 页面。

#### Scenario: Requested scopes 合法
- **WHEN** 用户已登录且 requested scopes 均在 allowedScopes 中
- **THEN** provider SHALL 自动完成 consent prompt
- **AND** SHALL NOT 保存长期用户 consent 记录

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

### Requirement: iam:authorization 返回任职和当前 client 授权
系统 SHALL 通过 `iam:authorization` claim 返回全部有效 employments，并将 roles/privileges 严格限制为当前 client。

#### Scenario: 返回全部有效任职
- **WHEN** Access Token 包含 `iam:authorization` scope
- **THEN** claim SHALL 返回用户全部有效 employments
- **AND** SHALL NOT 因某个 employment 没有当前 client role 而删除该 employment

#### Scenario: 按 client 过滤授权
- **WHEN** provider 构造某个 employment 的 roles
- **THEN** SHALL 只包含 `roles.clientId` 等于当前 client id 的有效角色
- **AND** privileges SHALL 只由这些角色派生
- **AND** 其他 client 的 roles/privileges SHALL NOT 返回

#### Scenario: 返回精简任职结构
- **WHEN** 返回 employment
- **THEN** SHALL 仅返回组织业务编码、名称、类型、根到叶组织路径、岗位编码和岗位名称
- **AND** SHALL NOT 返回数据库 ID、user 副本、状态、软删除或时间戳字段

#### Scenario: 返回聚合授权
- **WHEN** claim 包含多个 employments
- **THEN** 顶层 roles/privileges SHALL 由各 employment 中当前 client 授权去重聚合
- **AND** roles/privileges SHALL 按 code 字典序稳定排序
- **AND** employments SHALL 按 orderNum、orgCode、posCode 稳定排序

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

### Requirement: Provider 实施受控 CORS 和 token endpoint 限流
系统 SHALL 对不同 OIDC endpoint 使用最小 CORS 策略，并对 confidential client 认证失败实施双层限流。

#### Scenario: Discovery 和 JWKS CORS
- **WHEN** 浏览器跨域请求 Discovery 或 JWKS
- **THEN** provider MAY 允许公开读取

#### Scenario: UserInfo CORS
- **WHEN** 浏览器跨域请求 UserInfo
- **THEN** Origin SHALL 与 Bearer token 所属 client 某个 redirect URI 的 origin 完全一致
- **AND** SHALL NOT 返回通配 `Access-Control-Allow-Origin`

#### Scenario: Public client Token endpoint CORS
- **WHEN** public client 从浏览器跨域请求 token endpoint
- **AND** Origin 与该 client 某个 redirect URI 的 origin 完全一致
- **THEN** provider SHALL 允许该 Origin
- **AND** SHALL NOT 返回通配 `Access-Control-Allow-Origin`

#### Scenario: Confidential client Token endpoint CORS
- **WHEN** confidential client 从浏览器跨域请求 token endpoint
- **THEN** provider SHALL 拒绝 CORS

#### Scenario: Public client Origin 不匹配
- **WHEN** public client 的 Token 请求 Origin 未匹配任一注册 redirect URI origin
- **THEN** provider SHALL 拒绝 CORS

#### Scenario: Client authentication 重复失败
- **WHEN** 同一 `client_id + IP` 多次 confidential authentication 失败
- **THEN** provider SHALL 根据环境配置执行短期失败限流
- **AND** APISIX SHALL 同时实施基础 IP 限流

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

### Requirement: OIDC 与 custom SSO 保持隔离
系统 SHALL 保持标准 OIDC 与既有 `/sso` 协议端点、secret、redirect 和 runtime cache 语义隔离。

#### Scenario: 既有 custom SSO 使用
- **WHEN** 业务系统继续调用 `/sso/authorize`、`/sso/callback`、`/sso/token` 或 `/sso/logout`
- **THEN** 系统 SHALL 保持现有响应结构和 local session 行为
- **AND** SHALL NOT 使用 `oidcSecretHash`、`oidcConfig` 或 OIDC token response 替代旧行为

#### Scenario: Client DTO 和缓存隔离
- **WHEN** custom SSO 读取 client DTO 或 Redis cache
- **THEN** SHALL NOT 包含 `oidcSecretHash`
- **AND** OIDC provider SHALL 使用专用 runtime DTO 和 cache namespace

### Requirement: Provider 后端使用 app-local composition root
`apps/oidc-provider` SHALL 使用 app-local composition root 创建 provider runtime、Node HTTP server、workers 和 lifecycle resources，并 SHALL 保持 entrypoint thin。

#### Scenario: Entry delegates production wiring
- **WHEN** 维护者查看 `apps/oidc-provider/src/index.ts`
- **THEN** entrypoint SHALL parse env, create the OIDC provider composition, call `server.listen`, and bind shutdown signals
- **AND** entrypoint SHALL NOT directly construct repositories, services, stores, `oidc-provider` hooks, or Redis-backed workers

#### Scenario: Composition returns lifecycle resources
- **WHEN** composition creates production OIDC provider resources
- **THEN** it SHALL return the materialized HTTP server, provider runtime, workers or subscribers, and a shutdown function
- **AND** shutdown SHALL close the HTTP server, Redis resources, DB resources, and workers owned by the composition

### Requirement: Provider repositories are DbClient-bound and DB-only
OIDC provider repositories SHALL be created through factories that bind a `DbClient`; repository implementations SHALL access PostgreSQL only through the injected client.

#### Scenario: Repository factory binds DbClient
- **WHEN** composition creates OIDC account, authorization, or client repositories
- **THEN** it SHALL call `createXRepository(dbClient)` or an equivalent factory
- **AND** returned repository methods SHALL NOT require callers to pass `tx`

#### Scenario: Repository does not import DB singleton
- **WHEN** 维护者查看 `apps/oidc-provider/src/repositories`
- **THEN** repository implementations SHALL NOT value import the `@iam/db` singleton
- **AND** repository implementations MAY import DB schema, query helpers, DTO schemas, and `DbClient` types needed for queries

### Requirement: Provider runtime modules depend on consumer-owned Ports
OIDC provider protocol and business modules SHALL depend on consumer-owned Ports that describe the minimal behavior they consume.

#### Scenario: Claims service uses claims-owned ports
- **WHEN** claims service needs accounts, authorization claims, client runtime metadata, session validation, or token revocation
- **THEN** claims service SHALL define or import claims-owned Port shapes for those behaviors
- **AND** claims service SHALL NOT depend on concrete repository classes, Redis singleton, or production runtime modules

#### Scenario: Interaction handler uses interaction-owned ports
- **WHEN** interaction handling needs client runtime lookup, global session resolution, provider session binding, or return handle operations
- **THEN** interaction module SHALL depend on interaction-owned Port shapes
- **AND** tests SHALL be able to inject fakes without mocking app-local production modules

### Requirement: Redis protocol state uses semantic stores
OIDC provider business and protocol modules SHALL access Redis protocol state through semantic stores or Ports, except inside Redis-backed infrastructure implementations.

#### Scenario: Business module avoids concrete Redis
- **WHEN** claims, interaction, global session, client auth rate limiting, or provider middleware needs Redis-backed behavior
- **THEN** the module SHALL depend on semantic stores or Ports such as session store, provider session binding store, return handle store, token registry, token revocation port, client runtime cache, or client auth failure store
- **AND** the module SHALL NOT directly depend on concrete `ioredis.Redis`

#### Scenario: Redis adapter may use concrete Redis
- **WHEN** Redis-backed stores or `oidc-provider` Redis Adapter implementations persist protocol objects
- **THEN** those infrastructure modules MAY depend on concrete `ioredis.Redis`
- **AND** their collaborators such as client version lookup, provider session binding, and token registry SHALL be expressed as narrow Ports rather than concrete repository classes

### Requirement: Provider wiring centralizes oidc-provider extension points
OIDC provider SHALL centralize `oidc-provider` extension point wiring under provider wiring modules.

#### Scenario: Provider hooks are grouped
- **WHEN** production provider is created
- **THEN** composition SHALL call provider wiring modules for client authentication, redirect URI checks, protocol model payload extensions, Koa middleware, and provider event handlers
- **AND** HTTP server and business services SHALL NOT directly patch `oidc-provider` prototypes or protocol models

#### Scenario: Configuration remains dependency-driven
- **WHEN** provider configuration is created
- **THEN** configuration SHALL receive adapter, claims, signing keys, interaction policy, and minimal config slices as dependencies
- **AND** configuration SHALL NOT construct production repositories, Redis clients, loggers, or signing key loaders internally

### Requirement: Provider DI architecture is guarded by tests
`apps/oidc-provider` SHALL include architecture tests that enforce its DI boundaries.

#### Scenario: Forbidden singleton regression is detected
- **WHEN** protocol/business modules statically import DB singleton, app-local Redis singleton, app-local logger singleton, or concrete production repository/service modules
- **THEN** OIDC provider architecture tests SHALL fail
- **AND** failure output SHALL identify the offending file and import specifier

#### Scenario: Public protocol behavior remains unchanged
- **WHEN** DI migration completes
- **THEN** existing OIDC protocol behavior tests SHALL continue to cover Discovery, JWKS, authorize, token, UserInfo, CORS, logout, Redis adapter, interaction, claims, signing keys, and HTTP logging behavior
- **AND** migration SHALL NOT intentionally change public endpoint semantics

### Requirement: OIDC 发布回滚手册必须覆盖 Session Kernel runtime
系统 SHALL 更新 OIDC 发布与回滚手册，使其覆盖 Session Kernel namespace、HMAC lookup、旧 runtime key 清理和强制重新登录。

#### Scenario: 发布前提包含 Session Kernel 配置
- **WHEN** 维护者查看 OIDC 发布前提
- **THEN** 手册 SHALL 要求配置 `IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE`、principal TTL、tombstone TTL、tombstone grace、`IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_ID` 和 `IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_SECRET`
- **AND** 手册 SHALL 说明 previous HMAC key 只用于平滑 lookup rotation
- **AND** 生产环境 SHALL NOT 使用开发默认 HMAC secret

#### Scenario: 发布步骤包含旧 key cleanup
- **WHEN** 维护者按 OIDC 发布手册执行 Session Kernel 版本上线
- **THEN** 手册 SHALL 要求在维护窗口内停止 authorize、token、UserInfo、logout、login return handle 和 session refresh/renewal 流量
- **AND** 手册 SHALL 要求清理旧 `global_session:*`、custom SSO local session key 和旧 OIDC provider runtime/index key
- **AND** 手册 SHALL 要求清理完成后所有用户重新登录

#### Scenario: 回滚步骤包含新 key cleanup
- **WHEN** OIDC provider 需要回滚到不理解 Session Kernel 的旧版本
- **THEN** 手册 SHALL 要求先关闭 APISIX `/oidc` 路由或停止 OIDC 流量
- **AND** 手册 SHALL 要求清理 `sess:v2:` active/lookup/revoked/index key 和 OIDC adapter 私有 payload key
- **AND** 手册 SHALL 要求回滚后重新执行 custom SSO 与 OIDC smoke test

### Requirement: OIDC Session Kernel smoke 必须覆盖核心协议路径
系统 SHALL 在发布前验证 OIDC provider 通过 Session Kernel 完成登录判断、code 登记、token 签发、UserInfo 校验和 logout 撤销。

#### Scenario: authorize 和 token smoke 成功
- **WHEN** smoke test 使用合法 OIDC client 完成 Authorization Code Flow
- **THEN** provider SHALL 通过 Session Kernel PrincipalSession 判断登录
- **AND** provider SHALL 为 authorization code 登记 Kernel ProtocolArtifact ref
- **AND** token endpoint SHALL 消费 code 并为 opaque access token 登记 Kernel IssuedCredential

#### Scenario: UserInfo smoke 使用 Kernel credential 校验
- **WHEN** smoke test 使用 token endpoint 返回的 access token 调用 UserInfo
- **THEN** provider SHALL 先通过 Session Kernel credential lookup 校验 tombstone、credential、binding、PrincipalSession、user、client 和 config version
- **AND** UserInfo SHALL 只在校验通过后返回 scope 控制的 claims

#### Scenario: authorization code 重放 smoke 被拒绝
- **WHEN** smoke test 第二次提交已经成功兑换的 authorization code
- **THEN** token endpoint SHALL 拒绝请求
- **AND** 已消费 code SHALL 命中 `reason=consumed` 的 artifact tombstone
- **AND** provider SHALL NOT 签发新的 access token 或 ID Token

#### Scenario: RP-Initiated Logout smoke 撤销当前 PrincipalSession
- **WHEN** smoke test 调用 OIDC RP-Initiated Logout
- **THEN** provider SHALL 通过 Session Kernel 撤销当前浏览器 PrincipalSession
- **AND** 后续使用关联 access token 调用 UserInfo SHALL 被拒绝
- **AND** cleanup failure 如发生 SHALL 被记录但不得恢复已写 tombstone

### Requirement: OIDC runtime 不得接受旧 session envelope
系统 SHALL 在 Session Kernel 发布后拒绝旧 global session envelope 和旧 OIDC runtime token index 作为有效登录或 token 状态来源。

#### Scenario: 旧 global_session envelope 存在
- **WHEN** Redis 中仍存在旧 `global_session:*` envelope 或裸用户 DTO session
- **THEN** OIDC provider SHALL 将其视为未登录或无效 session
- **AND** provider SHALL NOT 将旧 payload 迁移为 PrincipalSession

#### Scenario: 旧 OIDC token index 存在
- **WHEN** Redis 中仍存在旧 OIDC access token user/client/global-session index
- **THEN** UserInfo、logout 和 active revoke SHALL NOT 以旧 index 作为权威来源
- **AND** 发布 cleanup SHALL 删除这些旧 index，避免运维误判 token 仍有效

### Requirement: OIDC provider 不得构造旧会话 Redis stores
OIDC provider SHALL 使用 Session Kernel adapter 管理 global session resolution、provider session binding 和 return handle，生产 composition SHALL NOT 构造迁移前旧 Redis stores 作为运行时依赖。

#### Scenario: Provider composition 注入 Session Kernel adapter
- **WHEN** OIDC provider runtime、services、interaction handler、claims service 或 redis adapter 需要 global session、provider session binding 或 return handle 能力
- **THEN** composition SHALL 注入 `oidcSession` 或等价 Session Kernel-backed port
- **AND** composition SHALL NOT 注入旧 `global-session.store`、`provider-session-binding.store` 或 `return-handle.store`

#### Scenario: Provider session binding 不使用 legacy bindingId
- **WHEN** OIDC provider 将 provider session uid 绑定到 IAM PrincipalSession
- **THEN** provider SHALL 通过 Session Kernel 创建 `protocol=oidc` 的 ClientBinding
- **AND** provider SHALL NOT 生成 `legacy:<sessionUid>` 或 `legacy:pending` bindingId 作为运行时 provider session binding

#### Scenario: Return handle 使用 Kernel artifact
- **WHEN** OIDC provider 需要在 SSO portal 与 provider interaction 之间创建登录返回 handle
- **THEN** provider SHALL 创建 `protocol=oidc`、`artifactType=login_return_handle` 的 Session Kernel ProtocolArtifact
- **AND** provider SHALL 通过 Session Kernel 原子消费该 artifact
- **AND** provider SHALL NOT 写入或读取旧 `oidc:login-return:*` store key 作为 return handle 权威来源

#### Scenario: 旧 store 模块不可被生产代码引用
- **WHEN** 执行 `@iam/oidc-provider` typecheck 或架构测试
- **THEN** 生产代码 SHALL NOT import 旧 `stores/global-session.store.ts`、`stores/provider-session-binding.store.ts` 或 `stores/return-handle.store.ts`
- **AND** 只覆盖旧 store 的测试 SHALL 被删除或迁移到 Session Kernel adapter 行为测试
