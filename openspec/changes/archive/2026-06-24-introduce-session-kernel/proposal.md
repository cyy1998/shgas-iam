## Why

当前 custom SSO 与 OIDC 已经共享 `global_session`、Redis TTL 和部分撤销索引，但这些能力仍分散在 `apps/api`、`apps/oidc-provider` 和 `packages/api-core` 的 helper 中。继续按协议各自扩展会让未来 SAML、CAS 或其他单点协议重复实现会话生命周期、撤销、重放识别和登录态刷新规则。

本变更将 IAM 登录态提升为协议无关的底层 Session Kernel，使 custom SSO、OIDC 和后续协议都在同一套 PrincipalSession、ClientBinding、Credential、Artifact、Tombstone 与 Revocation 语义上适配。

## What Changes

- 新增 `session-kernel` 能力，定义协议无关的 PrincipalSession、ClientBinding、IssuedCredential、ProtocolArtifact、Revoked Tombstone、TTL、freshness、renewal policy、HMAC lookup 和统一撤销语义。
- 将 Session Kernel 第一阶段放在 `@iam/api-core/session` 下演进，保留现有 legacy session helper 导出，直到 custom SSO 与 OIDC 迁移完成。
- **BREAKING**：目标态会用 `sess:v2:` Redis namespace 和 high-entropy opaque token + HMAC lookup 取代现有 `global_session:{sid}`、`auth_code:{code}`、`local_<client>_session:{sid}`、`local_session_reverse:{sid}`、`local_session_set:{globalSid}` 权威 key；发布需要维护窗口清理旧 session 并强制重新登录。
- 将 custom SSO auth code 迁为 Kernel ProtocolArtifact，成功消费后写 `reason=consumed` tombstone；auth code 不再保存完整 `UserDetailDto`，兑换时由 adapter 重新构造 custom SSO local session payload。
- 将 custom SSO local session 迁为 Kernel IssuedCredential + ClientBinding；`UserDetailDto` 继续作为 custom SSO 协议 payload 保存，外部 `/sso/token` 与 `/auth/authz` 契约保持兼容。
- 将 OIDC provider session binding 并入 Kernel ClientBinding，将 OIDC access token user/client/global-session 索引迁到 Kernel credential index；OIDC 协议 payload 继续由 OIDC adapter 和 `oidc-provider` Redis adapter 管理。
- 引入 revoked tombstone 作为标准运行时拒绝机制，覆盖 principal、binding、credential 和 artifact；主动撤销与一次性 artifact 成功消费都写 tombstone，自然 TTL 过期不主动写 tombstone。
- 引入状态校验 hooks 与 lazy revoke：Kernel 不直接查 DB，但调用方可注入 user/client/protocol version 校验；校验失败按失败类型撤销 user、client、protocol、principal、binding 或 credential。
- 统一 user/client/password/client protocol 变更后的会话撤销入口，并返回结构化 revoke summary；adapter cleanup 与外部 logout 通知采用 best-effort，不影响 IAM 权威态撤销。
- 预留 `client_protocol_config` 目标态，但本 umbrella 第一阶段不要求迁移现有 `clients.extAttributes` 和 `clients.oidc*` 字段。

## Capabilities

### New Capabilities

- `session-kernel`: 协议无关的 IAM 底层会话系统，覆盖 PrincipalSession、ClientBinding、IssuedCredential、ProtocolArtifact、Tombstone、TTL/freshness、HMAC lookup、统一撤销和 adapter cleanup。

### Modified Capabilities

- `authentication-sessions`: custom SSO 授权码、局部会话、网关鉴权和 logout 需要适配 Session Kernel，并保留现有外部响应契约。
- `oidc-provider`: OIDC global session resolver、provider session binding、return handle、authorization code、access token 索引和 logout 需要适配 Session Kernel。

## Impact

- 影响共享包：`packages/api-core/src/session` 新增 Session Kernel core/facade、Redis key builder、HMAC lookup、tombstone、zset index、Lua/atomic helper 和测试；legacy helper 暂时保留。
- 影响 public API：`apps/api` 的 auth、SSO、session service、`/sso/authorize|callback|token|logout`、`/auth/authz` 和相关审计/系统日志需要逐步适配。
- 影响 OIDC provider：`apps/oidc-provider` 的 global session store/resolver、interaction return handle、provider session binding、token store、Redis adapter 集成和 logout middleware 需要逐步适配。
- 影响 admin-api：用户禁用/删除、密码变更、client 状态和协议配置变更后需要通过 afterCommit 触发统一会话撤销。
- 影响配置与发布：新增 Session Kernel HMAC、TTL、tombstone、namespace 和 token prefix 配置；发布需要清理旧 Redis session key 并强制重新登录。
- 影响验证：需要新增 Session Kernel 单元测试、custom SSO 回归测试、OIDC token/userinfo/logout 回归测试、admin 状态变更撤销测试和发布 smoke test。
