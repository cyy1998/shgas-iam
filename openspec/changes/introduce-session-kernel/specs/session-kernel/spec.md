## ADDED Requirements

### Requirement: Session Kernel 管理协议无关会话对象
系统 SHALL 在 `@iam/api-core/session` 提供协议无关的 Session Kernel，并 SHALL 使用 PrincipalSession、ClientBinding、IssuedCredential、ProtocolArtifact 和 RevokedTombstone 管理 IAM 登录态及其派生对象。

#### Scenario: 创建浏览器用户 PrincipalSession
- **WHEN** 用户通过 IAM 支持的认证方式成功登录
- **THEN** Session Kernel SHALL 创建 `sessionKind=browser_user` 的 PrincipalSession
- **AND** PrincipalSession SHALL 保存 `principalType=user`、`subjectId=String(user.id)`、`authTime`、`lastActiveAt`、`expiresAt`、`absoluteExpiresAt`、`amr` 和最小 PrincipalSnapshot
- **AND** PrincipalSession SHALL NOT 保存 OIDC `sub`、`oidcSubject`、roles、privileges、employments、ORCAS session 或协议私有 payload

#### Scenario: 创建 ClientBinding
- **WHEN** 某协议为 client 从 PrincipalSession 派生会话关系
- **THEN** Session Kernel SHALL 创建 ClientBinding
- **AND** ClientBinding SHALL 记录 `protocol`、`clientCode`、`principalSessionId`、`principal`、`authTime`、`expiresAt` 和 renewal policy
- **AND** ClientBinding SHALL 可被 PrincipalSession、client、protocol 和 binding 索引找到

#### Scenario: 创建 IssuedCredential
- **WHEN** 某协议向浏览器、业务系统或 OAuth/OIDC client 发行 bearer credential
- **THEN** Session Kernel SHALL 创建 IssuedCredential
- **AND** IssuedCredential SHALL 记录内部 `credentialId`、`protocol`、`credentialType`、`lookupHash`、`principalSessionId`、`bindingId`、`clientCode`、`principal`、`issuedAt`、`expiresAt` 和 renewal policy
- **AND** IssuedCredential SHALL 可被 lookup hash、PrincipalSession、ClientBinding、client、principal 和 protocol 索引找到

#### Scenario: 创建 ProtocolArtifact
- **WHEN** 某协议创建可提交、可消费或需要重放识别的短期对象
- **THEN** Session Kernel SHALL 创建 ProtocolArtifact
- **AND** ProtocolArtifact SHALL 记录内部 `artifactId`、`protocol`、`artifactType`、`lookupHash`、关联 PrincipalSession 或 ClientBinding、`issuedAt` 和 `expiresAt`
- **AND** ProtocolArtifact SHALL 支持原子 consume

### Requirement: External bearer token 使用 HMAC lookup
系统 SHALL 将外部 bearer token 与 Redis 权威对象 key 解耦，并 SHALL 使用独立 HMAC secret 生成 lookup hash。

#### Scenario: Kernel 生成通用外部 token
- **WHEN** Session Kernel 需要创建 PrincipalSession token、custom SSO auth code、custom SSO local session sid 或 OIDC return handle
- **THEN** Kernel SHALL 使用至少 32 bytes 随机数生成 high-entropy opaque token
- **AND** token MAY 包含内部识别前缀
- **AND** 外部协议文档 SHALL 将 token 视为 opaque string，不要求调用方解析前缀

#### Scenario: 注册协议库生成的外部 token
- **WHEN** OIDC provider 或其他协议库生成 authorization code、access token 或其他 bearer token
- **THEN** adapter SHALL 将外部 token 明文交给 Session Kernel 计算 lookup hash 并登记生命周期对象
- **AND** Kernel SHALL NOT 在对象 key、日志、tombstone 或索引中保存外部 token 明文

#### Scenario: HMAC key 轮换
- **WHEN** deployment 配置 current 和 previous lookup HMAC key
- **THEN** Kernel SHALL 先使用 current key 计算 lookup hash
- **AND** 未命中时 SHALL 使用 previous key 尝试 lookup
- **AND** active object SHALL 保存命中的 key id

#### Scenario: HMAC secret 隔离
- **WHEN** 系统加载 Session Kernel 配置
- **THEN** lookup HMAC secret SHALL 独立于 OIDC cookie keys、JWK signing keys 和 client secret hash
- **AND** 启动校验 SHALL 拒绝长度不足或 key id 缺失的 HMAC secret

### Requirement: Session Kernel 使用 `sess:v2:` Redis namespace
系统 SHALL 使用 `sess:v2:` namespace 保存 Session Kernel 运行时对象、lookup、索引和 tombstone。

#### Scenario: 保存 active object
- **WHEN** Kernel 保存 PrincipalSession、ClientBinding、IssuedCredential 或 ProtocolArtifact
- **THEN** Redis key SHALL 使用 `sess:v2:` 前缀
- **AND** object payload SHALL 使用 JSON、包含 `version` 字段，并由 Zod schema 校验

