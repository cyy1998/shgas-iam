## Why

当前 `packages/api-core/src/errors/` 同时承载 HTTP/Hono/tRPC 基础设施错误和组织、用户、岗位、任职、客户端等业务领域错误，导致 `@iam/api-core` 随业务规则增长而膨胀，包边界逐渐模糊。

仓库已经存在 `@iam/domain` 并被两个后端用于共享领域 schema 与 type；将稳定业务错误收拢到 domain 层，可以让错误定义与领域语义放在同一边界内，同时保持 `@iam/api-core` 专注于 API 基础设施和错误响应适配。

## What Changes

- 新增 domain 业务错误归属规则：稳定、跨 app 复用的业务错误类 SHALL 定义并导出自 `@iam/domain/<domain>`。
- 调整 `api-core` 错误处理规则：API error handler SHALL 支持处理 domain 业务错误，而不是只依赖 `CustomError instanceof`。
- 保留 `ApiErrorCode` 在 `@iam/contracts` 作为前后端共享协议码，不把协议码迁入 domain。
- 保留鉴权、维护模式、HTTP response envelope、Hono/tRPC 适配等基础设施错误与适配逻辑在 `@iam/api-core`。
- 全面迁移现有业务错误导入路径，迁移后不在 `@iam/api-core/errors` 保留已迁入 domain 的业务错误兼容导出。
- 不改变现有 REST/tRPC 响应 envelope、业务 error code、HTTP status、默认错误消息和前端分支行为。

## Capabilities

### New Capabilities
- `domain-business-errors`: 定义 `@iam/domain` 中稳定业务错误类的归属、导出、结构和跨 app 消费规则。

### Modified Capabilities
- `api-error-handling`: 调整 API 错误处理契约，使 `api-core` 负责序列化和适配 API 错误，同时不再作为稳定业务错误类的长期归属地。

## Impact

- 影响 `packages/domain/src/<domain>/`：新增或导出 user、organization、position、employment、client、privilege 等领域错误。
- 影响 `packages/api-core/src/errors/` 与 error handler/tRPC error mapper：保留基础设施错误，支持 domain error 结构化识别，并移除已迁入 domain 的业务错误定义与导出。
- 影响 `apps/api` 与 `apps/admin-api` 的 service、route、test import：业务错误导入路径从 `@iam/api-core/errors/...` 全面迁移到 `@iam/domain/<domain>`。
- 影响 package dependencies：需要避免 `@iam/domain` 依赖 `@iam/api-core` 造成反向边界；如需共享基类或结构，应选择 contract-level 结构或 duck-typed API error shape。
- 对外 API 行为不应改变：客户端继续接收相同 `code`、`message`、HTTP status 和 response envelope。
