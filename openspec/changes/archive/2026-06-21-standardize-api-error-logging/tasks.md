## 1. Core Logging Policy

- [x] 1.1 在 `@iam/api-core/logger` 或相邻 API-core 模块中新增/整理 API 错误事件常量，确保包含 `api.error.handled` 与 `api.error.unhandled`
- [x] 1.2 实现共享 API 错误日志字段构建器，统一生成 REST/tRPC 公共字段、`surface`、`statusCode`、`errorCode`、`errorName`、`errorMessage`、`err` 附加规则
- [x] 1.3 实现共享错误日志等级策略，覆盖普通 4xx、普通 401、403、`/internal` 认证失败、已知 5xx 和未知异常
- [x] 1.4 实现 validation issue 摘要 helper，仅输出 `issueCount` 与 `issuePaths`
- [x] 1.5 调整后端 `http.request.completed` request log 等级策略，使 Hono 与 OIDC request log 始终使用 `info`

## 2. REST Error Handling

- [x] 2.1 更新 `createErrorHandler`，在处理 `ApiRuntimeError` 和 domain business error 时记录 `api.error.handled`，并保持现有响应 envelope 与 HTTP status
- [x] 2.2 更新 `createErrorHandler` 的 `HTTPException` 分支，记录 `api.error.handled`，并保持现有 HTTPException 响应适配行为
- [x] 2.3 更新未知异常日志，确保使用 `api.error.unhandled`、`surface = "rest"`、`statusCode = 500`，并继续包含 `err`、`source`、`errorName` 和 `errorMessage`
- [x] 2.4 更新 OpenAPI `defaultHook`，在 validation failure 返回 422 envelope 的同时记录 sanitized `api.error.handled` 摘要日志

## 3. tRPC Error Logging

- [x] 3.1 为 admin-api `/rpc` 的 `fetchRequestHandler` 增加 `onError` 日志入口
- [x] 3.2 在 tRPC 错误日志中识别 API runtime error cause，已知错误记录 `api.error.handled`，未知错误记录 `api.error.unhandled`
- [x] 3.3 确保 tRPC 错误日志包含 `surface = "trpc"`、procedure path 和错误摘要字段，并保持现有 formatter/前端消费字段不变

## 4. OIDC Provider Alignment

- [x] 4.1 对齐 `oidc-provider` 的 `http.request.completed` 等级行为，使 request log 始终为 `info`
- [x] 4.2 保留 `oidc.provider.*` 错误事件名，并确认现有 OIDC 错误事件继续包含稳定错误摘要字段和敏感字段脱敏

## 5. Tests

- [x] 5.1 补充 `@iam/api-core` logger 策略单元测试，覆盖 request log 等级、API 错误日志等级、`err` 附加规则和 validation issue 摘要
- [x] 5.2 更新 `@iam/api-core` error-handler 测试，覆盖已知 REST 错误、HTTPException、未知异常的日志事件和响应行为
- [x] 5.3 更新 OpenAPI `defaultHook` 测试，覆盖 422 响应和 sanitized validation summary 日志
- [x] 5.4 补充或更新 admin-api tRPC route/adapter 测试，覆盖已知业务错误与未知错误日志，同时验证 tRPC response shape 不变
- [x] 5.5 更新 `oidc-provider` HTTP logging 测试，验证 4xx/5xx request log 仍输出 `http.request.completed` 但等级为 `info`

## 6. Verification

- [x] 6.1 运行 `pnpm --filter @iam/api-core test` 和 `pnpm --filter @iam/api-core typecheck`
- [x] 6.2 运行 `pnpm --filter @iam/admin-api test` 和 `pnpm --filter @iam/admin-api typecheck`
- [x] 6.3 运行 `pnpm --filter @iam/api typecheck`
- [x] 6.4 运行 `pnpm --filter @iam/oidc-provider test` 和 `pnpm --filter @iam/oidc-provider typecheck`
- [x] 6.5 用 `rg` 检查新增日志路径没有记录 request body、response body、完整 headers、authorization、cookie、token、secret、password 或 verification code 明文
