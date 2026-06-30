## 1. api-core 观测基础

- [x] 1.1 新增 `@iam/api-core/observability` 模块，导出 `ObservabilityContext`、`pickObservabilityContext()` 和 `observabilityLogFields()`
- [x] 1.2 调整 `packages/api-core/src/core/request-context.ts#getTraceId`，复用 `getTraceIdFromHeaders()` 并解析 `traceparent` 为 32 位 trace id
- [x] 1.3 扩展 shared UnitOfWork `transaction` API，支持可选 `{ observability }` options 且保持旧调用兼容
- [x] 1.4 调整 `runAfterCommitTasks()` 和 UnitOfWork test fake，使 afterCommit 失败日志包含 `requestId` 和 `traceId`
- [x] 1.5 为 trace header 解析、observability log fields 和 afterCommit observability 增加 `@iam/api-core` 单元测试

## 2. apps/api 请求上下文链路

- [x] 2.1 在 `apps/api` 导出 `ApiRequestContext` 类型别名，并统一使用 `getApiAuditRequestContext(c)` 构造 `requestContext`
- [x] 2.2 将 route-level `getVerificationContext(c, subject)` 改为 service-level `createHumanVerificationContext(requestContext, subject)`
- [x] 2.3 改造 auth handlers/service，使用 options 中的 `requestContext` 生成 HumanVerificationContext 并写入登录成功/失败 audit payload
- [x] 2.4 改造 open handlers/service 调用链，使人机校验、短信审计和密码重置审计使用同一 `requestContext`
- [x] 2.5 改造 public handlers/user service/user mobile binding helper，使自助改密、找回密码和绑定手机号审计写入 `requestContext`
- [x] 2.6 改造 sso handlers/service，把 `requestId` 位置参数升级为 `requestContext` options，并让 redirect pattern 日志携带 observability fields
- [x] 2.7 改造 custom SSO session adapter，使 `authorize` 和 `createLocalSession` 接收可用 observability/request context，并补齐 local login audit 与 payload 写入失败日志
- [x] 2.8 为 CAP 日志、auth audit、open/public/sso requestContext 透传增加或更新 `@iam/api` focused tests

## 3. admin-api 审计与 afterCommit

- [x] 3.1 在 admin-api mutation service 的 `uow.transaction` 调用中传入从 `auditContext` 提取的 observability context
- [x] 3.2 确认 admin session revocation summary 和 cleanup failure 日志继续携带 `requestId`/`traceId`
- [x] 3.3 扩展 audit log query schema、repository 和服务，使 admin-api 支持按 `traceId` 精确筛选
- [x] 3.4 为 admin-api audit traceId filter 和 afterCommit observability 增加或更新 focused tests

## 4. oidc-provider traceId 日志

- [x] 4.1 在 OIDC HTTP wrapper 中解析 traceId，并让 `oidc.provider.http_request.failed` 日志携带 traceId
- [x] 4.2 在 provider middleware 中将 traceId 写入 request state，并让 provider server/protocol error events 输出 traceId
- [x] 4.3 更新 `@iam/oidc-provider` HTTP server logging 和 provider event tests，覆盖 traceparent 解析与日志字段

## 5. gateway OpenTelemetry

- [x] 5.1 更新 APISIX dev/prod config，使 access log JSON 输出 `traceId`、`spanId` 和 `traceparent`
- [x] 5.2 配置 APISIX OpenTelemetry plugin metadata，启用 access log 可用的 OpenTelemetry nginx variables，并通过环境变量接收 collector endpoint
- [x] 5.3 在 IAM dev/prod manifest 的请求路径 plugin_config 中启用 `opentelemetry`，保留 request-id、real-ip、limit-req、cors 等既有插件语义
- [x] 5.4 扩展 gateway validator，要求 `iam` manifest 的请求路径 route/plugin_config 启用 `opentelemetry`
- [x] 5.5 在开发/生产 docker compose 中让既有 Alloy 提供 OTLP trace 接收端，并更新 APISIX collector endpoint 配置入口
- [x] 5.6 更新 gateway tests，覆盖 access log trace 字段、IAM opentelemetry validator 和既有敏感字段保护

## 6. admin 前端审计查询

- [x] 6.1 在 admin audit log query UI 中增加 `traceId` 输入与请求参数映射
- [x] 6.2 确认 audit detail drawer 和 Grafana deep link 同时使用 requestId 与可用 traceId
- [x] 6.3 执行 `@iam/admin` typecheck，并补充必要的轻量测试或参数构造断言

## 7. 验证与文档

- [x] 7.1 运行 `pnpm --filter @iam/api-core test`
- [x] 7.2 运行 `pnpm --filter @iam/api test`
- [x] 7.3 运行 `pnpm --filter @iam/admin-api test`
- [x] 7.4 运行 `pnpm --filter @iam/oidc-provider test`
- [x] 7.5 运行 `pnpm --filter @iam/gateway-apisix test`
- [x] 7.6 运行 `pnpm --filter @iam/admin typecheck`
- [x] 7.7 运行 `pnpm gateway:apisix:validate -- --env dev:iam`
- [x] 7.8 记录一次 gateway → backend → audit/log 的 smoke 证据，确认同一请求可通过 requestId 和 traceId 串联
