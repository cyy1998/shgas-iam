## Context

后端 REST 应用统一使用 Hono/OpenAPI route、`createRouter` 的 `defaultHook`、以及 `createErrorHandler` 处理运行时错误。成功响应和业务错误已经基本使用 `{ code, data, message }` envelope，但请求校验失败仍返回 `{ success, error }`，导致前端 REST 请求工具无法稳定读取 `code/message/data`。

未知异常目前会写入结构化日志，但客户端只能看到泛化的内部错误响应，缺少可直接交给管理员排查的 requestId。同时未知异常响应没有显式 HTTP `500`，容易让网关、调用方和 request completed 日志误判为成功。

OpenAPI route 文档普遍只声明成功响应，缺少统一错误 envelope schema。此次变更需要同时收敛运行时响应、诊断日志和 REST OpenAPI 文档。

## Goals / Non-Goals

**Goals:**

- REST/Hono 请求校验失败 SHALL 使用标准 `{ code, data, message }` envelope。
- 未知异常响应 SHALL 隐藏内部细节，但返回 requestId 以便关联日志。
- 未知异常 SHALL 记录足够定位的结构化日志字段，包括原始错误对象。
- 未知异常 HTTP status SHALL 明确为 `500`。
- REST OpenAPI route 文档 SHALL 统一声明 common error responses。
- 现有业务错误响应 SHALL 保持外部语义稳定。

**Non-Goals:**

- 不改变 tRPC runtime error shape，不把 tRPC 错误改成 REST envelope。
- 不改变 CAP challenge/redeem 的成功响应结构。
- 不在响应体中暴露未知异常的 debug 信息、源码路径或 stack。
- 不重新精确审计每条 route 的全部业务错误状态码。
- 不调整 `ResponseCode = number | string` 的整体类型边界。

## Decisions

### 1. Validation failure 使用独立错误码

新增 `ApiErrorCode.ValidationFailed = "COMMON.VALIDATION_FAILED"`，放在 common error codes 区域。

替代方案是复用 `COMMON.BAD_REQUEST`。本设计选择独立错误码，因为 OpenAPI/Zod schema 校验失败是框架入口错误，与业务层 `BadRequest` 的来源和处理方式不同，独立错误码更利于前端、日志和监控识别。

### 2. Validation failure 响应 envelope

`defaultHook` 在 `result.success === false` 时返回：

```json
{
  "code": "COMMON.VALIDATION_FAILED",
  "data": {
    "requestId": "req-xxx",
    "issues": []
  },
  "message": "请求参数不合法"
}
```

HTTP status 继续使用 `422`。`issues` 原样来自 `result.error.issues`，不做裁剪；`requestId` 在 schema 中标记为 optional，以兼容未经过完整 `createApp` 中间件链的测试或特殊用法。

validation failure 不新增专门 error/warn 日志。请求完成日志的 `422`、响应体中的 `requestId` 和 `issues` 已足够支撑排查，避免把高频客户端输入错误写成日志噪声。

### 3. 扩展 `resp.fail`

将 `resp.fail` 扩展为：

```ts
fail(code, message = "fail", data = null)
```

现有调用保持兼容，新 validation failure、`HTTPException` 和未知异常统一通过 `resp.fail(...)` 构造错误 envelope。相比新增 `error()` helper，这个方式更贴近现有项目习惯，diff 更小。

### 4. 未知异常响应只暴露 requestId

非 API runtime error 且非 `HTTPException` 的未知异常返回：

```json
{
  "code": "COMMON.INTERNAL_ERROR",
  "data": {
    "requestId": "req-xxx"
  },
  "message": "服务器内部错误，请联系管理员并提供 requestId"
}
```

如果特殊路径下无法取得 requestId，响应 `data` 可以为空对象或不含 `requestId`，message 使用 `服务器内部错误`。生产和非生产环境保持一致，不在响应体暴露 `errorName`、`errorMessage`、`source` 或 `stack`。

