# Admin API 独立服务拆分设计

- 日期：2026-05-12
- 涉及范围：`apps/api`、`apps/admin`、`apps/sso`、`packages/shared` -> `packages/contracts`、新增 `apps/admin-api`、新增 `packages/db`、新增 `packages/api-core`
- 状态：设计已确认，待实施计划

## 1. 背景

当前 `apps/api` 是单个 Bun + Hono 后端，通过 `app.config.ts` 的 tier 配置同时暴露 `public`、`open`、`admin`、`internal`、`sso`、`auth` 和 `rpc`。管理后台 `apps/admin` 主要通过 `/rpc` 调用 admin tRPC，并从 `@iam/api/trpc` 获取类型。`apps/api/src/routes/admin/*` 下已有 `client`、`user`、`organization`、`position`、`employment` 等管理路由，REST 与 tRPC 通过 `*.ops.ts` 共享业务操作。

本次目标是把 admin 后端拆成独立服务，同时避免把 admin service 与核心 API service 继续耦合。数据库 schema、relations 和通用后端基础设施需要抽到 workspace packages，供核心 API 和 admin API 复用。

## 2. 目标

1. 新增独立的 `apps/admin-api`，独立启动、独立部署。
2. `apps/admin-api` 承接全部 admin REST/OpenAPI 与 admin tRPC 能力，包括 `client`、`user`、`organization`、`position`、`employment`。
3. admin 的 DTO/schema、service、repository 归 `apps/admin-api` 自己所有，不复用 `apps/api/src/services/*`。
4. `apps/api` 保留 `auth`、`sso`、`public`、`open`、`internal` 等非管理入口，并移除 admin tier 与 admin tRPC。
5. 两个后端直接读写同一个 PostgreSQL，但只共享数据库契约，不共享业务 service。
6. 前端运行时保持请求 `/rpc`，由开发代理和生产网关转发到 `admin-api`；编译期 tRPC 类型改为 `@iam/admin-api/trpc`。
7. 本次拆分同步加固 admin 鉴权，要求用户具备管理员角色。

## 3. 非目标

1. 不把 admin 写操作改为调用核心 API internal 接口。
2. 不把业务 DTO/schema 抽成共享 domain service 包。
3. 不在本次设计中引入细粒度 privilege 鉴权；第一阶段使用角色码门槛。
4. 不改变管理前端的运行时 `/rpc` 调用路径。
5. 不为两个服务分别维护 Drizzle migrations。

## 4. 目标架构

### 4.1 应用边界

`apps/admin-api` 是新的管理后端服务。它提供：

- `/admin/*` REST/OpenAPI
- `/rpc` admin tRPC
- 独立 admin routes
- 独立 admin DTO/schema
- 独立 admin service
- 独立 admin repository

`apps/api` 是核心 IAM 后端服务。它保留：

- `auth`
- `sso`
- `public`
- `open`
- `internal`

`apps/api` 不再暴露 admin tier，也不再导出 admin tRPC router 给管理前端使用。

### 4.2 共享包边界

新增和调整后的 packages 分为三类。

#### `@iam/contracts`

由当前 `packages/shared` 迁移并重命名为 `packages/contracts`，包名改为 `@iam/contracts`，作为前后端共享的稳定契约包。它包含：

- 领域枚举，例如 `UserStatus`、`OrganizationType`、`EmploymentStatus`
- 服务状态码，例如 `ServiceStatusCode`
- 前端可直接消费的 options helper，例如 `getUserStatusOptions()`

`apps/admin`、`apps/sso`、`apps/api`、`apps/admin-api` 都可以依赖 `@iam/contracts`。

#### `@iam/db`

新增 `packages/db`，作为唯一数据库契约和迁移来源。它包含：

- Drizzle schema
- Drizzle relations
- Drizzle migrations
- `drizzle.config.ts`
- `db` client、`closeDb`
- `DbClient`、`DbTransaction`
- `query-utils.ts`
- table-derived Zod schemas

Drizzle 命令归 `@iam/db`，例如：

```bash
pnpm --filter @iam/db db:generate
pnpm --filter @iam/db db:migrate
pnpm --filter @iam/db db:push
```

`apps/api` 和 `apps/admin-api` 不再各自拥有数据库 schema 或 migrations。

#### `@iam/api-core`

