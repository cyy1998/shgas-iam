# 后端架构

本文记录后端结构与 composition 约定。Workflow 门禁仍从 [../workflows/index.md](../workflows/index.md)
进入；当前 functional DI 契约细节见
[../../openspec/specs/backend-functional-di/spec.md](../../openspec/specs/backend-functional-di/spec.md)。

## App 边界

- API tier 在各后端 app 的 `apps/api/app.config.ts` 和 `apps/admin-api/app.config.ts` 中声明。
- `apps/api` 当前拥有 `/public`、`/open`、`/internal`、`/sso` 和 `/auth`。
- `apps/admin-api` 当前拥有 `/admin` 和 `/rpc`；`/rpc` 映射到 `src/routes/trpc` route 目录。
- `createApp` 位于 `packages/api-core`，只挂载各 app composition root 提供的已物化 route 和 middleware 记录。
  它保持 app-agnostic，不拥有 app 私有 DI wiring。
- 后端 `src/app.ts` 应专注 app 组装：导入 env、app config、app-local logger，调用 app-local composition root，
  并把已物化 routes 和 middlewares 传给 `createApp`。

## Composition 与可替换模块

- App-local infrastructure singleton 放在 `src/lib/` 下，例如 `@api/lib/logger`、`@admin-api/lib/logger`、
  `@worker/lib/logger` 和 `src/lib/infra/redis.ts`。
- Production runtime、repository、service、route、middleware 和 integration 实例在 app-local `src/composition/`
  模块中创建，并按 `runtime`、`repositories`、`tx`、`services`、`routes`、`middlewares` 组织。
- 后端可替换模块应导出 factory 和返回类型，例如 `createUserService(deps)` 和
  `type UserService = ReturnType<typeof createUserService>`。不要重新引入已绑定 production 依赖的
  service/repository singleton。
- Consumer-owned `*.port.ts` 文件定义 service/use-case 消费的出站行为。enum、DTO schema、domain error、业务常量
  和纯 helper 保持静态导入，不作为 DI deps 注入。

## Routes 与 Middleware

- Tier-level `_middleware.ts` 文件应保持薄层，只暴露 middleware factory 或组合注入的 middleware 数组；共享认证
  handler 放在 app-level `src/middlewares/*.handler.ts` 中，并由 composition 物化。
- REST-only route 模块使用 `*.routes.ts`、`*.handlers.ts` 和 `*.type.ts`。route `*.index.ts` 文件暴露 router
  factory，接收已物化 handlers/adapters。
- Admin REST + tRPC route 模块应共享 `*.adapter.ts` operation factory，并暴露薄的 `*.trpc.ts` 模块。

## 后端 App 工具配置

- 后端 app 的 `tsconfig.json` 应包含 Bun runtime types，并排除 `scripts`。
- 后端 app ESLint 配置应忽略 `scripts/**`。
