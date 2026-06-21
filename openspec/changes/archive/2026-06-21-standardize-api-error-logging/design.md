## Context

`api` 与 `admin-api` 通过 Hono `createApp` 注册 requestId、`hono-pino` 和自定义 request logger。当前 request logger 根据 HTTP status 把 `http.request.completed` 分为 `info`、`warn`、`error`；集中 REST error handler 只对未知异常输出 `api.error.unhandled`，对 `ApiRuntimeError`、domain business error、`HTTPException` 和 OpenAPI validation failure 只返回响应，不记录统一失败原因。

admin-api tRPC `/rpc` 通过 `fetchRequestHandler` 暴露 procedure，业务错误由 adapter 映射为 `TRPCError` 并返回给前端，但没有统一服务端错误日志入口。`oidc-provider` 已经输出 `oidc.provider.server_error`、`oidc.provider.protocol_error` 和 `oidc.provider.http_request.failed` 等领域错误事件，并复用 shared request log helper。

现有 `system-log-observability` 明确系统日志用于运行时排障和告警，独立于 PostgreSQL `audit_log`；本变更延续该边界，不把审计事实或安全风控事件并入 API 错误日志。

## Goals / Non-Goals

**Goals:**

- 将 `http.request.completed` 访问日志降为稳定请求事实日志，统一使用 `info` 等级。
- 为 REST 和 tRPC 提供统一 API 错误事件：`api.error.handled` 与 `api.error.unhandled`。
- 让已知业务错误、REST validation failure、tRPC 已知错误和未知异常都能通过稳定字段在 Grafana/Loki 中排查。
- 用统一策略控制错误日志等级：普通 4xx 不污染 `warn/error`，真正需要关注的 403、`/internal` 认证失败、已知 5xx 和未知异常仍输出高信号等级。
- 保持敏感数据约束：不记录 request body、response body、完整 headers、authorization、cookie、token、secret 或 password。
- 保持 OIDC provider 现有领域事件名，只对齐 request log 等级和公共错误字段。

**Non-Goals:**

- 不改变 REST envelope、tRPC error shape、HTTP status、business error code 或 frontend 错误处理合同。
- 不替代 `audit_log` 审计记录，也不改变 human verification、login failure、internal auth 等领域/安全事件的语义。
- 不引入 OpenTelemetry span、trace pipeline、新日志后端或新运行时依赖。
- 不调整 Loki label 纪律，不把 `requestId`、`traceId`、`route`、`errorCode` 或用户标识提升为 label。
- 不重命名 OIDC provider 的 `oidc.provider.*` 事件。

## Decisions

### 1. 访问日志与错误事件分层

`http.request.completed` SHALL 只描述请求完成事实，包括 `statusCode`、`durationMs`、`route`、`requestId`、`traceId`、`clientIp` 和 `userAgent` 等字段；它 SHALL 始终使用 `info` 等级。

错误告警和失败原因 SHALL 由专门错误事件承担：

- `api.error.handled`：已知 API runtime/domain business error、REST validation failure、`HTTPException` 适配错误和 tRPC 已知错误。
- `api.error.unhandled`：未知异常或没有 API runtime error shape 的异常。

备选方案是保留 `http.request.completed` 的 status level 升级。该方案查询直观，但会让一次 5xx 同时产生错误事件和 error 访问日志，导致告警重复；因此不采用。

### 2. 使用共享错误日志策略函数

在 `@iam/api-core/logger` 或相邻 API-core 模块中新增可测试的纯策略/构建函数，例如：

- `buildApiErrorLogFields`
- `getApiErrorLogLevel`
- `summarizeValidationIssues`

Hono `createErrorHandler`、OpenAPI `defaultHook` 和 admin-api tRPC route 只负责从各自框架上下文采集输入，再调用共享策略构造字段和等级。

备选方案是在 REST、validation hook 和 tRPC `onError` 中分别拼字段。该方案短期改动少，但字段、等级和脱敏边界容易漂移，因此不采用。

### 3. 统一错误字段合同

REST/tRPC API 错误事件 SHALL 使用同一组公共字段：

- `event`
- `surface`，取值为 `rest` 或 `trpc`
- `sourceApp`
- `requestId`
- `traceId`
- `method`
- `path`
- `route`
- `statusCode`
- `errorCode`
- `errorName`
- `errorMessage`

tRPC 事件 MAY 附加 `procedurePath` 和 procedure `type`。REST validation failure SHALL 附加 `issueCount` 和 `issuePaths`。未知异常和已知 5xx SHALL 附加 `err`；已知 4xx SHALL NOT 附加 `err`。

备选方案是为 tRPC 使用 `trpc.error.*` 事件。该方案能区分技术入口，但会让 dashboard、告警和查询规则分叉；统一 `api.error.*` 并用 `surface` 区分更适合当前系统日志合同。

### 4. 错误日志等级策略

错误事件等级 SHALL 按可操作性而不是 HTTP status 粗暴映射：

- 未知异常：`error`，记录 `err` 和 stack。
- 已知 5xx：`error`，记录 `err`。
- `/internal` 入口认证失败：`warn`。
- 403：`warn`。
- 普通 401：`info`。
- 400、404、409、422 等普通客户端/业务失败：`info`。

该策略保留安全和权限异常信号，同时避免普通业务冲突、校验失败和未登录刷新造成 `warn` 噪声。领域/安全事件仍可按自身规则输出 `warn` 或 `info`，并与 `api.error.handled` 共存。

