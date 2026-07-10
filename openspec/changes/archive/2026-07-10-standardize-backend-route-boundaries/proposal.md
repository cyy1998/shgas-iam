## Why

现有函数工厂 DI 已把生产依赖集中到 composition root，但少数 route handler/adapter 仍直接编排 UnitOfWork、repository、审计和通知副作用，或绕过 service 直接查询 repository。这样的例外让 HTTP/tRPC 适配层承担业务用例职责，也使现有 architecture guard 无法完整阻止边界回退。

## What Changes

- 明确 REST handler 与 REST/tRPC adapter 只负责协议解析、上下文提取、service/use-case 调用、VO 映射和响应适配，不直接依赖 repository 或 UnitOfWork，也不编排由 transaction 结果驱动的跨模块业务副作用。
- 将 API 内部供应商联系人注册从 route handler 提炼为独立 Application Use Case，由其拥有 transaction、profile dirty、审计和短信编排。
- 将 admin position 查询统一收口到 position service，移除 adapter 对 repository 的直接依赖。
- 用目录、文件后缀和 factory/type 命名显式区分跨领域 Application Use Case、领域对齐的 app-local Application Service，以及 `packages/domain` 中的 pure domain logic。
- 扩展 API 与 admin-api architecture tests，阻止 route 生产代码重新依赖 repository 或 UnitOfWork，并保留必要的纯 schema、DTO、error、audit context/helper 静态导入。
- 按五个可验证迁移批次推进现存 route 边界收敛，并保持所有外部契约和业务行为不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `backend-functional-di`: 增加 route adapter 通过 service/use-case facade 访问持久化、跨领域 Application Use Case 与领域对齐 Application Service 的依赖方向、业务 transaction 与其结果驱动的副作用所有权，以及 architecture guard 覆盖 route-to-repository/UnitOfWork 依赖的要求。
- `backend-structure-conventions`: 明确 handler/adapter 的协议职责、use-case/service/domain logic 的目录与命名、允许的纯定义依赖，以及结构迁移期间必须保持的 HTTP/tRPC、审计、通知和 transaction 语义。

## Impact

- 影响 `apps/api/src/routes/internal/user`、新增的 `apps/api/src/use-cases/internal/register-purveyor-contact` 与对应 API composition wiring。
- 影响 `apps/admin-api/src/routes/admin/position`、position service 与 `apps/admin-api/src/composition` wiring。
- 影响两个后端 app 的 architecture tests、focused handler/adapter/service tests 和相关类型。
- 影响后端架构与实现约定中的模块分类；现有 `UserService`、`RoleService` 继续作为领域对齐 Application Service，不在本次批量移动或重命名。
- 不改变 REST path、HTTP method、OpenAPI schema、tRPC router shape、认证授权、数据库 schema、Redis 协议或对外响应契约；不新增 workspace dependency。
