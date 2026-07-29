# 后端架构

本文记录后端 runtime、依赖方向、composition、事务和关键模块的稳定边界。具体编码方式见
[后端实现约定](../development/backend-implementation.md)，package/database ownership 见
[共享契约与数据库](contracts-and-database.md)，验证通道见 [测试编排架构](testing-architecture.md)。

## Runtime 与 App 边界

| App | Runtime 与职责 | Composition 入口 |
|---|---|---|
| `apps/api` | Bun + Hono public IAM backend，拥有 `/public`、`/open`、`/internal`、`/sso`、`/auth` | `src/app.ts` → `createApiComposition()` |
| `apps/admin-api` | Bun + Hono admin backend，拥有 `/admin` 和 `/rpc`；`/rpc` 对应 `src/routes/trpc/` | `src/app.ts` → `createAdminApiComposition()` |
| `apps/oidc-provider` | Node.js 24 + `oidc-provider`，拥有标准 OIDC protocol、interaction、session、store 和 client invalidation runtime | `src/index.ts` → `createOidcProviderComposition()` |
| `apps/worker` | Bun background runtime，拥有 queue consumer、health/Bull Board HTTP 面和 maintenance commands | `src/index.ts` 或 `src/commands/` → worker composition |

API tier 分别在 `apps/api/app.config.ts` 和 `apps/admin-api/app.config.ts` 声明。共享 `createApp` 位于
`packages/api-core`，只挂载 app composition root 提供的已物化 routes 和 middlewares；它保持 app-agnostic，
不拥有 app 私有 DI wiring。

Hono app 的 `src/app.ts` 只负责导入 env、app config 和 app-local logger，调用 app-local composition root，再把
已物化 routes 与 middlewares 交给 `createApp`。

## 核心依赖方向

```text
composition -> routes -> use-cases -> domain-aligned services / consumer-owned ports
                    \-> domain-aligned services
use-cases / domain-aligned services -> pure domain logic
```

后端通过位置和命名区分以下职责：

| 层 | 位置 | 职责 |
|---|---|---|
| Protocol entry | `apps/<app>/src/routes/` | 解析 HTTP/tRPC 输入、调用 use case 或 service、映射输出 |
| Application use case | `apps/<app>/src/use-cases/<scope>/<verb-noun>/` | 表达调用方目标下的跨领域 workflow，以及 transaction 后的副作用编排 |
| Domain-aligned application service | `apps/<app>/src/services/<domain>/` | 提供围绕一个领域能力的 app-local command/query facade |
| Pure domain logic | `packages/domain/src/<domain>/` | 保存不依赖 repository、UnitOfWork、audit、network、Hono 或 composition 的业务规则 |
| Composition | `apps/<app>/src/composition/` | 物化 runtime dependencies，并连接 routes、use cases、services 和 repositories |

Application use case 的主文件、consumer-owned port 和输入类型分别命名为 `<verb-noun>.use-case.ts`、
`<verb-noun>.port.ts` 和 `<verb-noun>.type.ts`；factory 与返回类型使用 `create<VerbNoun>UseCase` 和
`<VerbNoun>UseCase`。Use-case 实例在 `composition/use-cases/` 创建，并通过独立 `useCases` 字段交给 route
composition，不并入 `services`。

Domain-aligned application service 使用 `<domain>.service.ts`、`create<Domain>Service` 和 `<Domain>Service`。
现有 `UserService`、`RoleService` 是 application facade，不是 pure DDD Domain Service。Pure domain logic 优先使用
`<Concept>Policy`、`<Concept>Rules`、`<Concept>Specification` 等表达规则角色的名称。

Route 可以调用 use case 或 service facade，但不得直接依赖 app-local repository 或 `@iam/api-core/uow`。
`services/**` 不得反向 import `use-cases/**`；`packages/domain` 不得 import app-local use case、service 或
composition。跨层实例连接统一由 composition 完成。

## Composition、Factory 与 Port

