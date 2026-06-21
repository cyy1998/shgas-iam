# session-kernel-core Specification

## Purpose
描述 `@iam/api-core/session/kernel` 的协议无关 Session Kernel Core 能力，作为后续 custom SSO、OIDC 和 admin revoke adapter 共享的会话生命周期、lookup、tombstone、撤销与校验底座。

## Requirements
### Requirement: Session Kernel Core 提供稳定公共模块
系统 SHALL 在 `@iam/api-core/session/kernel` 提供协议无关 Session Kernel Core，并 SHALL 保留现有 `@iam/api-core/session` legacy helper 的兼容导出。

#### Scenario: Kernel 子模块可被后续 adapter 引用
- **WHEN** 后续 custom SSO、OIDC 或 admin revoke adapter 从 `@iam/api-core/session/kernel` 导入 Kernel 类型和工厂函数
- **THEN** package exports SHALL 提供 `./session/kernel` 子路径
- **AND** 子路径 SHALL 导出 Kernel public API

#### Scenario: legacy session helper 保持可用
- **WHEN** 现有调用方继续从 `@iam/api-core/session` 使用 `createGlobalSession`、`readGlobalSession`、`writeLocalSession` 或 `removeGlobalSession`
- **THEN** 这些 legacy helper SHALL 保持现有导出和行为
- **AND** Kernel Core SHALL NOT 要求调用方立即迁移到 `sess:v2:` namespace

#### Scenario: Kernel 不依赖 app-local 运行时
- **WHEN** Kernel Core 编译
- **THEN** Kernel Core SHALL NOT import Hono、Koa、`@iam/db`、Drizzle schema、app-local service、route、middleware、audit writer 或协议库类型
- **AND** Kernel Core SHALL 通过依赖注入接收 Redis、clock、logger、validation hooks 和 cleanup adapters

### Requirement: Kernel Core 定义版本化 lifecycle object
系统 SHALL 定义 versioned PrincipalSession、ClientBinding、IssuedCredential、ProtocolArtifact 和 RevokedTombstone 模型，并 SHALL 使用 Zod schema 校验 Redis payload。

#### Scenario: PrincipalSession 保存最小认证会话
- **WHEN** Kernel Core 创建 `sessionKind=browser_user` 的 PrincipalSession
- **THEN** PrincipalSession SHALL 保存 `version=1`、`principalSessionId`、`externalTokenLookupHash`、`lookupKeyId`、`principal`、`authTime`、`lastActiveAt`、`expiresAt`、`absoluteExpiresAt`、`amr`、最小 `snapshot`、`tenantId` 和 `issuerId`
- **AND** PrincipalSession SHALL NOT 保存 OIDC `sub`、`oidcSubject`、roles、privileges、employments、ORCAS session、完整 `UserDetailDto` 或协议私有 payload

#### Scenario: ClientBinding 表达协议与 client 的会话关系
- **WHEN** Kernel Core 从 PrincipalSession 创建 ClientBinding
- **THEN** ClientBinding SHALL 保存 `version=1`、`bindingId`、`protocol`、`clientCode`、`principalSessionId`、`principal`、`authTime`、`issuedAt`、`expiresAt` 和 `renewalPolicy`
- **AND** ClientBinding SHALL 支持可选 `metadata` 和 `cleanupRefs`

#### Scenario: IssuedCredential 使用内部 ID 与 lookup hash
- **WHEN** Kernel Core 签发 IssuedCredential
- **THEN** IssuedCredential SHALL 保存 `version=1`、内部 `credentialId`、`protocol`、`credentialType`、`lookupHash`、`lookupKeyId`、`principalSessionId`、`bindingId`、`clientCode`、`principal`、`issuedAt`、`expiresAt` 和 `renewalPolicy`
- **AND** IssuedCredential SHALL NOT 保存外部 bearer token 明文

#### Scenario: ProtocolArtifact 支持短期可消费对象
- **WHEN** Kernel Core 创建 ProtocolArtifact
- **THEN** ProtocolArtifact SHALL 保存 `version=1`、内部 `artifactId`、`protocol`、`artifactType`、`lookupHash`、`lookupKeyId`、关联 PrincipalSession 或 ClientBinding、`issuedAt` 和 `expiresAt`
- **AND** ProtocolArtifact SHALL 支持原子 consume 和 consumed tombstone

#### Scenario: Redis payload schema 无效
- **WHEN** Kernel Core 读取到不符合对应 Zod schema 的 lifecycle object payload
- **THEN** Kernel Core SHALL 返回 fail closed 的 schema invalid 结果
- **AND** Kernel Core SHALL NOT 把该 payload 当作有效会话、credential 或 artifact

