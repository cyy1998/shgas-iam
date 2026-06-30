## Context

IAM 当前已经有部分请求关联能力：APISIX `request-id` 插件负责 `X-Request-Id`，`api-core` HTTP/error logs 可从 headers 提取 `traceId`，`audit_log` 表也已有 `request_id` 和 `trace_id` 字段。但这些能力没有形成端到端合同：`apps/api` 的人机校验、登录、SSO、本地 session 和自助用户操作中存在 service 层日志或审计写入没有请求上下文；OIDC provider provider events 只记录 `requestId`；UnitOfWork afterCommit 失败日志没有继承事务发起请求；APISIX access log 没有 trace 字段，也没有 gateway 侧 trace context 生成/延续策略。

本变更需要横跨 `packages/api-core`、`apps/api`、`apps/admin-api`、`apps/oidc-provider`、`gateway`、`docker` 和 `apps/admin`，目标是建立清晰、显式、可测试的 `requestId`/`traceId` 观测上下文链路。

## Goals / Non-Goals

**Goals:**

- 请求路径内的系统日志和审计日志 SHALL 在可用时携带同一 `requestId` 和 `traceId`。
- APISIX gateway SHALL 生成或延续标准 W3C trace context，并在 gateway access log 中输出 trace 字段。
- 后端 SHALL 使用统一 trace header 解析规则，避免 `traceparent` 原文和 32 位 trace id 混用。
- `apps/api` SHALL 使用显式 `requestContext` 参数把请求上下文传入需要写日志或审计的 service/helper。
- `apps/admin-api` SHALL 保留 `auditContext` 命名，同时让 transaction afterCommit 失败和审计查询具备 trace 关联能力。
- OIDC provider SHALL 在 HTTP wrapper 和 provider event 日志中输出 `traceId`。
- 管理端审计日志 SHALL 支持按 `traceId` 筛选。

**Non-Goals:**

- 本变更不引入后端 OpenTelemetry SDK 或自动 instrumentation。
- 本变更不实现 outbound HTTP trace propagation；外部 SMS、ORCAS、logout notification 等调用只补日志关联字段。
- 本变更不把 `requestId` 与 `traceId` 合并，也不新增 `x-trace-id` 响应头。
- 本变更不扩展 gateway manifest 支持 APISIX `global_rules`；OpenTelemetry 插件先通过 app manifest 的 `plugin_config` 启用。
- 本变更不强行把无法获得请求因果的后台/订阅/启动日志伪造成有 trace 的日志。

## Decisions

### 使用 APISIX OpenTelemetry 作为 gateway trace 标准实现

APISIX 继续用 `request-id` 插件管理 `X-Request-Id`；trace 使用 `opentelemetry` 插件生成或延续 W3C `traceparent`。APISIX 通过 OTLP HTTP 将 spans 导出到既有 Alloy，避免为 tracing 再引入单独 collector 组件。APISIX access log 增加 `$opentelemetry_trace_id`、`$opentelemetry_span_id` 和 `$opentelemetry_context_traceparent`。

替代方案是自定义 `x-trace-id` 或复用 `request-id` 插件生成 traceId。该方案会产生第二套非标准 tracing 协议，也无法自然接入 OTLP/span 查询，因此不采用。

### traceId 只从标准/兼容 headers 解析，后端不随机生成

`getTraceIdFromHeaders()` 的优先级作为全仓库唯一语义：优先解析 W3C `traceparent` 的 trace-id，其次 `x-b3-traceid`，最后 `x-trace-id`。后端直接访问没有 trace header 时，日志和审计记录 `traceId = null`，由 gateway 或未来 OTel SDK 负责生成 trace context。

### 显式传递 requestContext，不使用 AsyncLocalStorage

`apps/api` handler 从 Hono context 构造一次 `requestContext`，再通过 options/input 显式传给需要写系统日志或审计日志的 service。service deps 继续表示长期依赖，不承载每次请求变化的上下文。

替代方案是把 request context 放入 service deps 或 AsyncLocalStorage。前者会破坏当前 composition 单例生命周期；后者会引入隐式依赖和测试复杂度，因此不采用。

