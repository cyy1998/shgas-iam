## Context

`introduce-session-kernel` 已将 IAM 会话目标态拆成 umbrella 与 5 个 child changes。`session-kernel-core` 已归档并同步主规格，提供 `@iam/api-core/session/kernel` 的 PrincipalSession、ClientBinding、IssuedCredential、ProtocolArtifact、HMAC lookup、tombstone-first resolve、renew、revoke summary 与 cleanup adapter 能力。

`apps/api` custom SSO 仍处于 legacy 状态：

- `createAuthService.loginPassword/loginMobile` 与 `createSsoService.loginOA/loginWX` 通过 `SessionService.setGlobalSession` 写 `global_session:*`。
- `/sso/authorize` 读取 legacy global session，刷新 TTL，并写 `auth_code:*`，auth code 中保存完整 `UserDetailDto` JSON。
- `/sso/callback` 与 `/sso/token` `getdel auth_code:*` 后写 `local_<client>_session:*`、`local_session_reverse:*`、`local_session_set:*`。
- `/auth/authz` 通过 local sid 读取 local session payload 和 reverse/global session 映射，再返回 `{ username, id }` 的 base64 摘要。
- `/sso/logout` 删除 global/local legacy key，并 best-effort 通知 Independent client logout endpoint。

本 child change 在 `feature/session-kernel` 上迁移 custom SSO，不要求该 feature 分支在 OIDC、admin revoke 和 release hardening child 完成前独立发布。

## Goals / Non-Goals

**Goals:**

- 在 `apps/api` 创建 custom SSO Session Kernel adapter，并通过 app composition 注入 auth、SSO 和 authz 服务。
- 将 IAM 登录成功后的全局登录态迁移为 Kernel PrincipalSession，保留外部 `{ token, isMobileSet }` 与 `global_session` cookie 名。
- 将 custom SSO auth code 迁移为 Kernel ProtocolArtifact，消费后写 `reason=consumed` tombstone。
- 将 custom SSO local session 迁移为 Kernel ClientBinding + IssuedCredential，local sid 使用 opaque external token + HMAC lookup。
- 将 `UserDetailDto` local session payload 改为 custom SSO adapter 私有 Redis payload，Kernel lifecycle object 只保存引用和 cleanupRefs。
- 保留 `/sso/authorize|callback|token|logout` 与 `/auth/authz` 的外部响应契约、错误语义和 Gateway/Independent 模式差异。
- 覆盖 legacy key 退出权威路径后的回归测试、replay/tombstone 测试和 cleanup failure 测试。

**Non-Goals:**

- 不迁移 OIDC provider resolver、OIDC provider session binding、return handle、authorization code ref 或 access token index。
- 不实现 admin-api user/client/password afterCommit revoke。
- 不新增发布 env/runbook、旧 Redis key 清理脚本或跨协议 smoke checklist。
- 不迁移 `clients.extAttributes`、client secret 存储方式或 custom SSO redirect 规则模型。
- 不改变密码、手机验证码、OA、WeChat 的认证校验规则、人机校验规则、登录失败计数或审计事件含义。
- 不让 Session Kernel 保存完整 `UserDetailDto`、ORCAS 数据、client secret、redirect URL 之外的协议 payload。

## Decisions

### 1. 在 `apps/api` 新增 custom SSO adapter，而不是把协议逻辑放进 Kernel

新增 app-local factory，例如 `createCustomSsoSessionKernelAdapter(deps)`，由 composition 注入 `SessionKernel`、Redis、logger、user/client service、audit writer、clock 和必要 fetch/orcas 端口。`createAuthService` 与 `createSsoService` 只依赖 adapter port，不直接依赖 `@iam/api-core/session/kernel` 低层 API。

adapter 负责：

- 从 `UserDetailDto` 构造 PrincipalSnapshot，并创建 PrincipalSession。
- 解析 authorize token 来源，resolve/renew PrincipalSession，创建 auth code artifact。
- 消费 auth code artifact，重建 `UserDetailDto`，创建 ClientBinding、IssuedCredential 和 custom payload。
- 读取 local session payload，执行 user/client 状态校验、maintenance 规则和 lazy revoke。
- 为 Independent logout notification、payload Redis key 和未来 cleanup 重试提供 cleanupRefs。

