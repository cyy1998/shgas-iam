## Why

当前后端错误日志把访问日志等级和错误事件混在一起：`http.request.completed` 会把所有 4xx 记为 `warn`、5xx 记为 `error`，但已知业务错误、校验错误和 tRPC 错误缺少统一的失败原因日志。这样既会放大告警噪声，也会让排查“为什么失败”依赖零散手写日志。

本变更需要把运行时错误可观测性从审计和安全风控中拆清楚，用稳定事件和字段补齐 REST/tRPC 错误排障能力，同时保持系统日志不采集 request body、response body 或敏感 header。

## What Changes

- 将后端 `http.request.completed` 访问日志统一为 `info` 等级，保留 `statusCode` 供查询和 dashboard 聚合，避免访问日志本身承担告警语义。
- 为 REST 和 tRPC 引入统一 API 错误事件日志：
  - `api.error.handled`：记录已知 API runtime/domain business error、HTTPException 适配错误和 REST validation failure 的摘要。
  - `api.error.unhandled`：记录未知异常，保留原始 `err` 和 stack。
- 为已知错误定义统一日志分级策略：普通 4xx 默认 `info`，`/internal` 认证失败和 403 为 `warn`，已知 5xx 为 `error`。
- REST validation failure 继续返回现有 422 envelope，但新增服务端摘要日志，只记录 `issueCount` 和 `issuePaths`，不记录完整请求输入。
- admin-api tRPC `/rpc` 增加错误日志入口，使用同一套 `api.error.*` 事件，并通过 `surface = "trpc"` 和 procedure path 区分。
- OIDC provider 保留现有 `oidc.provider.*` 事件名，不强行改成 API 错误事件；只对齐 `http.request.completed` 等级和公共错误字段规范。
- 保持审计日志、human verification、login failure 等领域/安全事件语义不变；这些事件可以与统一 API 错误事件共存。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `api-error-handling`: 增加 REST/tRPC 错误处理层的统一错误事件日志、校验失败摘要日志、未知异常日志字段和分级要求。
- `system-log-observability`: 修改后端 request/access log 等级合同，并补充 API 错误事件、字段、脱敏和 OIDC provider 对齐要求。

## Impact

- 影响 `packages/api-core/src/logger/`、`packages/api-core/src/middlewares/error-handler.ts`、`packages/api-core/src/core/create-app.ts`、`packages/api-core/src/core/openapi/default-hook.ts` 和 tRPC helper/adapter。
- 影响 `apps/admin-api/src/routes/trpc/trpc.index.ts` 的 tRPC error logging 装配。
- 影响 `apps/oidc-provider/src/composition/http/create-http-server.ts` 的 request log level 行为，可能影响现有日志等级测试。
- 需要更新 `api-core`、`admin-api`、`oidc-provider` 相关日志测试，并视实现运行受影响包的 focused typecheck/test。
- 不改变 REST/tRPC 响应合同，不改变数据库 schema，不新增运行时依赖，不改变 Loki label 纪律。