- App-local infrastructure singleton 放在 `src/lib/`，例如 `@api/lib/logger`、`@admin-api/lib/logger`、
  `@worker/lib/logger` 和 `src/lib/infra/redis.ts`。
- API/Admin API 的 production composition 按 `runtime`、`repositories`、`tx`、`services`、`use-cases`、
  `routes`、`middlewares` 分类。Non-Hono app 按实际 ownership 使用 `provider`、`security`、`session`、`stores`、
  `workers` 等分类，不把异构 protocol/runtime components 伪装成 Application Services。
- 后端可替换模块导出 factory 和返回类型，例如 `createUserService(deps)` 和
  `type UserService = ReturnType<typeof createUserService>`。不要重新引入绑定了 production 依赖的
  service/repository singleton。
- Consumer-owned `*.port.ts` 直接声明 use case/service 所需的最窄出站行为。enum、DTO schema、domain error、
  业务常量和纯 helper 保持静态 import，不作为 DI deps 注入。
- Production port 不 import app-local `*.repository`、`repositories/**`，也不通过
  `Pick<...Repository>` 或 `Pick<...Service>` 从 provider 类型派生接口。允许从另一个 consumer-owned `*Port`
  继续收窄，也允许收窄 platform type。
- 多个边界共享的 input/result type 由 `packages/domain`、`packages/contracts`、相邻 `*.type.ts` 或单一 neutral
  protocol/session module 持有，不从 concrete provider 反向导出。
- Provider 优先通过 TypeScript structural typing 直接满足 port。只有两侧语义不同、确实需要映射时，才在
  composition 建立有行为且有测试的 adapter；不得用 unchecked assertion 或 behaviorless wrapper 掩盖不兼容。

## Transactions 与 afterCommit

- 事务性 workflow 使用 app-local `UnitOfWork`。Composition 的 transaction-port factory 根据当前 transaction
  `DbClient` 创建 tx-bound repositories、audit writer 和其他 transaction-owned ports；业务代码不传递 raw `tx`
  参数。
- Transaction callback 接收 tx-bound ports 与 `tx.afterCommit`。Port factory lifecycle 中的 `afterCommit` 与
  callback 暴露的是同一个 registration port；`mapUnitOfWork` 必须保留该 registration API。
- 一个 workflow 只拥有一个 UnitOfWork transaction boundary。嵌套 UnitOfWork 不受支持，因为 inner commit 可能在
  outer transaction 回滚前执行 after-commit tasks。
- 外部 side effect 不在数据库 transaction callback 内直接执行；应在 callback 外执行，或注册为 after-commit task。
  Task 只在 transaction 成功提交后按注册顺序运行：
  - `required`：失败会记录 error；所有 task 尝试完成后，required failures 聚合为
    `AfterCommitRequiredTaskError` 返回给调用方。
  - `bestEffort`：失败只记录 warning，不让已完成的业务调用失败。
- 两种模式都发生在数据库提交之后，因此 task 失败不能回滚已提交的业务事实。调用方收到 required failure 时，也不得
  把它解释为数据库事务已回滚。Cache 同步等调用契约要求完成的动作可以使用 `required`；session revocation、
  rebuild wake-up 等可恢复动作使用 `bestEffort`。
- `UnitOfWorkTransactionOptions.observability` 携带当前 `requestId`、`traceId`。它同时传给 transaction-port factory
  和 after-commit logger；下层模块不重新解析 protocol context。

## 请求、审计与可观测上下文

- Hono `Context` 属于 route/protocol boundary。Use case 只接收 normalized actor、最小 audit request context 等
  协议无关输入，不接收 Hono `Context`。
- API/Admin API 的 `services/audit/audit.context.ts` 拥有 `AuditLogInput`、actor/request context type 和 context
  normalization helper。Event builders、services、ports 和 use-case types 从该 context owner 导入，不从 concrete
  audit service factory 反向获取类型。
- `recordAuditLogFromContext` 是供 protocol boundary 使用的 convenience；跨 transaction 或进入 use case/service
  的调用应传递已规范化的 audit context。
