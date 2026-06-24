## Context

`introduce-session-kernel` 将 `oidc-session-kernel-adapter` 定义为 Session Kernel 第三个 child change，目标分支为 `feature/session-kernel`，依赖已归档的 `session-kernel-core`。Kernel Core 已在 `@iam/api-core/session/kernel` 提供 PrincipalSession、ClientBinding、IssuedCredential、ProtocolArtifact、tombstone-first resolve、HMAC lookup、validation hooks、revoke summary 和 cleanup adapter。

`apps/oidc-provider` 当前仍有独立 OIDC runtime store：

- `interaction/global-session.ts` 和 `stores/global-session.store.ts` 读取 legacy global session envelope。
- `stores/provider-session-binding.store.ts` 保存 provider session uid 与 global session/user 的绑定关系。
- `stores/return-handle.store.ts` 通过 OIDC 私有 Redis key 创建和消费 login return handle。
- `stores/token.store.ts` 保存 opaque Access Token 的 user/client/globalSession 反向索引。
- `storage/redis-adapter.ts` 管理 `oidc-provider` 的 Interaction、Grant、AuthorizationCode、AccessToken 等协议模型。

本变更的核心约束是：OIDC adapter 必须消费 Kernel public API，不得复制 lifecycle、lookup、tombstone 或通用索引；但 OIDC claims、UserInfo snapshot、Interaction、Grant 和 provider model 仍由 OIDC 私有存储管理。

## Goals / Non-Goals

**Goals:**

- 在 `apps/oidc-provider` composition 中创建 OIDC Session Kernel adapter/revoker，统一接入 Kernel、provider stores、client runtime、account repository 和 logger。
- 用 Kernel PrincipalSession 替换 OIDC global session resolver 的权威读取、校验和 authorize 前台续期。
- 用 Kernel ClientBinding 表达 provider session binding，并保留 provider session uid 到 bindingId 的私有映射。
- 用 Kernel ProtocolArtifact 管理 login return handle，并为 resume 成功写 consumed tombstone。
- 将 OIDC Authorization Code 作为 Kernel artifact ref 登记，保持 `oidc-provider` 原有原子 consume、PKCE 和 client authentication 语义。
- 将 OIDC opaque Access Token 登记为 Kernel IssuedCredential，迁移 user、client、PrincipalSession、binding 和 protocol 反向索引。
- 让 UserInfo、client/user/config 状态变化、maintenance 和 RP-Initiated Logout 以 Kernel tombstone、validation hooks、lazy revoke 和 revoke summary 为准。

**Non-Goals:**

- 不重写 `oidc-provider` 协议模型、Grant、Interaction 或 Authorization Code 的内部格式。
- 不改变 Discovery、JWKS、authorize、token、UserInfo、end session endpoint 的外部协议契约。
- 不发行 refresh token，不改变 PKCE S256、state、nonce、client authentication、CORS 或 ID Token claim 规则。
- 不迁移 custom SSO adapter 行为；跨协议 logout 只通过 Kernel revoke summary 和 cleanup adapter 协作。
- 不在本 child 中新增 release env/runbook/旧 Redis key 清理脚本；这些属于 `session-kernel-release-hardening`。
- 不在本 child 中实现 admin-api afterCommit 主动撤销入口；这里只提供 OIDC protocol revoke 能力供后续 child 调用。

## Decisions

### 1. 新增 app-local OIDC Kernel adapter，而不是让 provider 直接散落调用 Kernel

在 `apps/oidc-provider/src/session/` 或 `src/composition/session/` 下创建 OIDC adapter/revoker 工厂，composition 注入 Kernel、client runtime、account repository、provider private stores、Redis adapter cleanup 和 logger。`interaction`、`provider/configuration`、`storage/redis-adapter` 和 invalidation 模块只依赖 adapter port。

这样可以把 OIDC 专属 metadata、cleanupRefs、config version 校验和 provider payload cleanup 集中在一个边界内，避免多个模块各自拼 Kernel object metadata。