### Requirement: External bearer 使用 high-entropy token 与 HMAC lookup
系统 SHALL 将 external bearer token 与 Redis 权威 object key 解耦，并 SHALL 使用独立 HMAC key 计算 lookup hash。

#### Scenario: Kernel 生成 opaque token
- **WHEN** Kernel Core 需要生成 PrincipalSession token、custom SSO auth code、custom SSO local sid 或 OIDC return handle
- **THEN** Kernel Core SHALL 使用至少 32 bytes 随机数生成 high-entropy opaque token
- **AND** token MAY 包含内部识别前缀
- **AND** 调用方 MUST 将 token 视为 opaque string

#### Scenario: 注册外部协议 token
- **WHEN** OIDC provider 或其他协议库生成 authorization code、access token 或其他 bearer token
- **THEN** adapter SHALL 将外部 token 明文作为入参交给 Kernel Core
- **AND** Kernel Core SHALL 只保存该 token 的 HMAC lookup hash

#### Scenario: current key 命中 lookup
- **WHEN** deployment 配置 current lookup HMAC key，且 active object 使用 current key 创建
- **THEN** Kernel Core SHALL 使用 current key 计算 lookup hash 并解析 active object
- **AND** active object SHALL 保存 current `lookupKeyId`

#### Scenario: previous key 命中 lookup
- **WHEN** deployment 同时配置 current 和 previous lookup HMAC key，且 active object 使用 previous key 创建
- **THEN** Kernel Core SHALL 在 current lookup 未命中后使用 previous key 尝试 lookup
- **AND** 命中后 SHALL 返回 active object 记录的 previous `lookupKeyId`

#### Scenario: HMAC 配置无效
- **WHEN** current key id 缺失、secret 长度不足或 current/previous key id 冲突
- **THEN** Kernel Core SHALL 在配置创建阶段拒绝启动
- **AND** Kernel Core SHALL NOT 创建无法稳定 lookup 的 bearer token

### Requirement: Kernel Core 使用统一 Redis namespace 与索引
系统 SHALL 使用统一 key builder 管理 `sess:v2:` active object、lookup、revoked tombstone 和 zset index。

#### Scenario: 保存 active object
- **WHEN** Kernel Core 保存 PrincipalSession、ClientBinding、IssuedCredential 或 ProtocolArtifact
- **THEN** Redis key SHALL 使用配置的 namespace，默认 `sess:v2:`
- **AND** object payload SHALL 使用 JSON 保存并包含 `version` 字段

#### Scenario: 保存 lookup key
- **WHEN** Kernel Core 保存 PrincipalSession、IssuedCredential 或 ProtocolArtifact
- **THEN** Kernel Core SHALL 写入 lookup key，将 HMAC lookup hash 映射到内部 object id
- **AND** lookup key TTL SHALL 不长于对应 active object TTL

#### Scenario: 保存 zset 索引
- **WHEN** Kernel Core 创建 lifecycle object
- **THEN** Kernel Core SHALL 将紧凑 member 写入相关 sorted set 索引
- **AND** sorted set score SHALL 使用 object `expiresAt` epoch milliseconds

#### Scenario: 读取索引前清理过期 member
- **WHEN** Kernel Core 通过 user、client、principal、binding 或 protocol 索引执行批量撤销
- **THEN** Kernel Core SHALL 先按当前时间执行 `ZREMRANGEBYSCORE`
- **AND** 已过期 member SHALL NOT 参与 revoke summary 的 active revoked 计数

### Requirement: Kernel Core 的状态转换具备原子语义
系统 SHALL 对 issue、consume、renew 和 revoke 等安全关键状态转换使用 Redis transaction 或 Lua 保证原子语义。

#### Scenario: 创建 PrincipalSession
- **WHEN** Kernel Core 创建 PrincipalSession
- **THEN** Kernel Core SHALL 原子写入 PrincipalSession object、external token lookup key 和 principal/user index
- **AND** 任一安全关键写入失败时 SHALL fail closed
- **AND** Kernel Core SHALL NOT 向调用方返回可用 external token

#### Scenario: issue credential
- **WHEN** Kernel Core issue IssuedCredential
- **THEN** Kernel Core SHALL 在写 active credential 前检查同一 lookup hash 未被 tombstone 阻断
- **AND** Kernel Core SHALL 原子写入 credential object、lookup key 和必要索引
- **AND** 任一安全关键写入失败时 SHALL fail closed

#### Scenario: consume artifact
- **WHEN** Kernel Core consume ProtocolArtifact
- **THEN** Kernel Core SHALL 原子检查 tombstone、读取 active artifact、删除 active artifact、删除 lookup key 并写 consumed tombstone
- **AND** 已消费、已撤销、缺失或过期的 artifact SHALL NOT 产生 credential 或 binding