- `services/audit/events/` 中的 event helpers 是纯 payload builders。业务模块通过 composition 注入的 root 或
  tx-bound audit writer port 写入，不直接绑定 audit repository。
- `requestId` 与 `traceId` 从协议边界显式流入 audit、UnitOfWork observability、after-commit 日志及需要它们的
  integration port；不得依赖隐藏的全局 request state，也不得在叶子模块重复解析 headers。

## 关键模块所有权

### 角色分配解析

- `@iam/role-assignment-resolution` 是 Effective Role 与角色变更受影响用户解析的唯一 production seam。Admin、OIDC
  和 User Profile 的叶子 service/repository 只消费 composition 注入的最窄 resolver 能力，不直接读取
  `role_assignment` 重建解析规则。
- App composition root 或 `createUserProfileWorkerModule` 使用当前 `DbClient` 为普通消费者创建 resolver，同一
  composition 中的消费者复用该实例。
- User Profile 失效是模块自有边界：API/Admin transaction composition 不创建或注入 resolver/projection
  repositories，只把当前 transaction `DbClient`、rebuild queue adapter、lifecycle 和 clock 交给
  `createUserProfileInvalidation`，由模块内部创建 tx-bound resolver 及 projection repositories。
- Admin 角色管理 repository 可以直接读写 assignment 以实现 CRUD、搜索和约束检查；这不属于 Effective Role 或
  受影响用户解析。根级 Architecture Guard 允许该 owner，并阻止其他 production 调用方导入专用 assignment schema
  subpath。

### User Profile 失效

- `@iam/user-profile-read-model` 的 transaction-bound `UserProfileInvalidation.recordChanges` 是业务写路径唯一的
  User Profile 失效 seam。调用方只提交 user、employment、organization、position、role 或 role-assignment source
  change，并在同一 source transaction 的领域写入完成后调用。
- 调用方不选择 dirty reason 或 scope，不接触 dirty/affected-user repository、job producer、after-commit
  registration，也不复制 request/trace metadata。业务 service/use case 只接收自己所需的最窄 `recordChanges` port。
- API/Admin API 的 transaction composition 使用当前 transaction `DbClient` 创建 `UserProfileInvalidation`；
  模块内部拥有 tx-bound dirty repository、affected-user repository 和 role-assignment resolver。普通 repository
  composition 不创建或暴露这些 projection implementations。
- `recordChanges` 成功表示 dirty fact 已在 source transaction 持久化并登记 rebuild wake-up，不表示 BullMQ 已完成
  入队。提交后的批量 enqueue 是 best-effort；失败由日志和 repair 路径恢复，不回滚业务事实。

### Session runtime 与跨 App 边界

- Admin `services/user/**` 和 `services/client/**` 的会话终止只经过 consumer-owned Session Revocation port。
  只有 `services/session-revocation/**` 与 `composition/**` 直接持有 Session Kernel、OIDC runtime、concrete
  session adapter 或 app-local Redis runtime dependency。
- `@iam/api-core/session/kernel` 拥有用户根 Principal Session 的实时 inventory。默认全局索引为
  `sess:v2:idx:principal_sessions`，member 沿用 lifecycle object 编码，score 为 `expiresAt`；创建、续期和撤销
  Principal Session 时，对象与该索引必须在同一 Redis transaction 中变化。
- Inventory 只返回 `principalType=user` 的有效根会话，并通过全局索引或精确用户索引按 `expiresAt` 倒序分块读取；
  查询先批量清理到期 score，遇到悬空成员时删除并继续补足当前页，不执行 Redis `SCAN`。上线前未进入全局索引的旧
  会话不在读取时回填，只有后续续期才进入。
- Admin `services/session-management/**` 只通过消费方拥有的 inventory/control port 读取或撤销 Valid Principal
  Session，并通过一次批量用户摘要 port 补充正常、暂停、结束、已删除或未知账号状态。用户摘要基础设施错误正常
  传播，不把整页伪装成未知用户；production Session Kernel 与用户 repository 通过 structural typing 直接满足这些
  port。
