## Why

Session Kernel 已经完成 core、custom SSO、OIDC 与 admin revoke 适配，但发布前仍缺少统一配置门禁、旧 Redis key 清理、可检索系统日志、架构防回退测试和端到端 smoke 证据。现在需要把这些发布硬化项收口，避免上线后出现新旧 session namespace 混用、HMAC 配置不一致、撤销失败不可观测或协议 adapter 绕过 Kernel 的风险。

## What Changes

- 补齐 `apps/api`、`apps/admin-api` 与 `apps/oidc-provider` 的 Session Kernel env schema、生产校验和 composition 映射，使 namespace、TTL、HMAC current/previous key 配置一致且 fail closed。
- 编写旧 Redis session key 清理脚本或 runbook，覆盖 `global_session:*`、`auth_code:*`、`local_*_session:*`、`local_session_reverse:*`、`local_session_set:*`、旧 OIDC token/index/payload key，并要求维护窗口内强制重新登录。
- 更新 OIDC 发布回滚手册与 custom SSO 接入文档，说明 `sess:v2:`、opaque token、legacy query/header token 风险、HMAC rotation、旧 key 清理、回滚前置条件和 smoke 验收。
- 补齐系统日志事件与测试覆盖，使 legacy bearer source、revoke summary、cleanup failure、schema corrupted、tombstone replay 和 release cleanup 结果均可被 Loki/Grafana 检索，且不泄露 token、secret、cookie 或 payload。
- 增加架构测试，禁止 custom SSO、OIDC 和 admin adapter 绕过 Session Kernel lifecycle key、lookup、tombstone 与通用索引。
- 完成发布前验证清单，覆盖受影响 package/app 的 test/typecheck/lint，以及 custom SSO、网关鉴权、OIDC authorize/token/UserInfo/logout、用户/client 禁用撤销 smoke test。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `session-kernel-core`: 增加 release readiness 要求，覆盖统一 env/config、旧 key 清理、HMAC rotation、架构防回退测试和 smoke 记录。
- `authentication-sessions`: 明确 custom SSO 发布与回滚文档、legacy bearer source 观测、旧 custom SSO Redis key 清理和网关鉴权 smoke 验收。
- `oidc-provider`: 明确 OIDC 发布回滚手册、旧 OIDC runtime/index key 清理、Session Kernel 配置一致性和 OIDC 协议 smoke 验收。
- `system-log-observability`: 增加 Session Kernel release hardening 相关系统日志事件合同与敏感字段测试要求。

## Impact

- 影响共享包：`packages/api-core/src/session/kernel` 配置、key/namespace guard、cleanup/revoke 结果日志辅助、架构测试或测试 fixtures。
- 影响 public API：`apps/api` env validation、composition config、custom SSO session adapter 日志、旧 Redis key 清理说明和 smoke 流程。
- 影响 admin-api：`apps/admin-api` Session Kernel env/config 一致性、admin revoke summary/cleanup failure 日志测试和架构测试。
- 影响 OIDC provider：`apps/oidc-provider` env validation、composition config、OIDC adapter 日志、旧 provider/runtime key 清理说明和发布回滚手册。
- 影响文档：`docs/releases/oidc-release-runbook.md`、`docs/features/oidc/oidc-session-migration.md`、custom SSO 接入文档和最终 Session Kernel smoke 记录。
- 影响验证：需要运行相关 backend/shared package 的 test/typecheck/lint，并完成维护窗口 Redis cleanup dry-run 与 custom SSO/OIDC/admin revoke smoke checklist。