#### Scenario: renew PrincipalSession
- **WHEN** Kernel Core renew PrincipalSession
- **THEN** Kernel Core SHALL 原子更新 PrincipalSession `lastActiveAt`、`expiresAt`、Redis TTL 和相关索引 score
- **AND** Kernel Core SHALL 只延长 renewal policy 为 `extend_with_principal` 的 binding 或 credential

#### Scenario: revoke 幂等
- **WHEN** 同一 PrincipalSession、ClientBinding、IssuedCredential 或 ProtocolArtifact 被重复 revoke
- **THEN** 第一次 active-to-revoked SHALL 写入 tombstone
- **AND** 后续 revoke SHALL 返回 alreadyRevoked 或 missing 结果
- **AND** 后续 revoke SHALL NOT 覆盖已有 tombstone reason

### Requirement: resolve 必须 tombstone-first
系统 SHALL 在解析 active lifecycle object 前先检查 revoked tombstone，并 SHALL 将 tombstone 作为运行时拒绝依据。

#### Scenario: credential lookup 命中 tombstone
- **WHEN** 调用方使用 external credential token resolve credential
- **AND** 对应 lookup tombstone 已存在
- **THEN** Kernel Core SHALL 返回 revoked 结果
- **AND** Kernel Core SHALL NOT 读取 active credential payload 或 adapter 私有 payload

#### Scenario: artifact 重放命中 consumed tombstone
- **WHEN** 调用方重复提交已经成功 consume 的 artifact token
- **THEN** Kernel Core SHALL 返回 consumed replay 结果
- **AND** Kernel Core SHALL NOT 创建新的 binding、credential 或 artifact

#### Scenario: active object 自然过期
- **WHEN** external token 未命中 tombstone 且 active lookup 或 active object 不存在
- **THEN** Kernel Core SHALL 返回 missing_or_expired 结果
- **AND** Kernel Core SHALL NOT 主动写 tombstone

#### Scenario: 主动撤销写 tombstone
- **WHEN** PrincipalSession、ClientBinding、IssuedCredential 或 ProtocolArtifact 被主动撤销
- **THEN** Kernel Core SHALL 为 object id 写 tombstone
- **AND** 对于可由 external token lookup 的 object，Kernel Core SHALL 为 lookup hash 写 tombstone

### Requirement: Kernel Core 统一 TTL、freshness 与 renewal policy
系统 SHALL 在 core 中统一计算 PrincipalSession idle/absolute timeout、派生对象 TTL、freshness evaluation 和 renewal policy。

#### Scenario: PrincipalSession idle 续期
- **WHEN** 前台交互调用 renew 且 PrincipalSession 未过期
- **THEN** Kernel Core SHALL 将 `expiresAt` 更新为 `min(now + principalIdleTtl, absoluteExpiresAt)`
- **AND** Kernel Core SHALL 更新 `lastActiveAt`
- **AND** Kernel Core SHALL NOT 修改 `authTime`

#### Scenario: absolute timeout 限制续期
- **WHEN** `absoluteExpiresAt` 早于 `now + principalIdleTtl`
- **THEN** Kernel Core SHALL 将 PrincipalSession `expiresAt` 限制为 `absoluteExpiresAt`
- **AND** 派生 binding 或 credential 的 TTL SHALL NOT 超过 PrincipalSession 剩余有效期

#### Scenario: fixed 或 never renewal policy 不续期
- **WHEN** PrincipalSession renew 成功
- **THEN** Kernel Core SHALL NOT 延长 `fixed_at_issue` 或 `never_extend` 的 credential 或 artifact

#### Scenario: freshness 满足
- **WHEN** FreshnessRequirement 的 `maxAgeSeconds`、`requiredAmr` 和 `minimumAcr` 均被当前 PrincipalSession 满足
- **THEN** Kernel Core SHALL 返回 freshness satisfied

#### Scenario: freshness 要求重认证
- **WHEN** FreshnessRequirement 包含 `forceReauthentication=true` 或当前 PrincipalSession 不满足 max age / amr / acr 要求
- **THEN** Kernel Core SHALL 返回 reauthentication required 及对应原因
- **AND** Kernel Core SHALL NOT 自行执行 HTTP redirect 或认证流程

### Requirement: Kernel Core 支持 validation hooks 与 lazy revoke
系统 SHALL 允许调用方注入 principal、client 和 protocol version 校验 hooks，并 SHALL 根据校验失败类型执行 fail closed 和 lazy revoke。

