## Context

IAM 当前已经形成三层登录能力：

- `apps/api` 负责密码、手机、OA、WeChat 登录，以及 custom SSO `/sso/authorize|callback|token|logout` 和 `/auth/authz`。
- `apps/oidc-provider` 负责 OIDC provider、interaction、token、UserInfo、RP-Initiated Logout 和 OIDC runtime Redis 对象。
- `packages/api-core/src/session` 已经提供 global/local session Redis helper，`packages/api-core/src/oidc` 已经提供 OIDC token revoke index。

现状不是没有共享会话底座，而是底座仍以 helper 形态存在：custom SSO local session、OIDC provider session binding、OIDC access token index、login return handle 和 auth code 各自管理生命周期与 Redis key。继续在这个结构上增加 SAML、CAS 或其他单点协议，会重复实现 TTL、撤销、重放识别、logout 和状态校验。

本设计将 `@iam/api-core/session` 演进为协议无关 Session Kernel。它不接管具体登录方式，也不理解 OIDC scope、custom SSO redirect、ORCAS 或未来 SAML NameID；它只管理登录态、派生绑定、外发凭据、一次性 artifact、tombstone 与撤销编排。

## Goals / Non-Goals

**Goals:**

- 建立协议无关的 PrincipalSession、ClientBinding、IssuedCredential、ProtocolArtifact 和 RevokedTombstone 模型。
- 让 custom SSO 和 OIDC 都通过同一套会话生命周期、TTL、HMAC lookup、tombstone 和撤销索引运行。
- 将外部 bearer token 从 Redis 明文 key 中解耦，统一使用 high-entropy opaque token + HMAC lookup。
- 将 custom SSO auth code 与 local session 直接迁到 Session Kernel，保留 custom SSO 外部响应契约。
- 将 OIDC provider session binding 与 access token index 迁到 Session Kernel，同时保留 `oidc-provider` 协议 payload 管理。
- 支持状态校验 hooks、lazy revoke、批量 revoke summary 和 adapter cleanup best-effort。
- 为未来 SAML、CAS、API user token 或 service account session 预留稳定扩展点。

**Non-Goals:**

- 不改变密码、手机验证码、OA、WeChat 的认证校验业务规则。
- 不在第一阶段迁移 `clients.extAttributes` 和 `clients.oidc*` 到 `client_protocol_config` 表。
- 不让 Session Kernel 直接依赖 Hono、Koa、`@iam/db`、app-local audit service 或协议库。
- 不在第一阶段实现设备管理、可信设备、MFA、passkey、在线会话管理 UI 或多租户 namespace。
- 不把 OIDC ID Token、UserInfo claims、custom SSO `UserDetailDto`、SAML assertion 等协议 payload 放进 Kernel 公共模型。
- 不让后台 worker 成为正确性依赖；正确性依赖 TTL、tombstone、原子状态转换和读取时校验。

## Decisions

### 1. Session Kernel 放在 `@iam/api-core/session`

第一阶段在 `packages/api-core/src/session` 下新增 kernel 模块，并保留 legacy helper 导出。`apps/api` 与 `apps/oidc-provider` 已经依赖 `@iam/api-core`，因此无需新增 workspace 包。Kernel 代码不得依赖 app-local service、route、Hono/Koa response、DB repository 或 OIDC provider 类型。

目录建议：

```text
packages/api-core/src/session/
├── legacy.ts
├── index.ts
└── kernel/
    ├── config.ts
    ├── keys.ts
    ├── model.ts
    ├── hmac.ts
    ├── token.ts
    ├── store.ts
    ├── scripts.ts
    ├── facade.ts
    └── result.ts
```

### 2. Redis 是会话运行时权威源

PrincipalSession、ClientBinding、IssuedCredential、ProtocolArtifact、Tombstone 和索引继续使用 Redis。PostgreSQL 仍是用户、client、协议配置和审计日志权威源。第一阶段不新增持久化 session 表。

