## Why

当前 IAM 的 `requestId`/`traceId` 关联能力不完整：部分安全业务日志、认证审计日志、SSO 日志、afterCommit 失败日志和 OIDC provider 事件无法稳定串回同一次请求。随着人机校验、Session Kernel、OIDC 和 APISIX gateway 链路变复杂，需要统一请求观测上下文，确保从 gateway、后端系统日志、审计日志到 Grafana deep link 都能按 `requestId` 和 `traceId` 排障。

## What Changes

- 在 `api-core` 引入最小 `ObservabilityContext`，统一 `requestId`/`traceId` 日志字段格式，并让 `getTraceId` 复用统一 header 解析规则。
- 在 `apps/api` 中建立显式 `requestContext` 传递约定，覆盖人机校验、认证登录、SSO、本地会话、自助改密、找回密码和绑定手机号等请求路径日志与审计写入。
- 让 CAP 人机校验相关 `human_verification.*` 运行日志、SSO redirect pattern 日志和 custom SSO 本地 session payload 日志携带 `requestId`/`traceId`。
- 扩展 shared UnitOfWork，使 afterCommit 失败日志可继承事务发起请求的 `requestId`/`traceId`。
- 在 `admin-api` 保持 `auditContext` 命名边界，同时让 admin mutation transaction/afterCommit 与审计查询支持 `traceId`。
- 在 `oidc-provider` HTTP wrapper 和 provider events 中解析并输出 `traceId`。
- 在 APISIX gateway 中使用 OpenTelemetry 插件生成/延续 W3C trace context，access log 输出 `traceId`、`spanId` 和 `traceparent`，并通过既有 Alloy 接收 APISIX 导出的 OTLP traces。
- 在管理端审计日志页面和 admin-api 查询条件中增加 `traceId` 过滤。

## Capabilities

### New Capabilities

无。本变更补齐既有系统日志、审计、网关、认证和会话能力的请求追踪合同。

### Modified Capabilities

- `system-log-observability`: 将 trace correlation 从可选记录提升为请求路径系统日志的一致合同，并覆盖 gateway、OIDC provider、业务安全日志和 afterCommit 失败日志。
- `audit-logging`: 要求 `apps/api` 认证/自助/SSO 审计写入携带请求上下文，并允许管理端按 `traceId` 查询审计日志。
- `gateway-configuration-management`: IAM APISIX manifest 和运行配置启用 OpenTelemetry tracing、输出 trace access log 字段，并校验 IAM routes/plugin_configs 的 tracing 插件。
- `human-verification`: 人机校验相关安全日志必须携带可用的请求观测字段。
- `oidc-provider`: OIDC provider 的 HTTP failed、protocol error 和 server error 日志必须携带可用 traceId。
- `backend-functional-di`: shared UnitOfWork transaction 支持可选 observability context，并在 afterCommit 失败日志中继承。

## Impact

- 影响 `packages/api-core` 的 logger/request-context/UnitOfWork 公共 API 和相关测试。
- 影响 `apps/api` 的 auth/open/public/sso handlers、human verification service、auth/sso/user service、custom SSO session adapter 和审计写入测试。
- 影响 `apps/admin-api` 的 UnitOfWork 调用、审计查询 schema/repository、session revocation/afterCommit 观测测试。
- 影响 `apps/oidc-provider` 的 HTTP server、provider middleware/events 和日志测试。
- 影响 `gateway` 的 APISIX config、IAM manifests、validator、tests、docker compose 和生产配置说明。
- 影响 `apps/admin` 审计日志查询 UI、参数构造和 typecheck。