### 5. REST validation failure 只记录摘要

OpenAPI `defaultHook` 继续向客户端返回完整 validation issues，以保持现有响应合同；服务端新增 `api.error.handled` 摘要日志，记录：

- `statusCode = 422`
- `errorCode = ApiErrorCode.ValidationFailed`
- `errorName = "ValidationError"`
- `issueCount`
- `issuePaths`

日志 SHALL NOT 包含 request body、完整 issues、用户输入值或完整 headers。备选方案是不为 validation failure 打专门日志，继续依赖 422 request log；但访问日志降为统一 `info` 后，这会失去接口契约排障摘要，因此不采用。

### 6. REST error handler 覆盖已知错误与未知错误

`createErrorHandler` SHALL 在处理 `ApiRuntimeError`/domain business error 时记录 `api.error.handled`，再保持现有响应 envelope 和 HTTP status。处理 `HTTPException` 时也记录 `api.error.handled`，但响应行为保持当前保守兼容：业务 `code` 仍为 `ApiErrorCode.InternalError`，HTTP status 仍尊重 exception status。

未知异常 SHALL 继续记录 `api.error.unhandled`，包含 `err`、`source`、`errorName` 和 `errorMessage`，并继续返回不暴露内部细节的 500 envelope。

### 7. tRPC 通过 fetchRequestHandler onError 接入

admin-api tRPC `/rpc` SHALL 在 `fetchRequestHandler` 中注册 `onError`。该入口 SHALL 使用 `error.cause` 中的 API runtime error shape 识别已知错误；若能识别，则记录 `api.error.handled`，否则记录 `api.error.unhandled` 并附加 `err`。

adapter 现有 `mapCustomErrorToTRPCError` 和 formatter 行为保持不变，前端仍通过当前 tRPC error shape 读取 `serviceCode`、`serviceMessage` 和 `httpStatus`。

### 8. OIDC provider 保留领域事件名

`oidc-provider` 已有 `oidc.provider.server_error`、`oidc.provider.protocol_error`、`oidc.provider.http_request.failed` 等事件，表达力强于通用 `api.error.*`。本变更不重命名这些事件，只要求：

- `http.request.completed` 统一使用 `info`。
- OIDC 错误事件继续包含 `requestId`、`errorName`、`errorMessage`、`statusCode` 或 `err` 等稳定字段。
- OIDC access token、ID token、refresh token、authorization code、client secret、cookie 和 private key 不得明文输出。

### 9. 专门事件与统一 API 错误事件共存

internal auth、human verification、SSO redirect pattern、session notification 等专门日志继续保留。它们描述领域原因或安全上下文；`api.error.handled` 描述 API 请求最终失败结果。实现不引入 `alreadyLogged` 跳过机制，避免统一失败视图被切碎。

## Risks / Trade-offs

- [Risk] 访问日志全部降为 `info` 后，旧 dashboard 或 alert 如果依赖 `level=error` 的 `http.request.completed` 会失效。→ Mitigation：同步更新相关查询/测试，告警改为使用 `event=api.error.unhandled`、`api.error.handled` 或 `statusCode` 聚合。
- [Risk] 已知 4xx 新增 `api.error.handled` 会增加日志量。→ Mitigation：普通 4xx 使用 `info`，字段保持摘要；后续如噪声过高可对低价值错误码增加采样。
- [Risk] `errorMessage` 可能包含业务输入，例如组织编码或用户名。→ Mitigation：不记录 body/headers；禁止 token、secret、password 等敏感值进入 error message；如发现高敏字段再引入 sanitizer。
- [Risk] tRPC `onError` 中取 Hono context 或 requestId 的方式与 fetch adapter 类型不完全顺滑。→ Mitigation：封装最小上下文提取函数，并用 focused tests 覆盖 known/unknown tRPC error。
- [Risk] `HTTPException` 仍使用 `InternalError` business code，语义不理想。→ Mitigation：本变更只补日志，不改变响应合同；后续可单独评估 HTTPException code 映射。
- [Risk] OIDC provider 保留领域事件名会与 REST/tRPC 事件不完全统一。→ Mitigation：这是有意边界；通过公共字段和 requestId 保持跨服务排障能力。

## Migration Plan

1. 在 `@iam/api-core` 增加 API 错误日志事件常量、字段构建器、等级策略和 validation issue 摘要 helper。
2. 将 `getStatusLogLevel` 或 request log adapter 调整为对 `http.request.completed` 返回/使用 `info`。
3. 更新 REST `createErrorHandler`，为已知错误、`HTTPException` 和未知异常调用统一错误日志策略。
4. 更新 OpenAPI `defaultHook`，为 validation failure 输出摘要 `api.error.handled`。
5. 更新 admin-api tRPC route，给 `fetchRequestHandler` 增加 `onError` 并复用统一错误日志策略。
6. 对齐 OIDC provider request log 等级，并保留现有 OIDC 错误事件。
7. 更新或新增 focused tests，覆盖 request log level、REST known/unknown error、validation summary、tRPC known/unknown error、OIDC request log level。
8. 运行 `@iam/api-core`、`@iam/admin-api`、`@iam/api` 和 `@iam/oidc-provider` 的相关 test/typecheck。

回滚策略：回退本变更代码即可恢复旧日志等级和错误日志行为；不涉及数据库迁移、响应合同变更或环境变量变更。

## Open Questions

无。设计决策已在 propose 前逐项确认。