新增 `packages/api-core`，作为后端 API 基础设施包。它包含：

- `createApp`、`createRouter`、`defineConfig`
- OpenAPI helpers
- HTTP status 常量
- pagination schema/type
- response helper
- 通用错误类型和 error handler
- not found handler
- logger
- singleton helper
- glob import helper
- common/encryption utils
- Redis client
- session 鉴权基础逻辑
- `business-op`
- tRPC 基础封装

`@iam/api-core` 不能依赖 `apps/api` 或 `apps/admin-api` 的业务 service。当前带业务依赖的逻辑需要改成注入式工厂，例如 internal 鉴权由应用传入 `getClientBySecret`，admin 鉴权由应用传入允许角色码和 session DTO parser。

## 5. 数据流

### 5.1 管理前端

`apps/admin` 运行时继续请求 `/rpc`。开发环境由 Umi proxy 把 `/rpc` 转发到 `apps/admin-api`；生产环境由网关或反向代理在管理前端入口下把 `/rpc` 转发到 `admin-api`。

`apps/admin` 编译期 tRPC 类型从 `@iam/api/trpc` 改为 `@iam/admin-api/trpc`。

### 5.2 后端读写

`apps/api` 和 `apps/admin-api` 都依赖 `@iam/db`，并直接读写同一个 PostgreSQL。两边分别维护自己的 service/repository：

- admin-api 的管理写操作由 admin service/repository 负责业务校验和事务边界。
- apps/api 的核心写操作由核心 service/repository 负责。

两个后端不通过运行时内部 API 互相调用。

### 5.3 REST 与 tRPC 一致性

`apps/admin-api` 继续使用当前 admin 代码中的 `*.ops.ts` 思路，让 REST handler 和 tRPC procedure 共享同一组 admin ops。区别是这些 ops 位于 `apps/admin-api`，不再属于 `apps/api`。

## 6. 鉴权设计

`apps/admin-api` 的 `/admin/*` 和 `/rpc` 共用 `adminAuthenticationHandler`。

处理流程：

1. 校验 session，支持当前已有的 `global_session` 或 `local_<client>_session` 读取方式。
2. 从 Redis 读取 session 内容，解析 `userDetailDto`。
3. 校验 `Client` header 在管理端 allowlist 中，默认只允许 `iam`。
4. 校验 `userDetailDto.roles` 包含管理员角色码，默认 `iam:admin`。
5. 未登录返回 401。
6. 已登录但无管理员角色返回 403。

角色码第一阶段沿用当前管理前端的 `ADMIN_ROLE_CODE` 约定，不在本次拆分中引入 privilege code 门槛。

## 7. 迁移阶段

### 阶段 1：重命名契约包

把 `packages/shared` 目录迁移为 `packages/contracts`，并把 package name 改为 `@iam/contracts`。更新 `apps/api`、`apps/admin`、`apps/sso` 的依赖和 import。原有领域枚举、状态码、options helper 保留。

完成标志：

- `packages/contracts` 下的 `@iam/contracts` 可被三个现有 app 正常引用。
- `apps/api`、`apps/admin`、`apps/sso` 不再引用 `@iam/shared`。
- 受影响 app 的 typecheck 不因包名变化失败。

### 阶段 2：抽 `@iam/db`

新建 `packages/db`，从 `apps/api/src/db` 迁入 schema、relations、migrations、query-utils、db client 和 Drizzle 配置。更新 `apps/api` 内所有 `@api/db` import 为 `@iam/db`。

完成标志：

- `@iam/db` 有自己的 package scripts。
- `pnpm --filter @iam/db db:generate|db:migrate|db:push` 能找到同一套 schema/migrations。
- `apps/api` 依赖 `@iam/db` 后仍能 typecheck。

### 阶段 3：抽 `@iam/api-core`

新建 `packages/api-core`，迁入或抽象后端基础设施。所有业务依赖点改成注入式接口，避免 `api-core` 反向依赖应用 service。

完成标志：

- `apps/api` 依赖 `@iam/api-core` 后仍能 typecheck/lint。
- `@iam/api-core` 不 import `apps/*` 或任何应用业务 service。
- 现有核心 API 路由注册、错误响应、OpenAPI 文档行为保持可用。

### 阶段 4：新建 `apps/admin-api`

