## Context

`introduce-session-kernel` 已经完成 `session-kernel-core`、custom SSO adapter 和 OIDC adapter child 的主体工作，`feature/session-kernel` 上已有 `@iam/api-core/session/kernel` 的 revoke API、RevokeSummary、cleanup adapter 机制，以及 admin-api 通过 Kernel PrincipalSession 鉴权的 middleware。当前 admin-api 仍保留两类旧集成：

- 用户禁用/删除后通过 `TokenRevocationPort.revokeUserTokens` 清理旧 OIDC token index，且使用 required afterCommit。
- client 状态、删除和 OIDC 配置变化后通过 `OidcInvalidationPort.invalidateClient` 删除 OIDC runtime cache 并 publish invalidation event，custom SSO local session 不在该路径内。

这个 child 的边界是把 admin-api 的用户、密码和 client/protocol 配置变更接入 Session Kernel 主动撤销。它不改变管理端 REST/tRPC 响应契约，不引入新的 PostgreSQL session 表，也不把 custom SSO/OIDC 协议 payload 合并进 Kernel 公共模型。

## Goals / Non-Goals

**Goals:**

- 在 admin-api composition 中提供统一 `SessionRevocationPort`，覆盖 user sessions、client protocol、client all protocols 和 except current session 的调用语义。
- 让用户禁用、软删除和管理员重置密码在事务提交后触发 Kernel revoke，并返回/记录 RevokeSummary。
- 让 client 全局禁用/删除、custom SSO 会话相关配置变化和 OIDC 配置/secret/status 变化在事务提交后触发对应协议对象撤销。
- 保留 `clientCache` required afterCommit，但让 session revoke 与 adapter cleanup 走 best-effort afterCommit，失败不改变已提交的管理操作结果。
- 记录结构化 system log，区分 revoked/alreadyRevoked/missing 计数、cleanup attempted/succeeded/failed 和 cleanup failure details。
- 补齐 admin-api 服务测试、revocation port 测试和必要 architecture guard，证明服务只依赖 port，不直接写 Redis 或导入协议 adapter singleton。

**Non-Goals:**

- 不实现在线会话管理 UI、会话列表、按设备撤销或管理员手动选择 session。
- 不迁移 `clients.extAttributes` 与 OIDC 字段到新的 `client_protocol_config` 表。
- 不改变 custom SSO `/sso/*`、`/auth/authz`、OIDC authorize/token/UserInfo/logout 的外部协议契约。
- 不让 admin-api 的 user/client service 直接依赖 `SessionKernel`、Redis key builder、custom SSO adapter 或 OIDC provider adapter。
- 不把自助改密 `/public/password/change` 与 `/open/password/reset` 纳入本 child；它们属于 `apps/api` 后续 session revocation 接入点。

## Decisions

### 1. 新增 admin-api SessionRevocationPort

在 `apps/admin-api/src/services/session-revocation/` 或 `apps/admin-api/src/composition/session/` 定义 consumer-owned port：

```ts
type AdminSessionRevocationPort = {
  revokeUserSessions(input: {
    userId: number;
    reason: "user_disabled" | "user_deleted" | "admin_revoke";
    exceptPrincipalSessionId?: string;
    auditContext?: AdminAuditContext;
  }): Promise<RevokeSummary>;
  revokeClientProtocol(input: {
    clientCode: string;
    protocol: "custom-sso" | "oidc";
    reason: "client_disabled" | "client_deleted" | "client_protocol_disabled" | "client_config_changed";
    auditContext?: AdminAuditContext;
  }): Promise<RevokeSummary>;
  revokeClientAllProtocols(input: {
    clientCode: string;
    reason: "client_disabled" | "client_deleted" | "client_config_changed";
    auditContext?: AdminAuditContext;
  }): Promise<RevokeSummary>;
};
```

服务层只注册 afterCommit task 并调用该 port。port 负责映射 Kernel `principalType=user`、`subjectId=String(userId)`，执行 Kernel revoke，聚合 summary，并写 system log。

### 2. Session Kernel 实例在 composition 中共享

admin-api 目前在 middleware composition 内创建 Kernel resolver。为了让鉴权和撤销使用同一份配置与 cleanup adapter，应在 admin-api composition 中提前创建 `sessionKernel` 或 `adminSession` composition object，再同时传给 services 与 middlewares。middleware 继续只消费 `resolvePrincipalSession`；revocation port 消费 revoke 方法。

如果实现 `exceptPrincipalSessionId` 需要核心过滤能力，优先在 `@iam/api-core/session/kernel` 增加最小 API，例如 `revokeUserSessions(principal, reason, { excludePrincipalSessionIds })`，而不是让 admin-api 读取 `sess:v2:` 索引或解析 index member。

### 3. afterCommit 使用 best-effort revoke

管理端事务提交后才能安全撤销会话，否则回滚事务可能提前登出用户或 client。revoke afterCommit SHALL 使用 `bestEffort`，因为 DB 事务已经提交，撤销失败也不能回滚业务事实。安全兜底来自 custom SSO/OIDC resolve 时的状态校验 hooks 与 lazy revoke。

`clientCache` 同步仍保持 required afterCommit，因为它是当前 admin-api client 读取契约的一部分；session revoke 与 cleanup failure 只影响运行时会话收敛速度，应进入 system log 和测试覆盖。

### 4. 撤销触发矩阵

用户侧：