Alternative considered: 直接在 `SsoService` 中调用 Kernel facade。暂不采用，因为 route/service 已经包含 redirect、ORCAS、client secret、audit 和 error mapping 逻辑，继续散落 Kernel 调用会让协议边界更难审查。

### 2. PrincipalSession token 继续通过 `global_session` cookie 暴露

Kernel PrincipalSession external token 返回给登录 API，并由 handler 继续写名为 `global_session` 的 HttpOnly、SameSite=Lax cookie。cookie 名保持不变，cookie value 从 legacy session id 变成 opaque Kernel token。

`/sso/authorize` 短期仍接受 cookie、`Authorization` header 和 query `token` 三个来源；header/query 来源记录脱敏 system log，日志不得包含 token 明文。OA/WeChat 登录后的 query token 跳转兼容留到 release hardening 统一处理。

Alternative considered: 立即改 cookie 名或移除 header/query。暂不采用，因为前端与现有 OA/WeChat 跳转仍依赖当前入口；本 change 先替换权威态，入口收敛放到后续发布加固。

### 3. Auth code artifact 不保存完整 `UserDetailDto`

`/sso/authorize` 创建 `protocol=custom-sso`、`artifactType=auth_code` 的 ProtocolArtifact。artifact metadata 保存 `clientCode`、`redirectUrl`、PrincipalSession 引用和必要的 custom SSO exchange metadata，不保存完整 `UserDetailDto`。

`/sso/callback` 与 `/sso/token` 消费 artifact 后，从 PrincipalSession 的 `subjectId` 重新读取当前 user detail，再根据 Gateway/Independent 流程构造协议 payload。Gateway callback 若 client 要求 ORCAS，仍在 local payload 创建前执行 ORCAS 登录并把 ORCAS 信息写入 custom payload。

Alternative considered: 把旧 auth code payload 原样搬到 artifact metadata。暂不采用，因为这会把 `UserDetailDto`、ORCAS 和协议私有数据带入 Kernel 生命周期对象，违反 umbrella 与 core 规格。

### 4. Local session 由 Credential 管有效性，payload 只保存协议数据

callback/token 兑换成功时，adapter 创建 custom SSO ClientBinding 与 `credentialType=local_session` 的 IssuedCredential。外部 local sid 是 Kernel 生成或登记的 opaque token；Kernel 只保存 lookup hash、credentialId、bindingId、clientCode、principal 和 TTL，不保存外部 sid 明文。

custom SSO 私有 payload 使用 credentialId 作为稳定引用，例如：

```text
custom-sso:local-session-payload:{credentialId}
```

payload 保存兼容 `UserDetailDto` 响应所需数据，以及 Independent logout 需要的最小撤销引用。payload TTL 不得超过 credential TTL。cleanupRefs 指向该 payload key，并在 Independent 模式下包含 adapter cleanup ref；cleanup 失败进入 RevokeSummary 和 system log，但 tombstone 仍是运行时拒绝依据。

Alternative considered: 继续使用 `local_<client>_session:{sid}` 作为 payload key。暂不采用，因为 sid 是 external bearer，继续出现在 Redis key 会削弱 HMAC lookup 的目标。

### 5. `/auth/authz` 走 tombstone-first credential 校验

`/auth/authz` handler 仍从 cookie 或 `Authorization` header 获取 local session token，并按现有方式解析 `Client` header 与 `X-Forwarded-Uri`。业务校验改为：

1. 用 Kernel resolve custom SSO local session credential，先查 credential tombstone。
2. 校验 credential.clientCode 与请求 client 一致。
3. 校验 ClientBinding 与 PrincipalSession 仍 active、未撤销、未过期。
4. 通过 app-local user/client service 校验 user 与 client 状态；失败时按 core 语义 lazy revoke。
5. 对 `ClientStatus.Maintance` 保持 custom SSO 特例：普通用户拒绝并返回维护错误，但不主动撤销 local session。
6. 读取 custom payload，返回兼容的 `{ username, id }` base64 摘要和 `X-User-Info` header。

Alternative considered: 只 resolve credential，不校验 PrincipalSession 和 live user/client 状态。暂不采用，因为 umbrella 明确要求 authz 是 custom SSO 运行时拒绝与 lazy revoke 的关键入口。