### 3. `sess:v2:` 是新会话 namespace

本变更是不兼容 Redis key 迁移，使用统一 namespace 隔离旧 key：

```text
sess:v2:principal:{principalSessionId}
sess:v2:principal:lookup:{lookupHash}
sess:v2:binding:{bindingId}
sess:v2:credential:{credentialId}
sess:v2:credential:lookup:{protocol}:{credentialType}:{lookupHash}
sess:v2:artifact:{artifactId}
sess:v2:artifact:lookup:{protocol}:{artifactType}:{lookupHash}
sess:v2:index:user:{principalType}:{subjectId}
sess:v2:index:client:{clientCode}
sess:v2:index:principal:{principalSessionId}
sess:v2:index:binding:{bindingId}
sess:v2:index:protocol:{protocol}
sess:v2:revoked:principal:{principalSessionId}
sess:v2:revoked:principal:lookup:{lookupHash}
sess:v2:revoked:credential:{credentialId}
sess:v2:revoked:credential:lookup:{protocol}:{credentialType}:{lookupHash}
sess:v2:revoked:artifact:{artifactId}
sess:v2:revoked:artifact:lookup:{protocol}:{artifactType}:{lookupHash}
```

索引用 sorted set，score 为 `expiresAt` epoch milliseconds，member 使用紧凑字符串，例如 `p:{id}`、`b:{id}`、`c:{id}`、`a:{id}`。读取或批量撤销前先 `ZREMRANGEBYSCORE` 清理过期 member。

### 4. PrincipalSession 是最小认证会话

PrincipalSession 表示用户完成一次 IAM 认证后的浏览器登录态。第一阶段只实现 `sessionKind="browser_user"`，但模型预留 `api_user` 和 `service_account`。

```ts
type PrincipalSession = {
  version: 1;
  principalSessionId: string;
  externalTokenLookupHash: string;
  lookupKeyId: string;
  sessionKind: "browser_user";
  principal: {
    principalType: "user";
    subjectId: string; // 当前为 String(user.id)
  };
  authTime: number;
  lastActiveAt: number;
  expiresAt: number;
  absoluteExpiresAt: number;
  amr: string[];
  acr?: string;
  snapshot: {
    username?: string;
    displayName?: string;
    mobile?: string | null;
  };
  clientContext?: {
    ip?: string;
    userAgent?: string;
    entryNetwork?: "internal" | "external";
    deviceLabel?: string;
  };
  tenantId: "default";
  issuerId: "iam";
};
```

PrincipalSession 不包含 `oidcSubject`、roles、privileges、employments、ORCAS 信息或协议 subject。custom SSO `username`、OIDC `sub` 和 Kernel `subjectId` 必须分层。

### 5. External bearer 全部 high-entropy opaque token + HMAC lookup

Kernel 生成通用 external token：

```text
PrincipalSession token: iam_ps_<base64url(randomBytes(32))>
custom SSO auth code:  iam_ac_<base64url(randomBytes(32))>
custom SSO local sid:  iam_ls_<base64url(randomBytes(32))>
OIDC return handle:    iam_or_<base64url(randomBytes(32))>
```

外部 token 前缀是内部实现细节，对外只承诺 opaque string。协议库强控制的外部凭据，例如 `oidc-provider` authorization code 或 access token，可以由协议库生成，但必须交给 Kernel 计算 HMAC lookup 并登记生命周期对象。

HMAC secret 独立于 OIDC cookie key、JWK 和 client secret：

```text
SESSION_LOOKUP_HMAC_CURRENT_ID
SESSION_LOOKUP_HMAC_CURRENT_SECRET
SESSION_LOOKUP_HMAC_PREVIOUS_ID optional
SESSION_LOOKUP_HMAC_PREVIOUS_SECRET optional
```

读取时先用 current key 计算 lookup，未命中时尝试 previous key。active object 记录 `lookupKeyId`，支持平滑轮换。