#### Scenario: principal 校验失败
- **WHEN** resolve PrincipalSession、ClientBinding 或 IssuedCredential 时 `validatePrincipal` 返回 user disabled 或 user deleted
- **THEN** Kernel Core SHALL 拒绝当前 resolve
- **AND** Kernel Core SHALL 撤销该 user 的 active PrincipalSession

#### Scenario: client 校验失败
- **WHEN** resolve ClientBinding、IssuedCredential 或 ProtocolArtifact 时 `validateClient` 返回 client disabled 或 client deleted
- **THEN** Kernel Core SHALL 拒绝当前 resolve
- **AND** Kernel Core SHALL 撤销该 client 的 active protocol objects

#### Scenario: protocol version 校验失败
- **WHEN** `validateProtocolVersion` 返回 client protocol disabled 或 client config changed
- **THEN** Kernel Core SHALL 拒绝当前 resolve
- **AND** Kernel Core SHALL 撤销该 client + protocol 下的 active binding、credential 和 artifact

#### Scenario: hooks 未配置
- **WHEN** 调用方未注入某类 validation hook
- **THEN** Kernel Core SHALL 跳过该类外部状态校验
- **AND** Kernel Core SHALL 仍执行 tombstone、schema、TTL 和关联对象校验

### Requirement: Kernel Core 返回结构化 revoke summary
系统 SHALL 为单对象和批量撤销返回结构化 RevokeSummary，并 SHALL 区分权威态撤销与 adapter cleanup。

#### Scenario: revoke PrincipalSession
- **WHEN** 调用方撤销一个 active PrincipalSession
- **THEN** Kernel Core SHALL 撤销该 PrincipalSession 下的 active ClientBinding、IssuedCredential 和 ProtocolArtifact
- **AND** Kernel Core SHALL 返回 principal、binding、credential 和 artifact 的 revoked、alreadyRevoked、missing 计数

#### Scenario: revoke user sessions
- **WHEN** 调用方按 `principalType=user` 和 `subjectId` 批量撤销 sessions
- **THEN** Kernel Core SHALL 通过 user index 找到 active PrincipalSession
- **AND** Kernel Core SHALL 对每个 PrincipalSession 执行幂等级联撤销
- **AND** Kernel Core SHALL 返回聚合 RevokeSummary

#### Scenario: cleanup refs 分组执行
- **WHEN** 被撤销的 object 包含 cleanupRefs
- **THEN** Kernel Core SHALL 按 protocol 和 ref kind 分组调用注入的 cleanup adapter
- **AND** cleanup SHALL 在 tombstone 写入后执行

#### Scenario: cleanup 失败不回滚 tombstone
- **WHEN** adapter cleanup 失败、超时或返回异常
- **THEN** Kernel Core SHALL 保留已写 tombstone
- **AND** Kernel Core SHALL 在 RevokeSummary 中记录 cleanup attempted、succeeded、failed 和 failure details
- **AND** 后续 resolve SHALL 因 tombstone 拒绝对应 external bearer

### Requirement: Kernel Core 提供 fail closed 的测试覆盖
系统 SHALL 为 Session Kernel Core 提供 `@iam/api-core` 单元测试，覆盖安全关键成功路径和失败路径。

#### Scenario: HMAC lookup 测试
- **WHEN** 执行 `@iam/api-core` Session Kernel Core 测试
- **THEN** 测试 SHALL 覆盖 current key lookup、previous key lookup、invalid secret 配置和 external token 明文不落 Redis key

#### Scenario: lifecycle 测试
- **WHEN** 执行 `@iam/api-core` Session Kernel Core 测试
- **THEN** 测试 SHALL 覆盖 PrincipalSession create/resolve/renew、ClientBinding create、IssuedCredential issue/resolve/revoke 和 ProtocolArtifact create/consume/replay

#### Scenario: tombstone 与 TTL 测试
- **WHEN** 执行 `@iam/api-core` Session Kernel Core 测试
- **THEN** 测试 SHALL 覆盖 tombstone-first resolve、自然过期 missing_or_expired、tombstone TTL grace window、zset index 懒清理和 renewal policy

#### Scenario: revoke summary 与 cleanup failure 测试
- **WHEN** 执行 `@iam/api-core` Session Kernel Core 测试
- **THEN** 测试 SHALL 覆盖批量 revoke summary、alreadyRevoked、missing、cleanup success 和 cleanup failure 不回滚 tombstone

#### Scenario: package 验证
- **WHEN** 本 change 完成实现
- **THEN** `pnpm --filter @iam/api-core test` SHALL pass
- **AND** `pnpm --filter @iam/api-core typecheck` SHALL pass