### 6. `/sso/logout` 撤销 PrincipalSession，而不是手动删除 legacy key

logout 从 PrincipalSession token resolve 当前 session，调用 Kernel revoke PrincipalSession，级联撤销其 active ClientBinding、IssuedCredential 和 ProtocolArtifact。custom SSO adapter cleanup 删除 payload key，并对 Independent client logout endpoint best-effort 通知。即使 cleanup 或通知失败，handler 仍删除 `global_session` cookie 并按成功路径重定向。

如果请求中没有有效 PrincipalSession，logout 仍按幂等成功处理 cookie 删除与重定向，但不会创建新的 tombstone。

Alternative considered: 继续调用 `SessionService.removeGlobalSession` 并让 core 同步。暂不采用，因为 custom SSO 权威态必须从 legacy key 切走；旧 helper 保留只为未迁移调用方和发布过渡。

### 7. legacy `SessionService` 保留，但 custom SSO 不再依赖它作为权威态

本 change 会让 auth/SSO/authz 路径停止使用 `setGlobalSession`、`renewGlobalSession`、`getGlobalSession`、`setLocalSession`、`getValidatedLocalSessionUserString` 和 `removeGlobalSession` 作为 custom SSO 权威逻辑。legacy helper 仍保留，直到 OIDC adapter、admin revoke 和 release hardening 完成后再决定清理。

Alternative considered: 在同一个 child 删除 legacy helper。暂不采用，因为 OIDC 与发布加固尚未完成，提前删除会扩大集成风险。

## Risks / Trade-offs

- [Risk] custom SSO child 合并后 feature 分支中 custom SSO 与 OIDC 会短暂处于不同 session 权威模型。→ Mitigation: 该 feature 不独立发布；跨协议完整 smoke 放在后续 OIDC 和 release hardening child。
- [Risk] Independent logout 需要对外提交 sid，但 Kernel 不保存 external bearer 明文。→ Mitigation: sid 或等价撤销引用只保存在 custom SSO 私有 payload 或 cleanup adapter 上下文中，不写入 Kernel lifecycle、lookup、tombstone、索引或日志。
- [Risk] auth code 消费成功后创建 binding/credential/payload 中途失败可能留下半成品。→ Mitigation: 先依赖 Kernel 原子 consume 和 issue fail closed；payload 写失败时撤销刚创建的 binding/credential 并不返回 sid。
- [Risk] user/client live validation 引入额外 DB 查询会增加 `/auth/authz` 延迟。→ Mitigation: 先保证正确性；如后续性能不足，再在 adapter 内增加短 TTL 状态缓存，但缓存不得绕过 tombstone。
- [Risk] header/query legacy PrincipalSession token 兼容继续暴露 token 泄漏风险。→ Mitigation: 记录脱敏 system log，发布加固阶段给出收敛计划；本 change 不把 token 明文写日志。
- [Risk] ORCAS 登录仍在 local payload 创建时执行，失败会导致 auth code 已消费但未产生 local session。→ Mitigation: 这是一次性 artifact 的安全语义；失败后调用方需要重新授权，测试覆盖该路径不留下可用 credential。

## Migration Plan

1. 在 `work/custom-sso-session-kernel-adapter` 上完成 adapter、service 注入、route behavior 和测试。
2. 更新 `apps/api` composition，使 auth 和 SSO 服务消费 custom SSO Session Kernel adapter。
3. 更新现有 auth/SSO 单元测试和 session consistency 测试，改用 Kernel fake 或 test kernel，覆盖 legacy key 不再作为权威态。
4. 运行 `pnpm --filter @iam/api test` 与 `pnpm --filter @iam/api typecheck`。
5. 归档本 child 到 `feature/session-kernel` 后，在 umbrella smoke 记录 custom SSO 检查结果。

Rollback strategy: 在 feature 分支内可回退本 child squash commit，恢复 custom SSO legacy session helper 路径。生产发布与旧 Redis key 清理不在本 child 执行，由 `session-kernel-release-hardening` 统一处理。

## Open Questions

无阻断性 open question。后续 OIDC 与 admin revoke child 可能补充跨协议 cleanup 顺序和统一 revoke summary 日志字段，但不得改变本 change 固化的 custom SSO 外部响应契约。
