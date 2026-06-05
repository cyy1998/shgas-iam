# backend-structure-conventions Specification

## Purpose
Capture backend app structure rules that keep app assembly, middleware composition, route naming, and runtime configuration consistent across backend packages.

## Requirements
### Requirement: 后端入口应只负责应用装配
每个后端 app 的 `src/app.ts` SHALL 只负责读取 app config、env、logger、routes 和 middlewares 并调用 `createApp`。横切 singleton 的创建 MUST 放在 app-local `src/lib` 或其他专用 helper module 中，而不是内联在 `src/app.ts`。

#### Scenario: app 入口装配 logger
- **WHEN** 维护者查看 `apps/api/src/app.ts` 或 `apps/admin-api/src/app.ts`
- **THEN** 文件 MUST 从 app-local logger module import `logger`，并把它作为 `createApp` options 传入

#### Scenario: app-local logger singleton
- **WHEN** 维护者需要在任一后端 app 中使用 logger
- **THEN** 该 app MUST 提供 `src/lib/logger/index.ts`，并由该 module 负责调用 `createLogger`

### Requirement: tier middleware 应保持薄装配层
后端 tier-level `_middleware.ts` SHALL 只负责组合 middleware list。需要跨多个 tier 复用的 authentication handler MUST 定义在 app-level middleware helper 中。

#### Scenario: admin REST 与 tRPC 共享认证 handler
- **WHEN** `apps/admin-api` 的 `admin` tier 和 `rpc` tier 使用相同 admin authentication 配置
- **THEN** 两个 tier 的 `_middleware.ts` MUST import 同一个 app-level `adminAuthenticationHandler`

#### Scenario: middleware 配置来源单一
- **WHEN** admin authentication 需要读取 Redis、user schema、allowed client codes 或 admin role codes
- **THEN** 这些配置 MUST 在 app-level authentication helper 中集中传给 `createAdminAuthenticationHandler`

### Requirement: 后端配置文件应声明相同运行时边界
`apps/api` 与 `apps/admin-api` 的 TypeScript 和 ESLint 配置 SHALL 对 Bun runtime type 和 scripts 排除规则保持一致。

#### Scenario: TypeScript 配置包含 Bun runtime type
- **WHEN** 维护者查看任一后端 app 的 `tsconfig.json`
- **THEN** `compilerOptions` MUST include `"types": ["bun"]`

#### Scenario: TypeScript 配置排除 scripts
- **WHEN** 维护者查看任一后端 app 的 `tsconfig.json`
- **THEN** 配置 MUST exclude `scripts`

#### Scenario: ESLint 配置忽略 scripts
- **WHEN** 维护者查看任一后端 app 的 `eslint.config.js`
- **THEN** `ignores` MUST include `"scripts/**"`

### Requirement: route 文件命名应表达协议角色
后端 route 文件命名 SHALL 根据协议角色保持一致：REST-only route 使用 `*.handlers.ts`，REST + tRPC 共享 operation 使用 `*.adapter.ts` 与 `*.trpc.ts`，route type 文件 MUST 使用 `*.type.ts`。

#### Scenario: REST-only route 使用 handlers
- **WHEN** route module 只暴露 REST/OpenAPI handler
- **THEN** handler implementation MUST be named `*.handlers.ts`

#### Scenario: REST 和 tRPC 共享 operation 使用 adapter
- **WHEN** route module 需要从同一 operation 同时生成 REST handler 和 tRPC procedure
- **THEN** shared operation implementation MUST be named `*.adapter.ts` and tRPC export module MUST be named `*.trpc.ts`

#### Scenario: route type 文件使用单数 type 后缀
- **WHEN** route module 定义 route handler 类型或 route-local VO type
- **THEN** 文件名 MUST use `*.type.ts` rather than `*.types.ts`

### Requirement: 结构同步不得改变业务行为
后端结构同步 SHALL preserve existing REST paths, OpenAPI route definitions, tRPC router shape, authentication behavior, audit semantics, database schema, and service/repository business logic.

#### Scenario: 同步后接口契约保持不变
- **WHEN** 实现本变更后运行后端 typecheck 或 focused tests
- **THEN** 现有 REST route definitions 和 tRPC router exports MUST remain compatible with existing imports and consumers

#### Scenario: service 与 repository 不强行同形
- **WHEN** `apps/api` 与 `apps/admin-api` 的同名 domain service 或 repository 存在不同管理职责
- **THEN** 本变更 MUST NOT merge those modules or move business behavior across app boundaries
