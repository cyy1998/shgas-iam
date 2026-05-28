## Why

当前后端错误体系同时混用 `CustomError`、`AuthzError`、散落在 app 内的业务错误类和裸 `new CustomError(...)`，导致 Hono、tRPC、前端响应处理和测试对错误语义的判断不一致。与此同时，现有 `ServiceStatusCode` 将 HTTP 状态码和业务错误码混在同一个数字字段中，已经影响错误分类、迁移和后续扩展。

## What Changes

- 将可复用、可迁移的后端业务错误集中定义到 `packages/api-core/src/errors/` 并统一导出。
- 让 `AuthzError` 继承 `CustomError`，保留独立的 HTTP 状态表达，统一 Hono 和 tRPC 的错误识别路径。
- 为当前高频裸 `CustomError` 场景补充独立错误类，包括认证登录、SSO/client、组织、岗位、用户、任职、权限委托、人机校验和外部集成相关错误。
- 保留 `packages/contracts` 中的 `LoginCredentialError` 作为底层凭证解析错误，并在 API 层转换为 `api-core/errors` 中的 `InvalidLoginCredentialError`。
- 重新设计错误码为字符串业务码，并将业务错误码与 HTTP status 分离。
- 兼容现有响应 envelope，迁移期间避免一次性破坏前端对旧数字 code 的判断。
- **BREAKING**: 完成兼容期后，API 响应中的业务 `code` 将从数字错误码迁移为字符串错误码。

## Capabilities

### New Capabilities

- `api-error-handling`: 统一后端 API 错误类、业务错误码、HTTP 状态映射以及跨 Hono/tRPC 的错误响应契约。

### Modified Capabilities

- `authentication-sessions`: 登录凭证、认证和会话相关错误将使用新的集中错误类与字符串业务码。
- `authorization-model`: 授权错误将继承统一错误基类并保留 HTTP 状态语义。
- `human-verification`: 人机校验错误将迁移为集中错误类并使用新的业务错误码。
- `organization-management`: 组织不存在、组织编码重复、组织删除冲突等错误将使用集中错误类。
- `position-management`: 岗位不存在、岗位编码重复、岗位删除冲突等错误将使用集中错误类。
- `employment-management`: 任职不存在、任职不可编辑、任职重复等错误将使用集中错误类。
- `client-registry`: client 不存在、client 编码重复和 SSO client 校验错误将使用集中错误类。
- `privilege-delegation`: 权限委托不存在、已结束、被委托主体不存在和权限冲突错误将使用集中错误类。

## Impact

- 影响 `packages/api-core/src/errors/`、`packages/api-core/src/middlewares/error-handler.ts`、`packages/api-core/src/trpc/`、`packages/contracts/src/enums/service.status.ts`。
- 影响 `apps/api` 与 `apps/admin-api` 中直接抛出 `CustomError` 或 `AuthzError` 的 service、route handler、repository。
- 影响前端 `apps/admin`、`apps/sso` 对响应 `code` 的判断逻辑，尤其是未登录、维护、人机校验等分支。
- 需要更新或新增错误处理、登录凭证、人机校验、认证授权、业务 service 的单元测试。