- `POST /admin/session-management/sessions/search`、`POST /admin/session-management/sessions/revoke` 与对应
  `admin.sessionManagement.listSessions`、`admin.sessionManagement.revokeSessions` procedure 复用同一 adapter。
  Adapter 只从认证后的服务端 context 注入 actor user ID、当前 Principal Session ID 和审计请求上下文；列表返回
  归一化 AMR、粗粒度 Session Origin 与 current 标记。撤销 target 只接受内部 `principalSessionId` 或 numeric
  user ID；actor、当前会话和本人例外不能由客户端提交。响应只返回白名单数量摘要，原始 User-Agent、
  `lastActiveAt`、token、metadata、cleanup ref、cleanup failure 内容与原始异常不离开 service/adapter 边界。
- 单会话撤销先保护当前管理 Principal Session，再用固定 `admin_revoke` 原因调用 Kernel 级联撤销。当前会话目标在
  control port 之前失败并返回 `409 / ADMIN_SESSION_CURRENT_PROTECTED`；已失效或不存在的目标返回
  `200 / changed:false`。外围 cleanup 部分失败仍是成功结果，只暴露计数；Kernel inventory/control 不可用映射为
  `503 / ADMIN_LOGIN_STATE_UNAVAILABLE`。
- 用户级撤销通过消费方拥有的 bulk control 一次处理操作开始时用户索引中的根 Principal Session，不在 Admin service
  预取列表或逐行撤销。其他用户的全部根会话与 children 被撤销；actor 本人保留服务端当前根会话但仍撤销其 children
  和其他 roots。本人缺少当前 Principal Session ID 时在 control 前 fail closed；操作不引入 user generation、
  revocation epoch、登录冻结或并发新登录屏障。
- Session Revocation 的 Redis 作用先于 PostgreSQL 审计。作用后审计失败记录结构化系统日志并返回
  `500 / ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`；调用方必须刷新状态且不得自动重试 mutation。
- Principal Session v1 可以携带可选 Session Origin；来源只保存可信网关清洗后的请求 IP 与最多 512 字符的原始
  User-Agent，不提升对象版本，也不形成设备身份或授权事实。密码、手机验证码、OA 和微信登录从服务端请求上下文把
  来源传入统一 Principal Session 创建边界。
- Worker production source 不依赖 API 私有 alias `@api`、`@api/*`、`~api/src` 或 `~api/src/*`。跨 app 复用能力
  通过 public workspace package 暴露和消费。

### Temporary Login Restriction

- `@iam/api-core/login-restriction` 是 Temporary Login Restriction 实时生命周期的共享 production seam。它统一拥有
  `login-failures:user:*`、`login-blacklist:user:*` 兼容 key、5 次阈值、30 分钟滚动窗口、30 分钟限制和
  `login-blacklist:idx:users` 派生索引。
- `LoginRestriction` 生命周期 facade 只依赖业务语义化 atomic storage port；production Redis adapter 独占 key 与
  Lua，并使用 Redis 服务端时间创建、清理和遍历到期索引。列表遍历期间不得重写成员 score。
- 密码与手机登录 use case 只通过 consumer-owned `loginRestriction` port 查询状态、原子记录失败和原子清理状态；
  不自行持有 Redis key、阈值、限制写入或清理顺序。Temporary Login Restriction 不调用 Session Kernel，也不撤销或
  恢复已有 Principal Session。
- Admin `services/session-management/**` 通过 consumer-owned `loginRestrictions` port 读取限制和原子清理登录状态；
  production `LoginRestriction` 以 structural typing 直接满足该 port。列表按自动到期时间倒序使用现有分页形状，
  支持可选精确 numeric user ID，并通过一次批量用户摘要补充正常、暂停、结束、已删除或未知账号状态；用户记录缺失
  不会使限制不可见或不可解除。