### 2. PrincipalSession token 仍来自 `global_session` cookie，但权威解析改为 Kernel

OIDC authorize 继续从浏览器读取配置化 cookie name，默认仍是 `global_session`。resolver 使用 `kernel.resolvePrincipalSession(externalToken)`，再通过 account repository/client runtime 执行 user/client/protocol version 校验；authorize 成功属于前台交互，调用 `kernel.renewPrincipalSession`，但 token endpoint、UserInfo、Discovery 和 JWKS 不刷新 PrincipalSession。

旧 `global_session:*` envelope 或 schema 不匹配对象不再兼容，视为未登录。发布清理留给 release hardening。

### 3. Provider session binding 变成 Kernel ClientBinding，provider session uid 只作为私有映射

OIDC session uid 是 `oidc-provider` 自身会话模型的一部分，不放入 PrincipalSession。adapter 在 authorize/interaction 登录成功时为 `protocol=oidc`、当前 clientCode 创建或复用 ClientBinding，metadata 记录 `providerSessionUid`、`oidcConfigVersion` 和必要 prompt context；私有 Redis key 仅保存 `providerSessionUid -> bindingId` 映射。

绑定对象的 cleanupRef 指向该私有映射和必要 provider payload。撤销时 Kernel 先写 tombstone，再 best-effort 删除 OIDC 私有映射。

### 4. Return handle 使用 Kernel ProtocolArtifact，resume 必须 consumed tombstone-first

未登录 authorize 保存 provider interaction 后，通过 Kernel 创建 `protocol=oidc`、`artifactType=login_return_handle` 的 ProtocolArtifact，external token 作为 opaque handle 发给 SSO portal。artifact metadata 保存 interaction uid、clientCode、redirect fingerprint、browser binding、`oidcConfigVersion` 和 return target。

resume endpoint 原子 consume artifact；成功后继续校验当前 PrincipalSession、client、config version、interaction uid 和浏览器绑定。已消费、已撤销、过期或绑定不匹配的 handle 不得跳转到 client redirect URI。

### 5. Authorization Code 保留 provider 原子 consume，同时登记 Kernel artifact ref

`oidc-provider` 仍负责 Authorization Code 创建、PKCE、client authentication 和 code consume 的协议正确性。adapter 在 code 创建后登记 `protocol=oidc`、`artifactType=authorization_code` 的 Kernel ProtocolArtifact/ref，metadata 记录 provider code uid、clientCode、PrincipalSession、bindingId、scopes、nonce、redirectUri hash 和 `oidcConfigVersion`。

token endpoint 成功消费 provider code 后，adapter consume 对应 Kernel artifact 并写 consumed tombstone。若 provider code 已消费但 Kernel artifact consume 失败，token 签发必须 fail closed，并撤销或清理本次可能创建的 provider payload；不得返回可用 Access Token 或 ID Token。

### 6. Access Token 使用 Kernel IssuedCredential，OIDC payload 仍私有

opaque Access Token 明文由 provider 生成或签发路径获得后传入 Kernel 登记，Kernel 只保存 HMAC lookup hash、credentialId、PrincipalSession、binding、clientCode、principal、TTL、`renewalPolicy=fixed_at_issue` 和 cleanupRefs。UserInfo snapshot、provider token payload、scope detail 和 claims source 继续由 OIDC token/private store 保存，并以 credentialId 或 provider token uid 关联。

UserInfo 请求先通过 Kernel resolve credential，按 tombstone、schema、TTL、binding、PrincipalSession、user/client/protocol version 校验通过后，才读取 OIDC 私有 UserInfo snapshot。命中 tombstone 时不得读取旧 snapshot。

### 7. OIDC 状态变化通过 Kernel revoke client protocol

