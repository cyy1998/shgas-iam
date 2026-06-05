## 1. 错误处理器重构

- [x] 1.1 检查 `errorHandler` 的所有引用点，确认需要更新的测试和 app 装配位置。
- [x] 1.2 将 `packages/api-core/src/middlewares/error-handler.ts` 改为支持 app-level logger 注入的错误处理器工厂。
- [x] 1.3 在未知异常分支中优先读取 Hono `Context` 上的请求 logger，并在不可用时回退到 app-level logger。
- [x] 1.4 将未知异常日志改为 pino-compatible 结构化日志，包含原始 `err` 和 `source` 来源位置。
- [x] 1.5 保持 API runtime error、`HTTPException` 和未知异常的响应 envelope 与 HTTP status 行为不变。

## 2. 应用装配与类型

- [x] 2.1 更新 `packages/api-core/src/core/create-app.ts`，使用注入的 app logger 创建并注册错误处理器。
- [x] 2.2 评估 `BaseVariables.logger` 与 `hono-pino` 请求 logger 的类型关系，必要时使用最小 logger 接口避免类型过度耦合。
- [x] 2.3 决定是否调整 `requestId()` 与 `pinoLogger()` 的注册顺序；若调整，同步覆盖请求上下文验证。

## 3. 测试与验证

- [x] 3.1 更新 `packages/api-core/src/middlewares/__tests__/error-handler.test.ts`，用 mock pino logger 替代 `console.error` spy。
- [x] 3.2 新增或调整测试，验证请求 logger 可用时优先记录未知异常。
- [x] 3.3 新增或调整测试，验证请求 logger 不可用时使用 app-level logger 兜底且不调用 `console.error`。
- [x] 3.4 运行 `pnpm --filter @iam/api-core test`。
- [x] 3.5 运行 `pnpm --filter @iam/api-core typecheck`。
- [x] 3.6 若 `createApp` 类型或 middleware 顺序有调整，运行 `pnpm --filter @iam/api typecheck` 和 `pnpm --filter @iam/admin-api typecheck`。