| 管理操作 | Kernel 调用 | reason | 当前会话例外 |
| --- | --- | --- | --- |
| `updateUserStatus(..., Disable/Pause)` | `revokeUserSessions(user)` | `user_disabled` | 不排除 |
| `deleteUser` | `revokeUserSessions(user)` | `user_deleted` | 不排除 |
| `resetPasswordByUsername` | `revokeUserSessions(user)` | `admin_revoke` | 可排除当前 PrincipalSession |

client 侧：

| 管理操作 | Kernel 调用 | reason |
| --- | --- | --- |
| client status -> `Disable` | `revokeClientAllProtocols(clientCode)` | `client_disabled` |
| client soft delete | `revokeClientAllProtocols(clientCode)` | `client_deleted` |
| custom SSO `clientSecret`、`validRedirectUrls`、`callbackEndpoint`、`logoutEndpoint`、`managementLevel`、`requireOrcas` 变化 | `revokeClientProtocol(clientCode, "custom-sso")` | `client_config_changed` |
| OIDC configure、rotate secret、enable/disable、remove | `revokeClientProtocol(clientCode, "oidc")` | `client_config_changed` 或 `client_protocol_disabled` |
| client status -> `Maintance` | `revokeClientProtocol(clientCode, "oidc")` | `client_config_changed` |

custom SSO maintenance 继续遵守 `authentication-sessions` 规格：`/auth/authz` 对普通用户拒绝但不因 maintenance 主动撤销 local session。

### 5. cleanup adapter 是安全外的 best-effort

Kernel tombstone 是运行时拒绝的权威语义。custom SSO local session payload、Independent logout notification、OIDC provider session mapping 和 token/model payload cleanup 是 cleanup adapter 负责的副作用。

admin-api revocation port MUST 配置能处理现有 cleanupRef contract 的 cleanup adapters，或在无法处理时把 `cleanup adapter not configured` 作为 cleanup failure 写入 RevokeSummary/system log。实现时不得从 `apps/api` 或 `apps/oidc-provider` 导入 app-local service singleton；如需复用常量或 payload key builder，应抽取到无 app-local 依赖的共享模块，或在 admin-api 内实现只依赖 cleanupRef contract 的窄适配器。

### 6. system log 字段稳定且脱敏

每个 afterCommit revoke task 完成后输出一条结构化日志。建议事件名：

- `admin.session_revoke.user`
- `admin.session_revoke.client_protocol`
- `admin.session_revoke.client_all_protocols`
- `admin.session_revoke.cleanup_failed`

日志字段包含 `sourceApp="iam-admin-api"`、`requestId`、`traceId`、`actorUserId`、`targetUserId` 或 `clientCode`、`reason`、`protocol`、summary counters 和 cleanup counters。日志 MUST NOT 包含 external token、cookie、Authorization、clientSecret、password、OIDC secret hash 或完整 cleanup payload。

## Risks / Trade-offs

- [Risk] admin-api 直接 revoke 但未配置 cleanup adapter，协议 payload 可能残留到 TTL。→ Mitigation: tombstone 先行保证运行时拒绝；测试覆盖 cleanup adapter missing/failure summary；能共享的 cleanup adapter contract 在本 child 内补齐。
- [Risk] best-effort afterCommit 失败后旧 session 短时间仍可用。→ Mitigation: resolve 路径已有 user/client/protocol validation hooks 与 lazy revoke；system log 产生可告警事件。
- [Risk] reset password 是否保留当前管理员会话存在安全和体验取舍。→ Mitigation: port 支持 `exceptPrincipalSessionId`，默认管理他人时不排除；只有明确能解析当前 PrincipalSession 且目标用户就是当前 actor 时才可使用排除。
- [Risk] client status `Maintance` 对 custom SSO 与 OIDC 语义不同。→ Mitigation: specs 明确 OIDC maintenance 主动撤销，custom SSO maintenance 仅运行时拒绝普通用户，不主动撤销 local session。
- [Risk] 同一 client 变更可能同时触发 OIDC invalidation pubsub 与 Kernel revoke。→ Mitigation: 将旧 `OidcInvalidationPort` 收束进 `SessionRevocationPort`，保持 runtime cache invalidation/publish，但由一个 afterCommit task 统一记录 summary。

## Migration Plan

1. 在 `work/admin-session-revocation` 上创建 delta specs 和任务。
2. 新增 admin-api session revocation port、summary logger 和 composition wiring，并让 middleware 与 services 共享 Kernel 配置。
3. 替换 user service 的旧 `TokenRevocationPort` 调用，补齐 reset password afterCommit revoke。
4. 替换 client service 的旧 `OidcInvalidationPort` 分散调用，按触发矩阵注册统一 revoke task，同时保留 client runtime cache sync required task。
5. 增加 focused tests：user status/delete/reset password、client status/delete/update、OIDC configure/enable/disable/remove/rotate-secret、summary logging、cleanup failure 和 afterCommit best-effort。
6. 运行 `pnpm --filter @iam/admin-api test`、`pnpm --filter @iam/admin-api typecheck`；若触及 shared Kernel API，补充 `pnpm --filter @iam/api-core test` 与 typecheck。

## Open Questions

无阻断性 open question。实施时需要以现有 cleanupRef contract 为准决定是否抽取共享 cleanup adapter helper；该决定不改变外部 API，只影响 payload cleanup 的复用位置。