### 6. ClientBinding 是一等对象

ClientBinding 表示某个 client/protocol 从 PrincipalSession 派生出的会话关系。

```ts
type ClientBinding = {
  version: 1;
  bindingId: string;
  protocol: "custom-sso" | "oidc" | string;
  clientCode: string;
  principalSessionId: string;
  principal: { principalType: "user"; subjectId: string };
  authTime: number;
  issuedAt: number;
  expiresAt: number;
  renewalPolicy: "extend_with_principal" | "fixed_at_issue" | "never_extend";
  metadata?: Record<string, unknown>;
  cleanupRefs?: CleanupRef[];
};
```

custom SSO local session、OIDC provider session binding、未来 SAML SP session 或 CAS service session 都挂在 ClientBinding 下。

### 7. IssuedCredential 使用内部 ID + lookupHash

IssuedCredential 是外部系统或浏览器可持有的 bearer 凭据。Credential 内部 ID 不外发，外部明文只用于 HMAC lookup。

```ts
type IssuedCredential = {
  version: 1;
  credentialId: string;
  protocol: string;
  credentialType: string;
  lookupHash: string;
  lookupKeyId: string;
  principalSessionId: string;
  bindingId: string;
  clientCode: string;
  principal: { principalType: "user"; subjectId: string };
  issuedAt: number;
  expiresAt: number;
  renewalPolicy: "extend_with_principal" | "fixed_at_issue" | "never_extend";
  cleanupRefs?: CleanupRef[];
};
```

custom SSO local sid、OIDC access token、未来 service ticket 或 assertion ref 都是 credential。

### 8. ProtocolArtifact 管理一次性或短期协议对象

ProtocolArtifact 管理 auth code、OIDC return handle、OIDC authorization code ref 等可被提交、可被消费或需要重放识别的对象。

Artifact 成功消费后删除 active object 并写 `reason="consumed"` tombstone。自然 TTL 过期不主动写 tombstone。

custom SSO auth code 不再保存完整 `UserDetailDto`，只保存 PrincipalSession、client、redirectUrl 和 managementLevel 等引用；兑换时由 custom SSO adapter 重新构造 `UserDetailDto` local session payload。

### 9. Kernel 管生命周期，adapter 管协议 payload

Kernel 不解析或保存协议私有 payload。协议 adapter 可以读写自己的 payload key，但不能绕过 Kernel 写 lifecycle object、lookup、tombstone 或索引。

示例：

```text
custom-sso:local-session-payload:{credentialId} -> UserDetailDto payload
oidc-provider model/payload keys -> OIDC protocol payload
```

Kernel lifecycle object 记录 `cleanupRefs`，撤销时分组交给 adapter cleanup：

```ts
type CleanupRef =
  | { kind: "adapter"; protocol: string; refType: string; refId: string }
  | { kind: "redis-key"; key: string };
```

cleanup 失败不影响 tombstone 的安全拒绝语义，但必须进入 revoke summary 和 system log。

### 10. Revoked tombstone 是标准运行时拒绝机制

主动撤销和 artifact 成功消费都写 tombstone。自然 TTL 到期不主动写 tombstone。

```ts
type RevokedTombstone = {
  version: 1;
  objectType: "principal_session" | "client_binding" | "credential" | "artifact";
  objectId: string;
  lookupHash?: string;
  protocol?: string;
  credentialType?: string;
  artifactType?: string;
  clientCode?: string;
  principal?: { principalType: string; subjectId: string };
  principalSessionId?: string;
  bindingId?: string;
  reason: RevocationReason;
  causedBy?: { objectType: string; objectId: string };
  revokedAt: number;
  expiresAt: number;
};
```

默认 tombstone TTL：

```text
principal:  max(originalRemainingTtl, 24h)
binding:    max(longestChildRemainingTtl, 24h)
credential: max(originalRemainingTtl + 15min, 30min)
artifact:   max(originalRemainingTtl + 15min, 30min)
```