OIDC client disabled/deleted、OIDC enabled/maintenance/config version/secret 变化时，OIDC invalidation 调用 `kernel.revokeClientProtocol(clientCode, "oidc", reason)`。User disabled/deleted 通过 `kernel.revokeUserSessions("user", subjectId, reason)` 或后续 admin child 的统一 port 触发。读取路径仍保留 lazy revoke 兜底。

OIDC maintenance 与 custom SSO 不同：当 client 进入 OIDC maintenance 或 OIDC protocol disabled，OIDC protocol objects SHALL 被主动撤销。

### 8. RP-Initiated Logout 只信任 Kernel 全局撤销

end session 校验 `id_token_hint` 和 `post_logout_redirect_uri` 后，通过当前 PrincipalSession external token 或 hint 中可识别的 session reference 找到 Kernel PrincipalSession，并调用 `kernel.revokePrincipalSession`。Kernel 级联撤销 custom SSO local session、OIDC binding、OIDC Access Token 和相关 artifact；各 protocol cleanup failure 进入 revoke summary/system log，但不回滚 tombstone。

## Risks / Trade-offs

- [Risk] `oidc-provider` code consume 与 Kernel artifact consume 分属两个边界，失败时可能出现一侧已消费。→ Mitigation: token 签发以两侧都成功为条件，失败时 fail closed，并增加 code replay、partial failure 和 no-token-return 测试。
- [Risk] provider session uid 私有映射和 Kernel ClientBinding 可能短暂不一致。→ Mitigation: binding tombstone 是运行时拒绝权威，私有映射仅用于 provider resume/session lookup，缺失或 schema 无效时按未绑定处理并 lazy revoke。
- [Risk] UserInfo 旧 snapshot 残留可能被误读。→ Mitigation: UserInfo 必须先 Kernel credential resolve，通过后才读取 snapshot；tombstone 或 validation failure 不访问 payload。
- [Risk] OIDC adapter 直接写 `sess:v2:` key 会破坏 Kernel invariant。→ Mitigation: adapter 只调用 Kernel public API；实现时补充架构测试或代码审查点，禁止 OIDC module 手写 Kernel lifecycle key。
- [Risk] 发布时旧 global session 与新 PrincipalSession 混用导致用户体验不一致。→ Mitigation: 本 child 不做双轨兼容，release hardening 必须在维护窗口清理旧 session key 并强制重新登录。
- [Risk] 维护状态语义与 custom SSO 不同。→ Mitigation: specs 明确 OIDC maintenance 主动撤销 OIDC protocol objects；custom SSO maintenance 不在本 child 变更。

## Migration Plan

1. 从 `feature/session-kernel` 创建并维护 `work/oidc-session-kernel-adapter`。
2. 在 OIDC composition 中装配 Session Kernel config、validation hooks、cleanup adapter 和 OIDC adapter/revoker port。
3. 迁移 global session resolver、provider session binding、return handle、Authorization Code ref、Access Token credential 和 UserInfo 校验路径。
4. 更新 OIDC invalidation 和 RP-Initiated Logout 走 Kernel revoke API，并记录 revoke summary/cleanup failure。
5. 增加或更新 OIDC authorize、interaction、token-flow、session-security、redis-adapter 和 architecture 测试。
6. 运行 `pnpm --filter @iam/oidc-provider test`、`pnpm --filter @iam/oidc-provider typecheck`，并按需要运行 `pnpm --filter @iam/api-core test/typecheck`。
7. 合并回 `feature/session-kernel` 后，在 umbrella design 中记录 OIDC child smoke check 结果。
8. 回滚时回退 OIDC provider 代码并清理新旧 session/token runtime key；由于本 feature 明确要求维护窗口强制重新登录，不提供长期双轨 session 兼容。

## Open Questions

无阻断性 open question。实现时需要在具体代码中确认 `oidc-provider` 暴露 Authorization Code external value 与 internal uid 的最佳挂接点；若库限制无法在同一 hook 中取得两者，应以 fail closed 的 wrapper 或 adapter 层测试锁定时序。