#### Scenario: 维护 lookup key
- **WHEN** Kernel 保存 PrincipalSession、IssuedCredential 或 ProtocolArtifact
- **THEN** Kernel SHALL 写入对应 lookup key，使调用方可用 HMAC lookup hash 解析内部 object id
- **AND** lookup key TTL SHALL 不长于 active object TTL

#### Scenario: 维护 zset 索引
- **WHEN** Kernel 创建 PrincipalSession、ClientBinding、IssuedCredential 或 ProtocolArtifact
- **THEN** Kernel SHALL 将紧凑 member 写入相关 sorted set 索引
- **AND** sorted set score SHALL 使用 object `expiresAt` epoch milliseconds
- **AND** 读取索引时 SHALL 清理已过期 member

### Requirement: Revoked tombstone 参与运行时拒绝
系统 SHALL 为主动撤销和一次性 artifact 成功消费写入 RevokedTombstone，并 SHALL 在解析 active object 前先检查 tombstone。

#### Scenario: credential 被撤销
- **WHEN** IssuedCredential 被 logout、user disabled、client config changed 或其他主动原因撤销
- **THEN** Kernel SHALL 删除或标记 active credential
- **AND** Kernel SHALL 写入 credential id tombstone 和 lookup tombstone
- **AND** 后续携带相同外部 token 的请求 SHALL 在 active lookup 前命中 tombstone 并被拒绝

#### Scenario: artifact 成功消费
- **WHEN** ProtocolArtifact 被成功 consume
- **THEN** Kernel SHALL 删除 active artifact
- **AND** Kernel SHALL 写入 `reason=consumed` 的 artifact tombstone
- **AND** 后续重放相同 external artifact token SHALL 被识别为 consumed replay

#### Scenario: 自然过期
- **WHEN** active object 因 Redis TTL 自然过期
- **THEN** Kernel SHALL NOT 主动写 tombstone
- **AND** 后续 lookup 未命中 active object 且未命中 tombstone 时 SHALL 返回 `missing_or_expired`

#### Scenario: tombstone TTL
- **WHEN** Kernel 写入 PrincipalSession、ClientBinding、IssuedCredential 或 ProtocolArtifact tombstone
- **THEN** tombstone TTL SHALL 至少覆盖原对象剩余有效期
- **AND** credential 与 artifact tombstone SHALL 额外保留配置的 grace window

### Requirement: 对象状态转换具备原子语义
系统 SHALL 对 issue、consume、revoke 等安全关键状态转换使用 Redis transaction 或 Lua 保证原子语义。

#### Scenario: issue credential
- **WHEN** Kernel issue IssuedCredential
- **THEN** Kernel SHALL 在写 active credential 前检查同一 lookup hash 未被 revoked tombstone 阻断
- **AND** Kernel SHALL 原子写入 credential object、lookup key 和必要索引
- **AND** 任一安全关键写失败 SHALL fail closed，不得向调用方返回可用 external credential

#### Scenario: consume artifact
- **WHEN** Kernel consume ProtocolArtifact
- **THEN** Kernel SHALL 原子检查 tombstone、读取 active artifact、删除 active artifact 并写 consumed tombstone
- **AND** 已消费、已撤销、缺失或过期的 artifact SHALL NOT 产生 credential

#### Scenario: revoke 幂等
- **WHEN** 同一 object 被重复 revoke
- **THEN** 第一次 active-to-revoked SHALL 写 tombstone
- **AND** 后续 revoke SHALL 返回 alreadyRevoked 或 missing 结果
- **AND** 幂等 revoke SHALL NOT 删除或覆盖现有 tombstone reason

### Requirement: PrincipalSession 支持 idle 与 absolute timeout
系统 SHALL 区分 PrincipalSession idle timeout 与 absolute timeout，并 SHALL 控制派生对象续期不得超过 PrincipalSession 有效期。

#### Scenario: 前台交互续期
- **WHEN** custom SSO authorize 或 OIDC authorize 成功使用有效 PrincipalSession
- **THEN** Kernel SHALL 更新 `lastActiveAt`
- **AND** Kernel SHALL 将 `expiresAt` 更新为 `min(now + idleTtl, absoluteExpiresAt)`
- **AND** Kernel SHALL NOT 修改 `authTime`

#### Scenario: 后台请求不续期
- **WHEN** 请求为 `/auth/authz`、OIDC token endpoint、OIDC UserInfo、Discovery 或 JWKS
- **THEN** 系统 SHALL NOT 因该请求刷新 PrincipalSession TTL

#### Scenario: 派生对象续期策略
- **WHEN** PrincipalSession 续期
- **THEN** Kernel SHALL 只延长 renewal policy 为 `extend_with_principal` 的 binding 或 credential
- **AND** Kernel SHALL NOT 延长 `fixed_at_issue` 或 `never_extend` 的 credential 或 artifact