读取顺序必须是 tombstone first：

```text
1. 查 revoked tombstone
2. 查 active lookup/object
3. 做 schema、TTL、principal、binding、client/user/status/protocol version 校验
```

### 11. TTL、freshness 与 renewal policy

PrincipalSession 区分 idle timeout 和 absolute timeout：

```text
renew 后 expiresAt = min(now + idleTtl, absoluteExpiresAt)
authTime 只在重认证创建新 PrincipalSession 时变化
lastActiveAt 在允许刷新 session 的前台交互中更新
```

Kernel 提供协议无关 freshness evaluation：

```ts
type FreshnessRequirement = {
  maxAgeSeconds?: number;
  forceReauthentication?: boolean;
  requiredAmr?: string[];
  minimumAcr?: string;
};
```

OIDC `prompt=login/max_age`、未来 SAML `ForceAuthn/RequestedAuthnContext` 和 custom SSO 高敏 client 都映射到该模型。强制重认证成功后创建新 PrincipalSession，并撤销旧 PrincipalSession 下的派生对象。

Credential/artifact 续期由 policy 控制：

```text
custom-sso local_session:       extend_with_principal
oidc provider_session binding:  extend_with_principal
oidc access_token:              fixed_at_issue
custom-sso auth_code:           never_extend
oidc authorization_code:        never_extend
return handle:                  never_extend
```

后台请求，例如 `/auth/authz`、OIDC token endpoint、OIDC UserInfo，不刷新 PrincipalSession。

### 12. 状态校验 hooks 与 lazy revoke

Kernel 不直接查 DB，而是接受调用方注入校验 hooks：

```ts
type SessionValidationHooks = {
  validatePrincipal?(session: PrincipalSession): Promise<ValidationResult>;
  validateClient?(input: ClientBinding | IssuedCredential): Promise<ValidationResult>;
  validateProtocolVersion?(input: IssuedCredential | ProtocolArtifact): Promise<ValidationResult>;
};
```

校验失败后按失败类型决定 lazy revoke 范围：

```text
user_disabled/user_deleted -> 撤销该 user 全部 PrincipalSession
client_disabled/client_deleted -> 撤销该 client 全部协议
client_protocol_disabled/client_config_changed -> 撤销该 client + protocol
principal_missing/principal_revoked -> 撤销当前 binding/credential
credential_corrupted -> 撤销当前 credential
binding_invalid -> 撤销当前 binding 及子 credential
```

afterCommit 主动撤销是正常路径，lazy revoke 是兜底路径。

### 13. custom SSO 一次性迁到 Kernel 权威模型

custom SSO 不做长期旧 key 兼容。目标态废弃以下 key 的权威地位：

```text
global_session:{sid}
auth_code:{code}
local_<client>_session:{localSessionId}
local_session_reverse:{localSessionId}
local_session_set:{globalSid}
```

新流程：

- 登录成功创建 PrincipalSession，handler 继续写 `global_session` cookie。
- `/sso/authorize` 解析 PrincipalSession，创建 custom SSO auth code artifact。
- `/sso/callback` 或 `/sso/token` 原子消费 artifact，重新构造 `UserDetailDto` payload，创建 ClientBinding 和 local session credential。
- `/auth/authz` 通过 local sid HMAC lookup 解析 credential，先查 tombstone，再校验 principal、binding、client/user 状态，最后读取 custom SSO payload 并返回兼容的 `{ username, id }` 摘要。
- `/sso/logout` 调用 Kernel revoke 当前 PrincipalSession，custom-sso adapter 删除 payload 并 best-effort 通知 Independent client logout endpoint。

custom SSO local session payload 第一版继续保存完整 `UserDetailDto`，但只由 custom SSO adapter 读写。PrincipalSession 不再保存完整 `UserDetailDto`。

