## Why

部分客户端非法请求仍通过裸 `CustomError` 表达，导致全局错误处理按默认 `COMMON.INTERNAL_ERROR` 和 HTTP `500` 返回。调用方和日志因此无法区分真实服务端异常与可预期的请求错误，前端也难以稳定按错误码处理。

现有规范已经要求稳定业务失败优先使用具名错误类，本次变更把遗留的客户端输入/前置条件失败收敛为新增错误类型，避免继续依赖 `CustomError` 默认值。

## What Changes

- 新增通用客户端请求错误类型，用于表达可预期的 HTTP `400` 请求错误。
- 为现有裸 `CustomError` 调用点按语义迁移到具名错误类型或保留为真实内部错误。
- 保持 REST 与 tRPC 现有 envelope/formatter 结构不变，只修正错误 code、HTTP status、日志事件分类。
- 不修改 `CustomError` 的默认行为，避免误伤真正内部错误。
- 不改变 Hono `HTTPException` 的现有适配契约，坏 JSON 等底层 parser 错误仍按当前规范处理。

## Capabilities

### New Capabilities

### Modified Capabilities

- `api-error-handling`: 增加客户端请求错误的具名错误类型要求，并要求客户端输入类遗留裸 `CustomError` 不再返回 `500 COMMON.INTERNAL_ERROR`。

## Impact

- `packages/api-core/src/errors/`: 新增通用请求错误类并导出。
- `apps/api`、`apps/admin-api`: 迁移客户端输入、认证入口、业务前置条件等遗留裸 `CustomError`。
- `packages/domain`: 如某些错误属于稳定业务领域语义，按现有规范放入对应 domain error。
- REST/tRPC 错误处理：复用现有 `isApiRuntimeError`、`createErrorHandler` 和 tRPC mapper，不改响应结构。
- 测试：补充错误类、REST handler、相关服务/中间件断言，覆盖 HTTP status 与 `ApiErrorCode`。
