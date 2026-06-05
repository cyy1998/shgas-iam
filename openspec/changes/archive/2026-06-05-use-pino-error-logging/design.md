## Context

`packages/api-core` 负责创建 Hono 应用、注册 `hono-pino` 请求日志中间件，并集中处理 API 错误。当前 `createApp` 已从 `apps/api` 和 `apps/admin-api` 接收 app-level pino logger，并将它传给 `pinoLogger({ pino: options.logger })`；但 `app.onError(errorHandler)` 注册的是一个无依赖错误处理函数，未知异常只能通过 `console.error` 输出。

这造成两个问题：

- 未知异常日志绕过 pino transport，生产环境和开发环境格式不一致。
- 错误日志缺少 `hono-pino` 请求 logger 已经绑定的请求上下文，排查时不易和请求日志关联。

## Goals / Non-Goals

**Goals:**

- 让集中错误处理对未知异常使用 pino 结构化日志。
- 优先使用当前请求上下文中的 `hono-pino` logger，以保留 request bindings。
- 在请求 logger 不可用时使用 `createApp` 注入的 app-level logger 兜底。
- 保持现有错误响应 envelope、业务错误码和 HTTP status 语义不变。
- 用聚焦测试验证日志行为和响应行为。

**Non-Goals:**

- 不重构 API 错误类体系。
- 不改变 REST 或 tRPC 的错误响应合同。
- 不引入新的日志依赖或新的全局 logger 单例。
- 不扩大到 env validation、singleton lifecycle、脚本等允许使用 `console.error` 的场景。

## Decisions

### 使用错误处理器工厂注入 app-level logger

将错误处理器设计为接收 app-level pino logger 的工厂，例如 `createErrorHandler(appLogger)`，再由 `createApp` 注册到 `app.onError`。

理由：

- `api-core` 不需要反向 import `@api/lib/logger` 或 `@admin-api/lib/logger`，保持共享包与具体应用解耦。
- `createApp` 已经有 `options.logger`，改动集中且不需要新增配置入口。
- 测试可以直接传入 mock logger，避免 spy `console.error`。

备选方案：

- 在 `error-handler.ts` 里创建新的 pino logger。这个方案会复制日志配置，破坏应用级 transport 和 log level 管理。
- 只从 `Context` 读取 `c.get("logger")`。这个方案在 middleware 顺序变化、早期异常或独立测试场景下缺少兜底。

### 请求 logger 优先，app logger 兜底

未知异常日志应优先使用 `c.get("logger")` 返回的 `hono-pino` 请求 logger；如果不可用，再使用注入的 app-level logger。

理由：

- `hono-pino` 请求 logger 能携带请求 path、method、headers、request id 等上下文。
- app-level logger 可覆盖没有请求 logger 的异常路径，避免重新落回 `console.error`。

实现时需要注意 `BaseVariables.logger` 当前声明为 pino `Logger`，而 `hono-pino` 的上下文 logger 类型是 `PinoLogger`。可通过兼容的最小 logger 接口表达错误处理器需要的能力，例如只要求 `error(...)` 方法，避免把错误处理器绑定到完整 pino 类型。

### 保留独立未知异常日志，不只依赖响应日志

`hono-pino` 会在请求结束时根据 `c.error` 输出响应日志，但未知异常仍需要错误处理器显式记录一条结构化错误日志。

理由：

- 响应日志主要描述请求结束状态，未必包含完整 `Error` 对象和 stack。
- 错误处理器可以保留现有 `source` 来源位置提取逻辑，帮助定位抛错文件。

建议日志字段：

- `err`: 原始 `Error` 对象，交给 pino 序列化。
- `source`: `getErrorSourceLocation(err)` 的结果。

日志消息建议使用稳定英文短语，例如 `unhandled request error`，便于检索。

### 可选调整 requestId 与 pinoLogger 顺序

当前 `createApp` 先注册 `pinoLogger`，后注册 `requestId()`。如果实现时希望 `hono-pino` 自动复用 Hono 的 `requestId`，可以将 `requestId()` 放在 `pinoLogger` 之前。

这不是本变更的核心要求；若调整，应通过现有测试或新增测试确认请求上下文仍正常可用。

## Risks / Trade-offs

- [Risk] `errorHandler` 从直接导出的函数变成工厂后，现有测试或调用点需要更新。→ Mitigation: 保留一个默认导出或命名导出策略时统一更新 `api-core` 内部测试，并用 `rg` 检查所有引用点。
- [Risk] `hono-pino` 的 `PinoLogger` 与 pino `Logger` 类型不完全一致。→ Mitigation: 在错误处理器内部使用最小 logger 接口，只依赖 `error` 方法。
- [Risk] 同一个未知异常可能产生一条错误日志和一条请求响应日志。→ Mitigation: 两者语义不同，错误日志保存异常对象，响应日志保存 HTTP 请求摘要；测试只要求错误处理器记录专门异常日志。
- [Risk] 调整 middleware 顺序可能影响请求日志字段。→ Mitigation: 若实施 requestId 顺序调整，增加或更新测试覆盖 request id 绑定；否则保持顺序不变以缩小范围。

## Migration Plan

1. 修改 `packages/api-core` 错误处理器注册方式。
2. 更新 `api-core` 错误处理测试，从 `console.error` spy 改为 pino logger mock。
3. 运行 `pnpm --filter @iam/api-core test` 和 `pnpm --filter @iam/api-core typecheck`。
4. 若涉及 `createApp` 类型或 middleware 顺序，补充运行 `pnpm --filter @iam/api typecheck` 与 `pnpm --filter @iam/admin-api typecheck`。

回滚时可恢复 `app.onError(errorHandler)` 和原错误处理函数形态；由于不改变 API 响应合同，回滚无需数据迁移。

## Open Questions

- 是否在同一实现中调整 `requestId()` 与 `pinoLogger()` 的注册顺序，还是先只替换未知异常日志输出？