`/sso/authorize` 短期保留 cookie、`Authorization` header 和 query `token` 三种 PrincipalSession token 来源；header/query 来源记录脱敏 legacy usage system log。OA/WeChat 登录后的内部 query `token` 跳转先保留。

### 14. OIDC 适配 Kernel，不强行接管全部 provider model

OIDC provider session binding 并入 ClientBinding，但保留 `oidc-provider` 自己需要的 `sessionUid` 映射：

```text
oidc private mapping: provider session uid -> bindingId
Kernel binding metadata: { providerSessionUid }
```

OIDC access token 登记为 Kernel IssuedCredential，user/client/global session 索引迁到 Kernel 通用索引；OIDC token payload、UserInfo snapshot 和 provider model 继续由 OIDC adapter 管理。

OIDC return handle 与 authorization code 这类安全边界对象登记为 Kernel artifact，并获得 consumed/revoked tombstone。`oidc-provider` 内部 Interaction、Grant 等模型不在第一阶段全量登记到 Kernel。

OIDC maintenance 按不可用处理，进入 `ClientStatus.Maintance` 时撤销 OIDC protocol 对象；custom SSO maintenance 只在 `/auth/authz` 拒绝普通用户，不主动撤销 local session。

### 15. 撤销由 Kernel 编排，adapter cleanup best-effort

Kernel 提供幂等撤销 API：

```ts
revokePrincipalSession(principalSessionId, reason)
revokePrincipalSessionsBySubject(principalType, subjectId, options)
revokeClientProtocol(clientCode, protocol, reason)
revokeClientAllProtocols(clientCode, reason)
revokeBinding(bindingId, reason)
revokeCredential(credentialId, reason)
```

批量撤销返回结构化 `RevokeSummary`，包含 principal、binding、credential、artifact 的 revoked/alreadyRevoked/missing 数量，以及 adapter cleanup attempted/succeeded/failed 明细。外部 logout endpoint 或 adapter cleanup 失败不能阻断 IAM 权威态 tombstone，但必须记录日志并允许重试。

### 16. OpenSpec 和实施拆分

本 change 是 umbrella。建议使用 feature branch `feature/session-kernel` 和以下 child changes：

```text
1. session-kernel-core
2. custom-sso-session-kernel-adapter
3. oidc-session-kernel-adapter
4. admin-session-revocation
5. session-kernel-release-hardening
```

当前 umbrella 只固化 proposal、design、spec 和任务，不实现代码。

### 17. Umbrella 协调记录

集成分支：

- Umbrella change: `introduce-session-kernel`
- Umbrella work branch: `work/introduce-session-kernel`
- Feature integration branch: `feature/session-kernel`
- Feature branch base: `main`
- Child work branch rule: 每个 child 从 `feature/session-kernel` 创建 `work/<child-change-name>`，归档时 squash 回 `feature/session-kernel`，不得直接合并到 `main`。

Child change 顺序与目标分支：

| 顺序 | Child change | Target branch | Work branch | 依赖 | 交付边界 |
| --- | --- | --- | --- | --- | --- |
| 1 | `session-kernel-core` | `feature/session-kernel` | `work/session-kernel-core` | Umbrella artifacts | `@iam/api-core/session/kernel` core、模型、HMAC lookup、Redis lifecycle、tombstone、revoke summary 与 `@iam/api-core` 测试。 |
| 2 | `custom-sso-session-kernel-adapter` | `feature/session-kernel` | `work/custom-sso-session-kernel-adapter` | `session-kernel-core` | `apps/api` custom SSO 登录态、auth code、local session、`/auth/authz`、logout 与兼容响应契约。 |
| 3 | `oidc-session-kernel-adapter` | `feature/session-kernel` | `work/oidc-session-kernel-adapter` | `session-kernel-core` | OIDC resolver、provider session binding、return handle、authorization code ref、access token index、UserInfo 与 logout。 |
| 4 | `admin-session-revocation` | `feature/session-kernel` | `work/admin-session-revocation` | Kernel core + 至少一个 adapter cleanup contract | `apps/admin-api` user、password、client 与协议配置变更后的 afterCommit revoke port 与 summary 日志。 |
| 5 | `session-kernel-release-hardening` | `feature/session-kernel` | `work/session-kernel-release-hardening` | 前四个 child 的 runtime contract 稳定 | env 映射、旧 Redis key 清理 runbook/script、system log、架构测试、发布与回滚 smoke checklist。 |