- `POST /admin/session-management/login-restrictions/search`、
  `DELETE /admin/session-management/login-restrictions/{userId}` 与对应
  `admin.sessionManagement.listLoginRestrictions`、`admin.sessionManagement.releaseLoginRestriction` procedure
  复用同一 adapter。安全列表 VO 只暴露用户摘要、规范 `too_many_login_failures` cause、最后
  `password` / `mobile` / `unknown` Trigger Method、自动到期时间与服务端剩余秒数。
- 解除意图只调用共享 `clearLoginState` 原子删除限制、当前失败历史与限制索引成员，返回 `changed` 和
  `failureStateCleared:true`；自然过期或并发处理返回 `200 / changed:false`。它不调用 Session inventory/control，
  不创建 allowlist 或宽限期，也不创建、撤销、续期或恢复任何 Principal Session；后续新失败立即按现有策略计数。
- 限制查询或解除无法确认 Redis 状态时返回 `503 / ADMIN_LOGIN_STATE_UNAVAILABLE`。解除作用先于
  `admin.login_restriction.release` PostgreSQL 审计；`changed:true` 后审计失败返回
  `500 / ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`，调用方刷新状态且不得自动重试 mutation。
- Redis 状态无法确认时，共享模块抛出中性的 unavailable error，由登录入口映射为
  `503 / LOGIN_PROTECTION_UNAVAILABLE`；登录审计使用 `login_protection_unavailable`，不得伪装成凭据错误或真实限制。
- 新索引不执行旧 Temporary Login Restriction backfill，也不增加维护扫描或页面开放门禁；上线前未索引状态允许在
  最长约 30 分钟的既有 TTL 窗口内不可见。
- Production 使用未加前缀的兼容 key；`keyPrefix` 只用于真实 Redis contract 的随机 namespace 隔离，不属于业务输入。

### Custom SSO Authorization Grant

- `/sso/authorize`、`/sso/token` 和 `/sso/callback` 的 Application Use Case 拥有入口验证：在消费 authorization
  code 或创建 credential/session 前，按端点完成 client 查询、client secret 校验和 redirect allowlist 校验。
  三个 use case 分别只消费 `AuthorizationCodeIssuerPort`、`IndependentAuthorizationGrantPort` 和
  `GatewayLoginCompletionPort`。
- `custom-sso-session-kernel.adapter.ts` 是 Custom SSO deep module implementation。它拥有一次性 grant resolution、
  PrincipalSession 与实时用户校验、Independent Client Credential、Gateway Local Session、ORCAS、私有 payload、
  audit 和失败补偿；共同的 resolved grant 只存在于 implementation 内。
- Production adapter 通过 TypeScript structural typing 直接满足上述三个 consumer-owned ports。Composition 只注入
  ORCAS 所需的最窄 `CustomSsoOrcasLoginPort`，不得增加 behaviorless wrapper，也不得恢复公开
  `consumeAuthCode → createLocalSession` 两阶段 interface。
- SSO route 只拥有 HTTP query/header/Cookie 解析、response envelope、Gateway/ORCAS Cookie、redirect query 和
  status 适配，不接触 Session Kernel 模型，也不编排 grant、credential、session、ORCAS 或补偿步骤。
- 兼容性标识由 deep module implementation 持有。现有 Redis key、payload version、credential discriminator、
  audit action 和 active session payload normalization 不因 module interface 收缩而重命名或迁移。

## Runtime-specific Composition

### OIDC Provider

- `apps/oidc-provider/src/provider/claims.ts` 直接实现 `oidc-provider` claims hooks，属于 protocol adapter。
  Factory、返回类型和 deps type 分别使用 `createOidcClaimsAdapter`、`OidcClaimsAdapter` 和
  `CreateOidcClaimsAdapterDeps`；它不属于 Domain-aligned Application Service。
- OIDC composition 按 ownership 分类：Claims Adapter 与 interaction policy 由 `composition/provider` 物化；
  client auth rate limiter 与 client secret verifier 由 `composition/security` 物化；Session Kernel 与
  `oidcSession` facade 由 `composition/session` 物化。
