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
- Production runtime、repository、service、use-case、route、middleware 和 integration 实例在 app-local
  `src/composition/` 模块中创建，并按 `runtime`、`repositories`、`tx`、`services`、`use-cases`、`routes`、
  `middlewares` 组织。
- 后端可替换模块应导出 factory 和返回类型，例如 `createUserService(deps)` 和
  `type UserService = ReturnType<typeof createUserService>`。不要重新引入已绑定 production 依赖的
  service/repository singleton。
- Consumer-owned `*.port.ts` 文件定义 service/use-case 消费的出站行为。enum、DTO schema、domain error、业务常量
  和纯 helper 保持静态导入，不作为 DI deps 注入。

## Application Use Case、Application Service 与领域规则

后端通过位置和命名区分三类业务模块：

- **Application Use Case** 表达一个调用方目标下的跨领域 workflow，可以拥有跨 repository transaction，以及由
  transaction 结果驱动的审计、通知等副作用编排。它位于
  `apps/<app>/src/use-cases/<scope>/<verb-noun>/`；主文件、consumer-owned port 和输入类型分别命名为
  `<verb-noun>.use-case.ts`、`<verb-noun>.port.ts` 和 `<verb-noun>.type.ts`。Factory 与返回类型使用
  `create<VerbNoun>UseCase` 和 `<VerbNoun>UseCase`，对调用方暴露 `execute(input, options)` 等协议无关接口。
- **Domain-aligned Application Service** 围绕一个领域能力提供 app-local command/query facade，可以依赖 repository、
  UnitOfWork、audit 或 read model port。它位于 `apps/<app>/src/services/<domain>/<domain>.service.ts`，factory 与返回
  类型使用 `create<Domain>Service` 和 `<Domain>Service`。现有 `UserService`、`RoleService` 属于这一类，不是 pure
  DDD Domain Service；本约定不要求批量移动或重命名它们。
- **Pure Domain Logic** 是不依赖 repository、UnitOfWork、audit、network、Hono 或 app composition 的业务规则，
  位于 `packages/domain/src/<domain>/`。优先使用 `<Concept>Policy`、`<Concept>Rules`、
  `<Concept>Specification` 等表达规则角色的名称；只有行为确实不适合 entity、value object、policy 或
  specification 时才使用 `*DomainService`。

Production wiring 位于 `apps/<app>/src/composition/`。Use-case 实例由 `composition/use-cases/` 创建，并通过独立的
`useCases` 字段交给 route composition，不并入 `services` 字段。允许的依赖方向为：

```text
composition -> routes -> use-cases -> domain-aligned services / consumer-owned ports
                    \-> domain-aligned services
use-cases / domain-aligned services -> pure domain logic
```

Route 可以调用 use-case 或 service facade，但不得直接依赖 app-local repository 或 `@iam/api-core/uow`。
`services/**` 不得反向 import `use-cases/**`；`packages/domain` 不得 import app-local use-case、service 或
composition。跨层实例连接统一由 composition 完成。

## Routes 与 Middleware

- Tier-level `_middleware.ts` 文件应保持薄层，只暴露 middleware factory 或组合注入的 middleware 数组；共享认证
  handler 放在 app-level `src/middlewares/*.handler.ts` 中，并由 composition 物化。
- REST-only route 模块使用 `*.routes.ts`、`*.handlers.ts` 和 `*.type.ts`。route `*.index.ts` 文件暴露 router
  factory，接收已物化 handlers/adapters。
- Admin REST + tRPC route 模块应共享 `*.adapter.ts` operation factory，并暴露薄的 `*.trpc.ts` 模块。
- Route production module 负责协议解析、middleware context 提取、facade 调用、VO mapping 和 response 适配；不得
  持有 repository/UnitOfWork，或编排依赖 transaction 内部结果的后续业务副作用。

## 后端 App 工具配置

- 后端 app 的 `tsconfig.json` 应包含 Bun runtime types，并排除 `scripts`。
- 后端 app ESLint 配置应忽略 `scripts/**`。