跨 child 决策变更日志：

| 日期 | 决策 | 影响 | 状态 |
| --- | --- | --- | --- |
| 2026-06-21 | `feature/session-kernel` 是所有 child 的唯一 target branch。 | 子 change 先集成到 feature branch，umbrella 最终随 feature 一起进入 `main`。 | 已记录 |
| 2026-06-21 | `session-kernel-core` 必须先落地，协议 adapter 不在自己的 child 中复制 lifecycle、lookup、tombstone 或通用索引。 | custom SSO、OIDC 与 admin revoke child 只能消费 Kernel public API。 | 已记录 |
| 2026-06-21 | custom SSO 与 OIDC 的协议 payload 仍归 adapter 私有，Kernel 只保存 lifecycle object 与 cleanupRef。 | 防止 Kernel model 被 `UserDetailDto`、OIDC claims 或 provider model 污染。 | 已记录 |
| 2026-06-21 | `session-kernel-release-hardening` 在 runtime child 之后执行。 | env、runbook、架构测试和 smoke test 以稳定 contract 为准，减少重复修订。 | 已记录 |
| 2026-06-21 | `session-kernel-core` 已完成并归档，主规格已同步 `session-kernel-core` capability。 | 后续 adapter child 可从 `@iam/api-core/session/kernel` 依赖稳定 core API。 | 已归档 |

跨 child 风险与验收状态：

| 风险/验收项 | Owner child | 当前状态 | 验收证据 |
| --- | --- | --- | --- |
| Kernel API 不足导致 adapter 绕过 lifecycle key。 | `session-kernel-core` | Core complete；adapter diff 检查待后续 child 执行 | `@iam/api-core` kernel 架构测试、lint/test/typecheck 已通过。 |
| custom SSO 与 OIDC 对同一 PrincipalSession 的 revoke cleanup 顺序不一致。 | `custom-sso-session-kernel-adapter` / `oidc-session-kernel-adapter` | Open | logout、user disabled、client disabled 的跨模块 smoke check。 |
| Admin afterCommit revoke 与协议 adapter cleanup failure 语义不一致。 | `admin-session-revocation` | Open | revoke summary system log 与 best-effort failure 测试。 |
| 发布时旧 Redis session key 与新 `sess:v2:` key 混用。 | `session-kernel-release-hardening` | Open | 清理 runbook/script、维护窗口步骤和回滚步骤通过 review。 |

Child 合并 smoke check 记录：

| Child merged into `feature/session-kernel` | Required smoke check | Result | Notes |
| --- | --- | --- | --- |
| `session-kernel-core` | `pnpm --filter @iam/api-core lint`；`pnpm --filter @iam/api-core test`；`pnpm --filter @iam/api-core typecheck` | Passed | 2026-06-21 已通过；change 归档至 `openspec/changes/archive/2026-06-21-session-kernel-core/`。 |
| `custom-sso-session-kernel-adapter` | `pnpm --filter @iam/api test`；`pnpm --filter @iam/api typecheck`；custom SSO 登录、authorize、callback/token、authz、logout smoke。 | Pending | 待 child 合并后运行。 |
| `oidc-session-kernel-adapter` | `pnpm --filter @iam/oidc-provider test`；`pnpm --filter @iam/oidc-provider typecheck`；OIDC authorize、token、UserInfo、logout smoke。 | Pending | 待 child 合并后运行。 |
| `admin-session-revocation` | `pnpm --filter @iam/admin-api test`；`pnpm --filter @iam/admin-api typecheck`；user/client/password/status revoke smoke。 | Pending | 待 child 合并后运行。 |
| `session-kernel-release-hardening` | 受影响 package/app 必要 test/typecheck/lint；旧 Redis key 清理 dry-run；custom SSO、OIDC 与 admin revoke 集成 smoke。 | Pending | 待 child 合并后运行。 |

