## Why

`introduce-session-kernel` 已经把 custom SSO 与 OIDC 会话统一到 Session Kernel，但管理端用户、密码和 client 配置变更仍可能让旧会话在自然过期前继续可用。现在需要把 admin-api 的生命周期变更接入 Kernel 主动撤销，确保管理操作提交后立即收敛运行时登录态。

## What Changes

- 在 `apps/admin-api` 定义 Session Revocation port，由 composition 注入 Session Kernel revoker，不让业务服务直接依赖 Redis 或协议 adapter 实现。
- 在用户禁用、软删除和管理员重置密码成功提交后，通过 afterCommit best-effort 撤销该用户相关 PrincipalSession 与派生 custom SSO/OIDC 对象。
- 在 client 禁用、软删除、custom SSO 协议配置和 client secret 等影响会话有效性的变更提交后，撤销该 client 的 custom-sso 对象或全部协议对象。
- 在 OIDC 配置、secret、enabled、maintenance、status 和 remove/delete 变更提交后，撤销该 client 的 OIDC protocol 对象。
- 对每次主动撤销记录结构化 revoke summary system log；adapter cleanup failure 不回滚管理端业务事务，但必须可观测。
- 增加 admin-api 服务/adapter 测试，覆盖 afterCommit 触发、当前会话例外、revoke summary 记录和 cleanup failure best-effort 行为。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `admin-user-management`: 用户禁用、软删除和管理员重置密码提交后需要触发 Session Kernel 主动撤销。
- `client-registry`: custom SSO client 状态、删除、secret 和协议属性变化后需要撤销对应 custom-sso 或全部协议会话对象。
- `oidc-client-registry`: OIDC 配置、secret、启用状态、maintenance、全局状态和删除变化后需要撤销 OIDC protocol 对象。
- `session-kernel-core`: admin-api 需要通过稳定 revocation port 消费 Kernel revoke summary，并支持 except current session 的调用语义。
- `system-log-observability`: 需要新增管理端会话撤销 summary 和 cleanup failure 的结构化系统日志事件。

## Impact

- 影响 `apps/admin-api`：用户、密码、client 和 OIDC client 服务的 afterCommit 编排，composition 下的 revocation port wiring，相关 unit tests 与 architecture guard。
- 影响 `@iam/api-core/session/kernel` 使用面：复用现有 revoke user sessions、revoke client protocol、revoke client all protocols、revoke except current session 和 RevokeSummary 类型；若核心 API 缺口存在，应在本 change 内以最小增量补齐。
- 影响 custom SSO 与 OIDC runtime：被撤销对象的 tombstone 与 adapter cleanup 由 Kernel 执行，cleanup failure 只进入 summary/system log，不阻断 admin-api 原事务。
- 影响观测：新增 admin-api system log event、摘要字段和敏感字段脱敏要求。
