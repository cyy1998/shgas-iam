## Why

`packages/api-core` 的集中错误处理目前对未预期异常使用 `console.error`，这会绕开应用已经配置好的 pino 日志管线，导致日志格式、上下文和生产环境输出策略不一致。现在两个后端应用都已经通过 `createApp` 传入 pino logger，具备以小范围改动统一错误日志记录的条件。

## What Changes

- 将 API 未预期异常日志从 `console.error` 改为 pino 结构化日志。
- 错误处理应优先使用 `hono-pino` 注入到当前请求 `Context` 的 logger，以保留请求上下文。
- 当请求 logger 不可用时，应回退到 `createApp` 注入的 app-level logger。
- 保留现有 API 错误响应语义：业务错误、`HTTPException` 和未知异常的响应 envelope 与 HTTP status 不因日志实现改变而变化。
- 调整相关测试，验证未知异常通过 pino logger 记录错误对象和来源位置。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `api-error-handling`: 集中 API 错误处理在记录未预期异常时应使用应用配置的 pino 日志管线，而不是直接调用 `console.error`。

## Impact

- 影响 `packages/api-core/src/middlewares/error-handler.ts` 的错误处理器形态和日志行为。
- 影响 `packages/api-core/src/core/create-app.ts` 中 `app.onError` 的注册方式。
- 影响 `packages/api-core/src/middlewares/__tests__/error-handler.test.ts` 及可能引用 `errorHandler` 的测试初始化。
- 不改变公开 REST/tRPC API 响应合同，不引入新的运行时依赖。