### Requirement: Session Kernel 支持 freshness evaluation
系统 SHALL 使用协议无关的 freshness requirement 判断当前 PrincipalSession 是否满足重认证和认证强度要求。

#### Scenario: max age 满足
- **WHEN** freshness requirement 包含 `maxAgeSeconds`
- **AND** 当前时间减去 PrincipalSession `authTime` 未超过 `maxAgeSeconds`
- **THEN** Kernel SHALL 返回 freshness satisfied

#### Scenario: 需要重认证
- **WHEN** freshness requirement 包含 `forceReauthentication=true`
- **THEN** Kernel SHALL 返回 reauthentication required
- **AND** 协议 adapter SHALL 要求用户重新完成 IAM 认证

#### Scenario: 重认证成功
- **WHEN** 用户因 freshness requirement 重新认证成功
- **THEN** 系统 SHALL 创建新的 PrincipalSession
- **AND** 系统 SHALL 撤销旧 PrincipalSession 下的 active binding、credential 和 artifact

### Requirement: Session Kernel 通过 hooks 执行状态校验
系统 SHALL 允许调用方注入 Principal、Client 和 protocol version 校验 hooks，并 SHALL 根据校验失败类型执行主动或 lazy revoke。

#### Scenario: Principal 校验失败
- **WHEN** resolve credential 时 `validatePrincipal` 返回 user disabled 或 user deleted
- **THEN** Kernel SHALL 拒绝当前请求
- **AND** Kernel SHALL 撤销该 user 的所有 PrincipalSession

#### Scenario: Client 协议校验失败
- **WHEN** `validateClient` 或 `validateProtocolVersion` 返回 client protocol disabled 或 client config changed
- **THEN** Kernel SHALL 拒绝当前请求
- **AND** Kernel SHALL 撤销该 client + protocol 下的 active binding、credential 和 artifact

#### Scenario: Kernel 不直接查 DB
- **WHEN** Kernel core 需要判断 user、client 或协议配置状态
- **THEN** Kernel SHALL 通过注入 hook 获得判断结果
- **AND** Kernel SHALL NOT import app-local repository、Drizzle schema 或 DB client

### Requirement: Kernel revoke 返回结构化 summary
系统 SHALL 为批量撤销返回结构化 RevokeSummary，并 SHALL 区分权威态撤销与 adapter cleanup。

#### Scenario: 撤销 user sessions
- **WHEN** 调用方按 user 撤销所有 PrincipalSession
- **THEN** Kernel SHALL 返回 PrincipalSession、ClientBinding、IssuedCredential 和 ProtocolArtifact 的 revoked、alreadyRevoked、missing 计数
- **AND** Kernel SHALL 返回每个 protocol adapter cleanup 的 attempted、succeeded、failed 和 failure details

#### Scenario: cleanup 失败
- **WHEN** adapter cleanup 或 Independent logout notification 失败
- **THEN** Kernel SHALL 保留已写 tombstone
- **AND** Kernel SHALL 将 cleanup failure 写入 RevokeSummary
- **AND** 后续 resolve SHALL 因 tombstone 拒绝对应 external bearer

### Requirement: Protocol adapter 不得绕过 Kernel 生命周期
系统 SHALL 要求协议 adapter 只管理协议 payload，不得绕过 Session Kernel 管理 lifecycle object、lookup、tombstone 和索引。

#### Scenario: adapter 保存协议 payload
- **WHEN** custom SSO 或 OIDC 需要保存协议私有 payload
- **THEN** adapter MAY 写入协议私有 Redis key
- **AND** adapter SHALL 在对应 Kernel lifecycle object 中登记 cleanupRef

#### Scenario: 禁止 adapter 自建生命周期索引
- **WHEN** 协议 adapter 发行或撤销 bearer credential
- **THEN** adapter SHALL 通过 Kernel 创建或撤销 IssuedCredential
- **AND** adapter SHALL NOT 自行写入 Kernel namespace 下的 active lifecycle key、lookup key、revoked tombstone 或通用索引

### Requirement: Session Kernel 配置统一
系统 SHALL 使用统一 SessionKernelConfig 由各 app env 映射，不得让 API 与 OIDC provider 各自定义不兼容的 TTL、HMAC 或 tombstone 语义。

#### Scenario: 加载 Kernel 配置
- **WHEN** apps/api 或 apps/oidc-provider 创建 Session Kernel
- **THEN** app SHALL 映射 env 为统一 SessionKernelConfig
- **AND** 配置 SHALL 包含 namespace、principal idle TTL、principal absolute TTL、HMAC keys、tombstone TTL 和 external token prefix

#### Scenario: cookie 名配置化
- **WHEN** app 需要读写 PrincipalSession cookie
- **THEN** app SHALL 使用统一 session principal cookie name 配置
- **AND** 默认 cookie name SHALL 保持 `global_session`
- **AND** Kernel SHALL NOT 直接操作 HTTP cookie
