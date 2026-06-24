## Why

`introduce-session-kernel` 已经确定 Session Kernel 的总体目标和 child change 顺序，但后续 custom SSO、OIDC 和 admin revoke 不能各自复制 lifecycle、lookup、tombstone 或索引逻辑。需要先在 `@iam/api-core/session` 落地一个稳定的协议无关核心，作为后续 adapter 只能消费的公共能力。

## What Changes

- 在 `packages/api-core/src/session/kernel` 新增 Session Kernel core，提供 PrincipalSession、ClientBinding、IssuedCredential、ProtocolArtifact、RevokedTombstone、CleanupRef、RevocationReason 和 result union 类型。
- 新增统一 `sess:v2:` Redis key builder、lookup key、zset index member、JSON/Zod schema 校验、TTL 计算和 namespace 配置。
- 新增 high-entropy opaque token 生成、HMAC lookup、current/previous key 解析和 secret 启动校验。
- 实现 PrincipalSession 创建/解析/续期、ClientBinding 创建、IssuedCredential 签发、ProtocolArtifact 创建/消费、tombstone-first resolve 和幂等撤销。
- 实现批量 revoke API、结构化 RevokeSummary、adapter cleanup 分组、cleanup failure 结果和 validation hooks / lazy revoke 编排边界。
- 保留现有 `@iam/api-core/session` legacy helper 导出，并为后续 child 提供稳定 Kernel public API。
- 本 change 不迁移 custom SSO、OIDC、admin-api 或发布 runbook；这些留给后续 child changes。

## Capabilities

### New Capabilities

- `session-kernel-core`: `@iam/api-core/session/kernel` 的协议无关核心能力，覆盖模型、HMAC lookup、Redis lifecycle、tombstone、TTL/freshness、原子状态转换、revoke summary、validation hooks 和 adapter cleanup contract。

### Modified Capabilities

- 无。

## Impact

- 影响共享包：`packages/api-core/src/session` 新增 `kernel/` 模块，并更新 `packages/api-core/package.json` exports 与 `packages/api-core/src/session/index.ts` 兼容导出。
- 影响测试：新增或扩展 `packages/api-core/src/session/__tests__`，覆盖 HMAC lookup、previous key、issue/resolve/revoke、artifact consume/replay、tombstone、TTL、zset 懒清理和 fail closed。
- 影响后续 child：custom SSO、OIDC 和 admin revoke 必须通过 Kernel public API 管理 lifecycle object、lookup、tombstone 和通用索引。
- 不影响外部 API 契约：本 change 不修改 `/sso/*`、`/auth/*`、OIDC endpoints 或 admin endpoints 的运行时行为。