新建 Bun + Hono 应用，依赖 `@iam/db`、`@iam/api-core`、`@iam/contracts`。迁入全部 admin routes 和 admin tRPC，包含 `client`、`user`、`organization`、`position`、`employment`。重建 admin 自己的 DTO/schema/service/repository。新增并启用 `adminAuthenticationHandler`。

完成标志：

- `@iam/admin-api` 导出 `./trpc`，供 `apps/admin` 获取类型。
- `/admin/*` REST/OpenAPI 可用。
- `/rpc` admin tRPC 可用。
- 未登录请求返回 401，无 `iam:admin` 角色返回 403。
- admin 基础 CRUD smoke test 通过。

### 阶段 5：切前端和移除旧 admin

更新 `apps/admin` 的 tRPC 类型导入为 `@iam/admin-api/trpc`。更新开发 proxy 和生产网关/compose，让管理前端入口下的 `/rpc` 转发到 `admin-api`。验证后从 `apps/api` 移除 admin tier、admin routes 和 admin tRPC。

完成标志：

- `apps/admin` 管理流程全部走 `apps/admin-api`。
- `apps/api` 不再暴露 admin REST 或 admin tRPC。
- `apps/api`、`apps/admin-api`、`apps/admin` typecheck 通过。

## 8. 验证策略

每个包和 app 都要具备自己的 `typecheck` / `lint` 脚本，并接入 Turbo。

阶段性验证：

- 重命名 `@iam/contracts` 后，跑受影响 app 的 typecheck。
- 抽 `@iam/db` 后，跑 `@iam/db` 和 `@iam/api` typecheck，并验证 Drizzle 命令路径。
- 抽 `@iam/api-core` 后，跑 `@iam/api-core` 和 `@iam/api` typecheck/lint。
- 新建 `admin-api` 后，跑 `@iam/admin-api`、`@iam/admin`、`@iam/api` typecheck。

接口 smoke test：

- `apps/api` 验证 `auth/sso/public/open/internal`。
- `apps/admin-api` 验证 `/admin/*` REST 文档、`/rpc` tRPC，以及 `client/user/organization/position/employment` 基础 CRUD。

鉴权 smoke test：

- 未登录访问 admin REST/tRPC 返回 401。
- 登录但没有 `iam:admin` 角色返回 403。
- 有 `iam:admin` 角色可以访问管理接口。

## 9. 风险与处理

### 同库双服务写入规则漂移

admin-api 和 apps/api 都直接写同一个数据库，可能出现业务规则不一致。处理方式是让 admin 写操作的规则显式落在 admin service 中，并为关键 mutation 保留事务边界和错误类型；不通过复用核心 service 来隐藏耦合。

### `api-core` 业务依赖倒灌

抽基础设施时，鉴权、Redis、business-op 等模块可能不小心 import 应用 service。处理方式是使用工厂或注入接口，禁止 `@iam/api-core` import `apps/*`。

### `/rpc` 路由冲突

管理前端继续请求 `/rpc`，需要生产网关按管理前端入口把 `/rpc` 转到 admin-api。核心 API 如果未来需要 RPC，应使用独立入口，避免和 admin 前端混用。

### 包重命名影响范围

`@iam/shared` 到 `@iam/contracts` 作为单独第一阶段完成，避免和 admin-api 拆分混在一起。

### REST 与 tRPC 行为不一致

保留 `*.ops.ts` 共享操作模式，让 REST handler 和 tRPC procedure 继续调用同一组 admin ops，降低双入口漂移。

## 10. 已确认决策

1. 采用分阶段迁移方案。
2. admin-api 直接读写同一个 PostgreSQL。
3. 前端运行时继续请求 `/rpc`。
4. admin-api 保留 REST/OpenAPI 与 tRPC。
5. 本次拆分同步加入 admin 鉴权。
6. admin 权限门槛使用角色码，默认 `iam:admin`。
7. 抽 `@iam/db` 和 `@iam/api-core`。
8. 前端 tRPC 类型改为 `@iam/admin-api/trpc`。
9. 当前 `routes/admin/client` 也迁入 admin-api。
10. Drizzle migrations 迁到 `@iam/db`。
11. 业务 DTO/schema 按服务拆分，不抽共享业务 DTO 包。
12. `packages/shared` 迁移为 `packages/contracts`，包名重命名为 `@iam/contracts`。
