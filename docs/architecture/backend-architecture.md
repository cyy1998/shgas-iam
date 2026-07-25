# 后端架构

本文记录后端结构与 composition 约定。当前 functional DI 契约由本文、各后端 app 的 production composition，
以及 `src/__tests__/architecture.test.ts` 和 `src/__tests__/port-contracts.test.ts` 共同维护。

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
  `middlewares` 组织；non-Hono app 可以按实际 runtime ownership 使用 `provider`、`security`、`session`、`stores`、
  `workers` 等分类，不得把异构 protocol/runtime components 伪装成 Application Services 聚合。
- 后端可替换模块应导出 factory 和返回类型，例如 `createUserService(deps)` 和
  `type UserService = ReturnType<typeof createUserService>`。不要重新引入已绑定 production 依赖的
  service/repository singleton。
- Consumer-owned `*.port.ts` 文件定义 service/use-case 消费的出站行为。enum、DTO schema、domain error、业务常量
  和纯 helper 保持静态导入，不作为 DI deps 注入。
- Production `*.port.ts` 直接声明调用方所需的最窄 reader/writer/store/collaborator signature，不 import app-local
  `*.repository`、`repositories/**`，也不通过 `Pick<...Repository>` 或 `Pick<...Service>` 从 provider 类型派生接口。
  三个 backend 的 architecture suites 会扫描全部 production ports，防止这类 ownership 回退。
- 多个边界共享的 input/result type 由 `packages/domain`、`packages/contracts`、相邻 `*.type.ts` 或单一的 neutral
  protocol/session module 持有。允许从另一个 consumer-owned `*Port` 继续收窄（例如 `Pick<...Port>`），也允许收窄
  platform type；这些用法不得把 concrete provider ownership 带入消费方。
- Production provider 应优先通过 TypeScript structural typing 直接满足 port。只有两侧确有不同语义、需要显式映射时，
  才在 composition 建立有行为且有测试的 adapter；不得用 unchecked assertion 或 behaviorless wrapper 掩盖不兼容。

### 角色分配解析的 Composition 边界

- `@iam/role-assignment-resolution` 是 Effective Role 与角色变更受影响用户解析的唯一生产 seam。Admin、OIDC 和
  User Profile 的叶子 service/repository 只消费 composition 注入的最窄 resolver 能力，不直接读取
  `role_assignment` 来重建解析规则。
- App composition root 或 `createUserProfileWorkerModule` 使用其当前 `DbClient` 创建 resolver；同一组合中的消费者复用
  该实例。事务 composition 必须使用 transaction `DbClient` 重新创建 resolver，并与同一 transaction 的 repositories
  一起注入 dirty marker 路径。
- Admin 角色管理 repository 仍可直接读写 assignment 以实现 CRUD、搜索和约束检查；这不属于 Effective Role 或
  受影响用户解析。架构测试允许该 owner，并阻止其他已迁移生产调用方重新导入 assignment table。

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

## OIDC Provider Protocol Components

- `apps/oidc-provider/src/provider/claims.ts` 直接实现 `oidc-provider` 的 claims hooks，属于 protocol adapter。Factory、
  返回类型和 deps type 分别使用 `createOidcClaimsAdapter`、`OidcClaimsAdapter` 和
  `CreateOidcClaimsAdapterDeps`；它不属于 Domain-aligned Application Service。
- OIDC production composition 按 ownership 分类：Claims Adapter 与 interaction policy 由 `composition/provider`
  物化；client auth rate limiter 与 client secret verifier 由 `composition/security` 物化；Session Kernel 与
  `oidcSession` facade 由 `composition/session` 物化。
- Provider composition 可以显式接收 repositories、stores、security 和 session facades。Claims、interaction policy
  与 interaction handler 直接消费 `session.oidcSession`，不得通过 `services.globalSessionResolver` 或等价 services
  alias 二次分类。
- Provider protocol module 可以静态 import `oidc-provider` types 和纯 protocol helpers，但不得静态绑定 app-local DB、
  Redis、logger 或 concrete production repository；production 实例连接只发生在 composition。

## Custom SSO Authorization Grant 模块

- `/sso/authorize`、`/sso/token` 和 `/sso/callback` 对应的 Application Use Case 拥有入口验证：在进入任何会消费
  authorization code 或创建 credential/session 的操作前，先按端点完成 client 查询、client secret 校验和 redirect
  allowlist 校验。三个 use case 分别只消费 `AuthorizationCodeIssuerPort`、
  `IndependentAuthorizationGrantPort` 和 `GatewayLoginCompletionPort`。
- `custom-sso-session-kernel.adapter.ts` 是 Custom SSO 的 deep module implementation。它拥有一次性 grant resolution、
  PrincipalSession 与实时用户校验、Independent Client Credential、Gateway Local Session、ORCAS、私有 payload、
  audit 和失败补偿；共同的 resolved grant 只存在于 implementation 内，不越过 module interface。
- Production adapter 通过 TypeScript structural typing 直接满足上述三个 consumer-owned ports。Composition 只注入
  ORCAS 所需的最窄 `CustomSsoOrcasLoginPort`，不得增加 behaviorless wrapper，也不得恢复公开
  `consumeAuthCode → createLocalSession` 两阶段 interface。
- SSO route 只拥有 HTTP query/header/Cookie 解析、response envelope、Gateway/ORCAS Cookie、redirect query 和 status
  适配，不接触 Session Kernel 模型，也不编排 grant、credential、session、ORCAS 或补偿步骤。
- 兼容性标识继续由 deep module implementation 持有。现有 Redis key、payload version、credential discriminator、
  audit action 和 active session payload normalization 不因 module interface 收缩而重命名或迁移。

## Routes 与 Middleware

- Tier-level `_middleware.ts` 文件应保持薄层，只暴露 middleware factory 或组合注入的 middleware 数组；共享认证
  handler 放在 app-level `src/middlewares/*.handler.ts` 中，并由 composition 物化。
- REST-only route 模块使用 `*.routes.ts`、`*.handlers.ts` 和 `*.type.ts`。route `*.index.ts` 文件暴露 router
  factory，接收已物化 handlers/adapters。
- Admin REST + tRPC route 模块应共享 `*.adapter.ts` operation factory，并暴露薄的 `*.trpc.ts` 模块。
- Route production module 负责协议解析、middleware context 提取、facade 调用、VO mapping 和 response 适配；不得
  持有 repository/UnitOfWork，或编排依赖 transaction 内部结果的后续业务副作用。

## 后端 App 工具配置

- Bun runtime apps（`apps/api`、`apps/admin-api`、`apps/worker`）的 `tsconfig.json` 应包含 Bun types；
  Node.js runtime 的 `apps/oidc-provider` 应包含 Node types。
- App-local maintenance scripts 属于非生产工具；实际新增该目录时，应在 `tsconfig.json` 中排除 `scripts`，并在
  ESLint 配置中忽略 `scripts/**`。API、Admin API 和 OIDC Provider 的配置已预留这些模式；Worker 当前没有该目录，
  也没有对应排除项。
