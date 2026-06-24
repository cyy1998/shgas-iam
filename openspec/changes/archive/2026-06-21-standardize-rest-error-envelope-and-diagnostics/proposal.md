## Why

当前 REST 错误响应存在两个明显断点：Hono/OpenAPI 请求校验失败返回 `{ success, error }`，与通用 `{ code, data, message }` envelope 不一致；未知异常响应过于笼统，客户端无法直接关联后端日志定位问题。与此同时，OpenAPI route 文档普遍缺少统一错误响应 schema，调用方无法从文档中稳定理解错误结构。

本变更将这些入口收敛到同一套 REST 错误响应契约，并增强未知异常的 requestId 关联和结构化日志诊断能力。

## What Changes

- 新增通用校验失败错误码 `COMMON.VALIDATION_FAILED`。
- 将 REST 请求校验失败响应改为标准 envelope，并在 `data` 中返回 `requestId` 和原始 validation issues。
- 扩展错误响应 helper，使错误 envelope 可以携带诊断 data，同时保持现有调用兼容。
- 未知异常响应继续隐藏内部细节，但返回 `requestId`，并将 HTTP status 修正为 `500`。
- 未知异常结构化日志增加 `traceId`、`method`、`path`、`route` 和原始 `err`，保留 `source`、`errorName`、`errorMessage` 等摘要字段。
- `HTTPException` 响应继续保留现有业务码和 message 行为，补充 `requestId`，不新增状态到业务错误码的映射。
- 为现有 REST/Hono route 的 OpenAPI 文档统一声明 common error responses：`400`、`401`、`403`、`404`、`409`、`422`、`500`。
- 不改变 tRPC runtime error shape，不改变 CAP challenge/redeem 的成功响应结构。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `api-error-handling`: 标准化 REST 请求校验失败 envelope、未知异常诊断响应和日志字段，并要求 REST OpenAPI route 文档声明统一错误响应。

## Impact

- 影响共享错误码：`packages/contracts/src/enums/api-error-code.ts`。
- 影响 REST envelope helper、Hono OpenAPI validation hook、集中错误处理 middleware 和相关测试：`packages/api-core/src/http/response.ts`、`packages/api-core/src/core/openapi/default-hook.ts`、`packages/api-core/src/middlewares/error-handler.ts`。
- 影响 REST route OpenAPI 文档：`apps/api/src/routes/**/*.routes.ts` 和 `apps/admin-api/src/routes/admin/**/*.routes.ts`。
- 前端 REST 请求工具可继续按 `{ code, data, message }` 解析错误；未知异常可通过响应中的 `requestId` 与 Grafana/Loki 系统日志关联。
- tRPC 仍使用当前 tRPC 标准错误结构和 `serviceCode/serviceMessage/httpStatus` formatter fields。