### requestContext 与 auditContext 命名分层

`apps/api` 统一使用 `requestContext` 表示 `sourceApp/requestId/traceId/ip/userAgent/route/method`。`apps/admin-api` 保留 `auditContext`，因为它还包含 actor、principalSessionId 等审计主体信息。两者都结构兼容最小 `ObservabilityContext`。

### 在 api-core 提供最小 ObservabilityContext

新增 `@iam/api-core/observability`，提供 `ObservabilityContext`、`pickObservabilityContext()` 和 `observabilityLogFields()`。该模块只处理 `requestId`/`traceId`，不承载业务字段或 logger 生命周期。

### UnitOfWork transaction 支持 observability options

`uow.transaction(callback, { observability })` 将请求观测字段传入 afterCommit 执行阶段。afterCommit task 注册 API 不变，失败日志自动包含 `requestId` 和 `traceId`，后台/脚本未传时显式为 `null`。

### audit log 继续由业务 payload builder 保持纯函数

业务 audit helper 仍只构造 action、actor、target 和 details。service 写入审计时按统一顺序展开：

```ts
{
  ...requestContext,
  ...auditPayload,
}
```

该顺序保持和 `recordAuditLogFromContext(c, input)` 一致，允许业务 payload 显式覆盖默认字段。

### OIDC provider 本轮只补 HTTP wrapper 和 provider events

OIDC HTTP wrapper 负责解析 requestId/traceId；provider middleware 将 `traceId` 放入 `ctx.state`；provider protocol/server error events 记录 `traceId`。session adapter 内部没有稳定 request context 入参，本轮不强行贯穿所有 adapter warn。

## Risks / Trade-offs

- [APISIX OpenTelemetry 插件配置与 3.16 schema 不匹配] → 通过 `gateway:apisix:validate`、APISIX Admin API dry-run 和本地 gateway smoke 验证插件字段。
- [Alloy 不可用影响 gateway trace 导出] → APISIX collector endpoint 指向 Alloy OTLP HTTP 接收端；开发和生产 compose 均暴露 Alloy `4318`，gateway 日志字段测试仍覆盖配置存在。
- [requestContext 显式传参导致方法签名变多] → 所有新增横切参数统一放入 options/input 对象，避免位置参数继续膨胀。
- [全量 OpenTelemetry 采样增加生产成本] → IAM 默认 `always_on` 以保证排障完整性；Tender/GDS 等业务 app 后续可按流量切换 ratio。
- [afterCommit API 变更影响现有测试 fakes] → 同步更新 shared UnitOfWork test fake，并保持旧调用 `transaction(callback)` 兼容。
- [后台/订阅日志 traceId 为 null 被误解为缺陷] → 规格明确只有请求路径必须携带 traceId；无请求因果的后台日志不得伪造 traceId。

## Migration Plan

1. 先实现 `api-core` observability helper、trace parsing 和 UnitOfWork options，保持旧 API 兼容。
2. 改造 `apps/api` 请求路径，将 handler 构造的 `requestContext` 显式传入 auth/open/public/sso/user/custom SSO 调用链。
3. 改造 `apps/admin-api` transaction observability、audit traceId 查询和相关测试。
4. 改造 `apps/oidc-provider` HTTP wrapper/provider middleware/events。
5. 改造 APISIX config、IAM manifest、validator、docker compose 和 gateway tests；生产部署前确认 APISIX 可访问 Alloy OTLP endpoint。
6. 改造 admin audit log traceId filter。
7. 执行 focused validation，并通过 gateway + backend + audit smoke 验证同一请求的 `requestId`/`traceId` 一致。

回滚时，后端 `requestContext` 参数均为可选，代码可按提交回滚；gateway 可先禁用 IAM plugin_config 中的 `opentelemetry` 插件并保留 `request-id`，不影响业务转发。

## Open Questions

无。实现时如发现 APISIX 3.16 `opentelemetry` plugin schema 与预期字段不同，按实际 schema 调整 manifest，并在实现记录中说明差异。