HTTP status 明确返回 `500`，使网关、监控、请求日志等级和调用方重试逻辑能够正确识别服务端异常。

### 5. 未知异常日志增强

未知异常继续优先使用 request logger，缺失时回退到 app logger。日志字段保留现有摘要字段，并增加请求上下文和原始错误对象：

```ts
{
  event: SystemLogEvent.ApiErrorUnhandled,
  requestId,
  traceId,
  method,
  path,
  route,
  source,
  errorName,
  errorMessage,
  err,
}
```

`source` 继续从 stack 中提取最佳位置；`err` 交给 Pino 序列化以保留 stack。扁平的 `errorName/errorMessage/source` 仍保留，方便 Grafana/Loki 表格和聚合展示。

### 6. `HTTPException` 保守兼容

`HTTPException` 继续使用 `COMMON.INTERNAL_ERROR` 和 `err.message`，HTTP status 继续尊重 `err.status`，但响应 `data` 补充 optional `requestId`。

本次不做 `HTTPException.status` 到业务错误码的映射。标准业务失败应继续通过 `CustomError` 或 domain business error 表达；`HTTPException` 作为底层逃逸口先保持行为兼容。

### 7. 业务错误不塞 requestId

`CustomError` 和 domain business error 的 REST 响应保持：

```json
{
  "code": "USER.NOT_FOUND",
  "data": null,
  "message": "用户不存在"
}
```

不统一把 requestId 放进业务错误 `data`。这样可以避免污染业务错误 data 语义，也避免影响现有前端分支。

### 8. OpenAPI common error responses

新增共享 OpenAPI error response schema/helper，并在所有现有 REST/Hono route 中声明 common error responses：

```text
400, 401, 403, 404, 409, 422, 500
```

schema 分三类：

- `400/401/403/404/409`: 标准错误 envelope，`data: null`
- `422`: validation failure envelope，`data: { requestId?, issues }`
- `500`: internal error envelope，`data: { requestId? }`

validation issue schema 使用常用字段并允许 passthrough：

```ts
z.object({
  code: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
}).passthrough()
```

所有 REST route 都应覆盖，包括 SSO redirect route 和 CAP 协议型成功 route。成功响应可以是 redirect 或外部协议结构，但错误响应仍来自统一 Hono/OpenAPI hook 和 error handler。

## Risks / Trade-offs

- [Risk] 原样暴露 Zod issues 可能包含较多 schema 细节。→ Mitigation: 当前按内部 IAM 系统开发效率优先；若未来暴露给更广泛第三方，可单独收敛为 sanitized mapper。
- [Risk] common error responses 不是每条 route 的精准错误全集。→ Mitigation: 本次目标是统一错误 envelope 文档；后续可按业务模块逐步补充精确状态码或描述。
- [Risk] 未知异常响应从 HTTP 200 修正为 500 可能影响依赖错误 body 判断的调用方。→ Mitigation: 这是正确的 transport 语义，应通过测试和发布说明明确；REST error body 仍保持标准 envelope。
- [Risk] `HTTPException` 在 400/404 等状态下文档可能显示 `data: null`，运行时可能带 `requestId`。→ Mitigation: `HTTPException` 不是标准业务错误路径；文档优先表达标准业务错误 envelope，运行时额外字段不破坏客户端。

## Migration Plan

1. 新增错误码和 response/OpenAPI helper。
2. 更新 `defaultHook`、`createErrorHandler` 和相关单元测试。
3. 为现有 REST route 增加 common error responses。
4. 运行 `@iam/contracts`、`@iam/api-core`、`@iam/api`、`@iam/admin-api` 的 focused typecheck/test。
5. 若发现调用方依赖未知异常 HTTP 200，按正确 500 语义更新调用方或测试。

## Open Questions

无。当前 design 按本次讨论决策执行。