## Risks / Trade-offs

- [Risk] 不兼容 Redis key 迁移会强制所有用户重新登录。→ Mitigation: 使用维护窗口清理旧 session key，并在 runbook 中把清理作为发布阻断步骤。
- [Risk] custom SSO 直接切换权威 key 可能影响仍持有旧 local sid 的业务系统。→ Mitigation: 发布时清理旧 session 并强制重新走登录授权，保留 `/sso/token` 和 `/auth/authz` 外部响应契约。
- [Risk] HMAC lookup key 轮换配置错误会导致 active credential 无法解析。→ Mitigation: 支持 current/previous key、启动校验 secret 长度和 key id，并要求 previous 保留最长 credential TTL + tombstone TTL。
- [Risk] tombstone 增加 Redis 写放大和存储占用。→ Mitigation: tombstone TTL 有上限，不为自然过期对象主动写 tombstone，不建 tombstone 全量索引。
- [Risk] adapter cleanup 失败造成协议 payload 残留。→ Mitigation: tombstone 先行保证运行时拒绝，cleanup failure 进入 summary/system log，并通过 TTL 或后续重试清理。
- [Risk] Kernel 与 adapter 边界被后续代码绕过。→ Mitigation: 架构测试禁止协议模块直接写 Kernel lifecycle key，允许协议 payload key 但要求通过 Kernel 注册 lifecycle object。
- [Risk] OIDC provider 原子 consume 与 Kernel consumed tombstone 的时序难以完全合并。→ Mitigation: OIDC adapter 保留 provider 原有原子 consume，Kernel artifact tombstone 与 provider consume 的一致性通过专门测试和必要 Lua 包装验证。
- [Risk] `client_protocol_config` 暂不迁移会让配置模型短期仍不统一。→ Mitigation: 本次先统一运行时会话生命周期，配置表抽象作为后续 change。

## Migration Plan

1. 在 `work/introduce-session-kernel` 上完成 umbrella artifacts，不实现运行时代码。
2. 创建 `feature/session-kernel`，从 `main` 切出 child change 分支逐个实施。
3. `session-kernel-core` 先实现 `@iam/api-core/session/kernel`，保留 legacy helper，验证 `@iam/api-core` test/typecheck。
4. `custom-sso-session-kernel-adapter` 迁移 `apps/api` custom SSO，更新 `/sso`、`/auth/authz` 测试和 session consistency 测试。
5. `oidc-session-kernel-adapter` 迁移 `apps/oidc-provider` resolver、binding、return handle、authorization code ref 和 token index，跑 OIDC protocol/token/logout 回归。
6. `admin-session-revocation` 接入 user/client/password/status afterCommit 撤销，验证 admin-api 与受影响 app。
7. `session-kernel-release-hardening` 增加 env、runbook、旧 Redis key 清理脚本、observability 和 smoke test。
8. 发布时进入维护窗口，停止登录/SSO/OIDC 流量，清理旧 `global_session:*`、`auth_code:*`、`local_*_session:*`、`local_session_reverse:*`、`local_session_set:*` 和旧 OIDC token index，部署后强制重新登录。
9. 回滚时关闭新流量入口或回退到旧版本，并再次清理新旧 session key，避免双轨 session 混用；身份与 client 配置数据不回滚。

## Open Questions

无阻断性 open question。已知后续设计项包括 `client_protocol_config` 表迁移、在线会话管理 UI、设备管理、MFA/acr 策略、SAML/CAS 协议 adapter 和多租户 namespace。
