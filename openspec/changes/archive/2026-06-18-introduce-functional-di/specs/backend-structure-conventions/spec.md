## MODIFIED Requirements

### Requirement: 后端入口应只负责应用装配
每个后端 app 的 `src/app.ts` SHALL 只负责读取 app config、env、logger，调用 app-local composition root materialize routes 和 middlewares，并调用 `createApp`。生产 runtime singleton、repository、service、route 和 middleware 的创建 MUST 放在 app-local `src/composition` 或其调用的专用 factory module 中，而不是内联在 `src/app.ts`。

#### Scenario: app 入口装配 logger
- **WHEN** 维护者查看 `apps/api/src/app.ts` 或 `apps/admin-api/src/app.ts`
- **THEN** 文件 MUST 从 app-local logger module import `logger`，并把它作为 `createApp` options 传入

#### Scenario: app 入口调用 composition root
- **WHEN** 维护者查看 `apps/api/src/app.ts` 或 `apps/admin-api/src/app.ts`
- **THEN** 文件 SHALL call app-local composition helper to materialize routes and middlewares
- **AND** 文件 MUST NOT directly instantiate service、repository、Redis、DB 或 integration client

#### Scenario: app-local logger singleton
- **WHEN** 维护者需要在任一后端 app 中使用 logger
- **THEN** 该 app MUST 提供 `src/lib/logger/index.ts`，并由该 module 负责调用 `createLogger`

### Requirement: tier middleware 应保持薄装配层
后端 tier-level `_middleware.ts` SHALL 只负责提供 middleware factory 或组合 middleware list。需要跨多个 tier 复用的 authentication handler MUST 通过 app composition root 注入的 runtime deps 创建，而不是在 `_middleware.ts` 中静态绑定 Redis 或 service singleton。

#### Scenario: admin REST 与 tRPC 共享认证 handler
- **WHEN** `apps/admin-api` 的 `admin` tier 和 `rpc` tier 使用相同 admin authentication 配置
- **THEN** 两个 tier 的 `_middleware.ts` MUST use the same app-level middleware factory or injected authentication handler

#### Scenario: middleware 配置来源单一
- **WHEN** admin authentication 需要读取 Redis、user schema、allowed client codes 或 admin role codes
- **THEN** 这些配置 MUST be provided by app composition root to the middleware factory
- **AND** `_middleware.ts` MUST NOT import app-local Redis singleton directly

## ADDED Requirements

### Requirement: backend route modules 应通过 factory 装配 handlers
后端 route index module SHALL 通过 factory 接收已绑定 handlers/adapters，并返回 Hono router。route definition、schema 和 type 文件可继续静态导入纯定义。

#### Scenario: REST route factory
- **WHEN** REST-only route module registers OpenAPI handlers
- **THEN** `*.index.ts` SHALL expose a router factory
- **AND** the factory SHALL receive handler deps or materialized handlers before calling `.openapi(...)`

#### Scenario: Admin REST and tRPC adapter factory
- **WHEN** admin route module exposes both REST handlers and tRPC procedures
- **THEN** adapter operations SHALL be created through a factory with injected service facades
- **AND** REST and tRPC exports SHALL use the same injected operation definitions

### Requirement: 后端结构迁移不得改变外部契约
函数工厂 DI 迁移 SHALL preserve existing REST paths, OpenAPI route definitions, tRPC router shape, authentication behavior, audit semantics, database schema, and service/repository business logic.

#### Scenario: 同步后接口契约保持不变
- **WHEN** 实现本变更后运行后端 typecheck 或 focused tests
- **THEN** 现有 REST route definitions 和 tRPC router exports MUST remain compatible with existing imports and consumers

#### Scenario: service 与 repository 不强行同形
- **WHEN** `apps/api` 与 `apps/admin-api` 的同名 domain service 或 repository 存在不同管理职责
- **THEN** 本变更 MUST NOT merge those modules or move business behavior across app boundaries