- Provider composition 可以显式接收 repositories、stores、security 和 session facades。Claims、interaction policy
  与 interaction handler 直接消费 `session.oidcSession`，不得通过 `services.globalSessionResolver` 或等价 services
  alias 二次分类。
- `composition/workers` 是 client invalidation subscriber 的唯一 runtime owner。它创建 Redis subscriber，并只注入
  `oidcSession`、token store 和 protocol-object store 的最窄 client revocation 能力。单条消息的 cleanup failure
  记录 structured warning，不反向进入 client update transaction。
- Provider protocol module 可以静态 import `oidc-provider` types 和纯 protocol helpers，但不得静态绑定 app-local
  DB、Redis、logger 或 concrete production repository；production 实例连接只发生在 composition。

### Worker

- `apps/worker/src/modules/registry.ts` 定义稳定 `WorkerModule` contract：`key`、`queueRegistrations`、
  `startConsumers()` 和 `close()`。具体 queue/processor implementation 由对应 public workspace package 提供。
- `createWorkerComposition` 拥有 runtime、已构造 modules、module selection、dashboard queue selection、HTTP server
  和 shutdown。未知 module key 在启动时失败；consumer 按配置启动，module 按反向顺序关闭。
- `src/http/` 只提供 health/readiness 与可选 Bull Board，不是业务 API。Readiness 由 composition 注入依赖检查和
  module 状态；Bull Board 只接收 module 显式注册的 queues。
- `createWorkerCommandComposition` 使用 `commandOnly` 模式复用 DB/Redis/module wiring，但不启动 consumers、不注册
  dashboard queues，也不启动 HTTP server；`src/commands/` 的 backfill/repair entrypoints 使用该入口。
- Worker composition 负责关闭构造出的 modules、HTTP server、Redis 和 DB。业务 package 不拥有 process signal
  handling；`src/index.ts` 只负责启动、记录 runtime 状态和转交 graceful shutdown。

## Routes 与 Middleware

- Tier-level `_middleware.ts` 保持薄层，只暴露 middleware factory 或 composition 注入的 middleware 数组；共享认证
  handler 放在 app-level `src/middlewares/*.handler.ts`，并由 composition 物化。
- REST-only route module 使用 `*.routes.ts`、`*.handlers.ts` 和 `*.type.ts`。`*.index.ts` 暴露 router factory，
  接收已物化 handlers/adapters。
- Admin REST + tRPC route module 共享 `*.adapter.ts` operation factory，并暴露薄的 `*.trpc.ts` module。
- Route production module 负责协议解析、middleware context 提取、facade 调用、VO mapping 和 response 适配；不得
  持有 repository/UnitOfWork，或编排依赖 transaction 内部结果的后续业务副作用。

## 后端 App 工具配置

- Bun runtime apps（`apps/api`、`apps/admin-api`、`apps/worker`）的 `tsconfig.json` 包含 Bun types；
  Node.js runtime 的 `apps/oidc-provider` 包含 Node types。
- App-local maintenance scripts 属于非生产工具。新增 `scripts/` 时，在 `tsconfig.json` 中排除该目录，并在 ESLint
  配置中忽略 `scripts/**`。API、Admin API 和 OIDC Provider 已预留这些模式；Worker 使用 production
  `src/commands/`，没有独立 maintenance `scripts/`。

## 验证责任

- `pnpm check:architecture` 是唯一静态架构入口。根级 Architecture Guard 只按 production source path、规范化静态
  module edge 和 type/value dependency 检查稳定 ownership 与依赖方向；规则准入见
  [架构守卫规范](architecture-guard.md)。
- Package exports 与 consumer typecheck 验证 public surface 和 structural compatibility。
- Port、UnitOfWork、User Profile、Session Kernel、Worker module 等公开 interface 的可观察语义由 behavior/contract
  tests 维护，不转写成脆弱的 AST 语义规则。
- Process smoke 验证真实 production composition、进程生命周期与 readiness；PostgreSQL、浏览器和 Gateway 事实由
  对应外部资源通道验证。
