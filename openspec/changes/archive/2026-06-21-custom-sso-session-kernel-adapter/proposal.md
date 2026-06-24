## Why

`introduce-session-kernel` 已经完成总体设计，`session-kernel-core` 也已提供稳定的协议无关生命周期、HMAC lookup、tombstone 和撤销能力。custom SSO 仍在 `apps/api` 中使用 legacy `global_session:*`、`auth_code:*` 和 local session key 作为权威态，需要作为第二个 child change 迁移到 Session Kernel，避免继续扩散旧 helper 语义。

## What Changes

- 将密码、手机验证码、OA、WeChat 登录成功后的全局登录态创建改为通过 Session Kernel 创建 `browser_user` PrincipalSession，同时保持 `{ token, isMobileSet }` 响应和 `global_session` cookie 名。
- 将 `/sso/authorize` 改为解析并续期 PrincipalSession，再创建 `protocol=custom-sso`、`artifactType=auth_code` 的 Kernel ProtocolArtifact。
- 将 `/sso/callback` 与 `/sso/token` 改为原子消费 Kernel auth code artifact，校验 PrincipalSession 后创建 custom SSO ClientBinding 与 local session IssuedCredential。
- 将 custom SSO `UserDetailDto` local session payload 移到 adapter 私有 Redis key，由 Kernel lifecycle object 通过 `cleanupRefs` 关联清理。
- 将 `/auth/authz` 改为使用 local session opaque token 的 HMAC lookup，按 tombstone first、credential、binding、PrincipalSession、user/client 状态顺序校验，并返回兼容的用户摘要。
- 将 `/sso/logout` 改为通过 Kernel 撤销当前 PrincipalSession 及其派生对象，Independent client logout endpoint 继续 best-effort 通知，不阻断 IAM 权威态撤销。
- 短期保留 `/sso/authorize` 从 cookie、`Authorization` header 和 query `token` 获取 PrincipalSession token 的兼容入口，并记录脱敏 legacy bearer source 日志。
- **BREAKING**：custom SSO 不再把 `global_session:{sid}`、`auth_code:{code}`、`local_<client>_session:{sid}`、`local_session_reverse:{sid}`、`local_session_set:{globalSid}` 作为权威 Redis key；发布需要依赖后续 release hardening 清理旧 session 并强制重新登录。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `authentication-sessions`: custom SSO 全局登录、授权码、局部会话、网关鉴权和登出行为从 legacy Redis key 迁移到 Session Kernel，同时保持外部响应契约。

## Impact

- 影响 `apps/api` auth 与 SSO route/service/composition：登录、`/sso/authorize`、`/sso/callback`、`/sso/token`、`/sso/logout` 和 `/auth/authz`。
- 影响 `apps/api` custom SSO Redis payload、adapter cleanup、user/client 状态校验、审计或系统日志接入点。
- 影响 `packages/api-core` 使用方式：`apps/api` 开始消费 `@iam/api-core/session/kernel`，legacy session helper 在本 change 后不再作为 custom SSO 权威路径。
- 影响测试：需要覆盖 custom SSO authorize、callback、token、authz、logout、auth code replay、credential tombstone、PrincipalSession 失效、maintenance 拒绝和 Independent logout failure。
- 不迁移 OIDC provider、admin-api afterCommit revoke、Session Kernel env/runbook/旧 key 清理脚本；这些由后续 child changes 负责。
