## Why

当前 `api` 与 `admin-api` 各自维护几乎相同的 UnitOfWork 基础设施，且 `afterCommit` 在映射给服务时被裁剪，导致缓存同步、OIDC invalidation、token revoke 等事务后副作用散落在 service 方法的事务外手写执行。该变更需要统一 UoW 基础设施，并明确提交后副作用的 required 与 best-effort 语义，避免后续继续复制不一致的事务后行为。

## What Changes

- 将通用 UnitOfWork 与 mapped UnitOfWork 能力下沉到 `@iam/api-core/uow`，由后端 app composition root 注入 app-local tx ports。
- 将 `afterCommit` 暴露给 mapped service transaction context，并提供 `required` 与 `bestEffort` 两种显式注册方式。
- 统一 after-commit 执行、日志和错误语义：required 失败影响请求结果但不回滚已提交 DB 事务，best-effort 失败只记录结构化日志。
- 迁移 admin-api 中事务后 client cache、OIDC client invalidation、user token revoke 等副作用注册点，使其靠近对应 DB mutation。
- 提供共享测试 fake，使 service tests 能覆盖 after-commit 注册与执行语义。
- 不引入 durable outbox/retry worker，不改变 reset password token 策略，不将纯 Redis session 清理强行纳入 UoW。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `backend-functional-di`: 修改 UnitOfWork 与 afterCommit 契约，要求共享 UoW 支持 mapped transaction context、显式 required/best-effort afterCommit 副作用、统一日志与测试 fake。

## Impact

- 影响 `packages/api-core` 新增 UoW 基础设施与 package export。
- 影响 `apps/api`、`apps/admin-api` composition tx/services/routes 中的 UoW 引用与 mapped UoW 辅助逻辑。
- 影响 `apps/admin-api` client/user service 的事务后副作用注册方式与相关 service port 类型。
- 影响 backend service 单元测试 fake 与相关测试断言。
- 不改变外部 REST/tRPC API 路径、请求/响应 DTO 或数据库 schema。
