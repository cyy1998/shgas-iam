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
- 外部 side effect 默认不在数据库 transaction callback 内直接执行；应在 callback 外执行，或注册为
  after-commit task。唯一已批准的例外是下述 generation-fenced Client runtime pre-commit coordination；
  不得把该例外扩展到通知、Session 撤销、业务 cache 写入或其他不可逆作用。
  Task 只在 transaction 成功提交后按注册顺序运行：
  - `required`：失败会记录 error；所有 task 尝试完成后，required failures 聚合为
    `AfterCommitRequiredTaskError` 返回给调用方。
  - `bestEffort`：失败只记录 warning，不让已完成的业务调用失败。
- 两种模式都发生在数据库提交之后，因此 task 失败不能回滚已提交的业务事实。调用方收到 required failure 时，也不得
  把它解释为数据库事务已回滚。Cache 同步等调用契约要求完成的动作可以使用 `required`；session revocation、
  rebuild wake-up 等可恢复动作使用 `bestEffort`。
- `UnitOfWorkTransactionOptions.observability` 携带当前 `requestId`、`traceId`。它同时传给 transaction-port factory
  和 after-commit logger；下层模块不重新解析 protocol context。
- `RegisterPurveyorContactUseCase` 的同手机号 create-or-attach 规则由 transaction-bound user port
  `lockPurveyorContactMobile` 串行化。Production repository 使用 operation-specific key 的
  PostgreSQL transaction advisory lock，并在新建和复用联系人两条 transaction 路径中都先取锁、再查询手机号。
  当前 schema 有意不把所有用户手机号提升为全局唯一约束：手机号可空且其他用户写流程并不共享该 upsert 语义；
  新增任何供应商联系人数据库写入口时必须复用同一 lock key/用例，而不能绕过该并发边界。

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

### Client Subject Projection

- `@iam/client-subject-projection` 通过单一 `ClientSubjectProjectionService.resolve` Interface 隐藏 Catalog
  校验、Subject Facts 读取、client 裁剪、稳定排序与投影组装。调用方只提交 Subject Identifier、`clientCode` 和
  `SubjectClaimSelection`；facts/access/freshness dependencies 只在 factory 处注入。
- Subject Facts port 只暴露显式 Profile 与当前有效任职事实，不暴露 Legacy User Detail。普通 Profile claim
  可以使用最后发布事实；选择 `iam:authorization` 时，Module 根据 facts source version 调用 Authorization
  Freshness port。该 port 可以确认当前 facts、返回一次重载后的 facts，或报告 not-ready；Module 在组装任何已选
  claim 前采用已确认版本，无法证明新鲜时返回 `SubjectProjectionNotReadyError`。
- 核心投影保持协议中性。`@iam/client-subject-projection/custom-sso` 只公开一个完整 V2 交付 Interface：
  `resolveCustomSsoSubjectProjection` 先调用 root Projection Service，再核对返回的 Subject Identifier 与 resolve input，
  随后执行 wire mapping 和 strict schema parse。Schema、Wire 类型与 placeholder preview
  继续公开。Subject mismatch 产生只含安全 reason `subject_mismatch` 的内部不变量错误，mapping/parse 失败产生
  `invalid_wire`；resolve 阶段的既有错误原样传播。该 subpath 只能通过 package root public Interface 取得 Projection
  类型或能力，不得导入其他 core subpath、Facts persistence、client 配置、runtime 或 transport。
- Package root 是唯一 active V2 projection Interface；Custom SSO wire 只从 `/custom-sso` subpath 公开。Catalog V2 保持既有 claim vocabulary，
  选择 `profile:employments` 时每条 Employment 原子携带 canonical `responsibilities`/`[]`；authorization employment
  继续只含 Employment identity、roles 与 privileges。Custom SSO subpath 拥有 V2 strict schema/mapper，缺失、
  未知或非法 responsibility 拒绝整份 projection，不提供 V1 alias、translation、fallback 或 caller version switch；
  历史 V1 源码不再由 package exports、应用 composition 或命令入口公开。
- `@iam/user-profile-read-model/subject-facts` 提供同时满足 Facts 与 Freshness ports 的 deep reader：有效 Redis
  record 直读；miss、损坏或未知 schema 按 Subject single-flight 查询一行窄 `user_profile` 并以版本 CAS 回填；
  查询不读取 Legacy `detail`/`search_doc` 或联查源业务表。严格授权每次只从 PostgreSQL 读取权威 Dirty version/status，
  仅 `processed` 且版本相等时放行；缓存落后时最多重载一次 Profile。普通 Profile 不读取 Dirty。
- API production composition 已把 Projection Module 接入 Custom SSO Independent token exchange、
  `/public/user-info` 和 Gateway `/auth/authz`。前两者按当前 Client selection 输出 Custom SSO V2 wire；
  `/auth/authz` 强制收窄为 Subject Identifier 与可选 username/name，并把同一 Base64 值写入 body/header。
  Gateway Local Session 解析形成最小 Subject/client/ORCAS 认证数据，并携带仅供服务端竞态校验的 config version；
  该版本不进入 projection 或 wire。`/public/user-info` 在完整 V2 Interface 返回后、响应交付前再次复查当前
  Client/config version，配置变化时丢弃已构建的 Wire；Gateway Header 继续使用独立最小 mapping、Subject equality 与
  Base64 路径。Client runtime 使用带 generation
  与 mutation fence 的 Redis read-through cache：positive/negative TTL 分别为 30 秒/3 秒，mutation fence 为
  120 秒；既有 Client 的 Admin mutation 在持有 Client row lock 后原子写 fence、递增 generation 并删除 cache，
  commit 后按 token 完成。完成失败时读取保持 fail-closed，fence 自然过期后因旧 cache 已删除而从 PostgreSQL
  自动收敛。新建 Client 尚无可锁的行，不使用 pre-commit fence；它在 commit 后通过 `afterCommit.required`
  递增 generation 并删除 cache，晚到的旧 generation publish 会被拒绝。若该 invalidation 不可用，既有 negative
  cache 只会继续 fail closed 并在最多 3 秒 TTL 后收敛。
  Custom SSO runtime 与协议中性的 Client Traffic Gate 复用同一个内部 generation-fenced mutation
  coordinator；各 runtime 只拥有自己的 key namespace、缓存内容和完成语义，不复制 fence/heartbeat 状态机。
  Traffic Gate 从现有 Client 全局状态派生，只有明确 `Enable` 放行；`Maintenance`、`Disable`、状态缺失/损坏、
  读取失败和 mutation 中均返回可区分的 fail-closed 结果。Admin 状态写入在 commit 后通过
  `afterCommit.required` 原子发布已提交状态并结束 Traffic Gate mutation；发布失败保留 fence，调用方不得把
  Admin 失败响应解释为数据库回滚。
  这是 Transactions 规则中唯一的 pre-commit 外部协调例外，必须同时满足：
  - fence 只保存有界 TTL 的随机 ownership token，不承载业务事实；受保护的 runtime reader 在 fence 存在或状态
    无法确认时 fail closed。
  - 只有既有 Client mutation 使用该例外；transaction 先取得 Client row lock，再在任何业务写入前建立 fence；
    建立失败必须让 transaction 回滚。Client create 不得在无 row lock 时建立 fence。
  - mutation 全程续租 heartbeat，并在 callback 返回、允许 commit 前再次确认 ownership；ownership 丢失必须回滚。
  - 只有 UnitOfWork 已确认 rollback 时，才在 transaction 外停止 heartbeat 并按 token abort；成功路径只通过
    `afterCommit.required` 停止 heartbeat 并按同一 token complete。commit 结果不确定或 after-commit 失败时只停止
    heartbeat、保留 fence，不能把它误当成 rollback 后 abort。abort/complete 失败不得开放读取，只能由 TTL 与
    generation 收敛。
  - begin、abort、complete 对 generation、cache 与 ownership 的变更必须由 Redis 原子脚本完成；其他 Redis/cache、
    通知和 Session 副作用仍遵守普通 transaction/afterCommit 规则。
  Subject Facts cache hit 热路径不访问 PostgreSQL。OIDC Provider production composition 已注入同一 Projection
  Module，并在 Authorization Code 持久化前按当前 client、scope、config version 与 Provider Session binding 创建严格
  Claims Snapshot；Access Token 只转移该快照，UserInfo/ID Token 只重放并复验快照，不重新读取当前主体事实。
  Subject Access Barrier 已接入 API、Admin API 与 OIDC Provider 的 Session Kernel principal validation hook。
  API 的 Custom SSO retryable error adapter 将 Projection Not Ready 与 Subject Access unavailable 分别映射为稳定
  `503` code 和配置的 `Retry-After`，不复用于 OIDC。

- API production composition 直接组装 V2 Facts reader、projection 与 Custom SSO delivery；`/public/user-info` 在 projection
  前后复查同一个 `customSsoConfigVersion`，Gateway Header 仍硬裁剪为 Subject、username/name。Catalog 版本固定在服务端，
  Admin 配置请求不能提交版本字段。Opaque Credential 继续只持有 Principal Session 关联与 mode/config version，UserInfo
  每次按当前 V2 facts 重建，不保存 responsibility snapshot。

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

### Organization Responsibility 解析

- `@iam/organization-responsibility-resolution` 是 Effective Responsibility 与跨树 holder 反向解析的唯一跨 runtime
  seam。调用方显式提供 observation time；resolver 批量返回 Type/target identity，并在引用、父生命周期、Period 或
  Open cardinality 异常时整批 fail closed，不拥有 cache、ACL、Admin history、transport DTO 或 protocol wire。
- User Profile invalidation 使用 transaction-bound resolver，把 Organization subtree 的既有 Employment 用户与
  responsibility target reverse holders 合并后只登记一次 Dirty Version；Catalog 已发布字段/order 变化通过 Type holder
  seam 失效当前 holder。Admin 管理 repository 继续直接读写 Assignment，但不向其他 runtime 暴露其查询规则。
- `@iam/user-profile-read-model` 默认入口生成并读取同一 Dirty Version
  下的 Detail、Search 与 Subject Facts V2，并复用 PostgreSQL atomic publication、Redis monotonic CAS 与严格 V2
  cache/PostgreSQL read-through。Active Internal Detail 与 DSL Search 均只读 `user_profile` 的 V2 row；API 使用独立的
  2 秒 PostgreSQL statement timeout 连接和 5 秒 handler budget，并在 composition shutdown 中关闭该资源。专用 Worker
  Profile V2 maintenance composition 通过
  read-model `worker` subpath 调用批量 V2 backfill、PostgreSQL gate 与 Redis/Subject Access gate；它不启动普通 consumer、
  不应用 client manifest 或推进 epoch。Active Worker consumer、Internal User、Custom SSO 与 OIDC 只发布和读取 V2，
  不允许同一 live User 的 V1/V2 混写、双读或由 caller 选择版本。

### User Profile 失效

- `@iam/user-profile-read-model` 的 transaction-bound `UserProfileInvalidation.recordChanges` 是业务写路径唯一的
  User Profile 失效 seam。调用方只提交 user、employment、organization、position、role、role-assignment、
  organization-responsibility-assignment 或 organization-responsibility-type source change，并在同一 source
  transaction 的领域写入完成后调用。
- 调用方不选择 dirty reason 或 scope，不接触 dirty/affected-user repository、job producer、after-commit
  registration，也不复制 request/trace metadata。业务 service/use case 只接收自己所需的最窄 `recordChanges` port。
- API/Admin API 的 transaction composition 使用当前 transaction `DbClient` 创建 `UserProfileInvalidation`；
  模块内部拥有 tx-bound dirty repository、affected-user repository、role-assignment resolver 和 Organization
  Responsibility resolver。普通 repository
  composition 不创建或暴露这些 projection implementations。
- `recordChanges` 成功表示 dirty fact 已在 source transaction 持久化并登记 rebuild wake-up，不表示 BullMQ 已完成
  入队。提交后的批量 enqueue 是 best-effort；失败由日志和 repair 路径恢复，不回滚业务事实。

### User Profile Subject Facts publication

- Worker claim 在 transaction 外绑定 candidate 的 Dirty Version。Builder 加载全部 Open Employment 及其父对象事实，
  先对 Position 与直属 Organization 执行 fail-closed 完整性守卫，再只投影当前位于 `[startTime, endTime)` 的 Enable
  Employment。它通过 `@iam/role-assignment-resolution` 的唯一 Effective Role seam 取得 assignment/closure 结果，再按
  不可变 `clientCode` 形成最小 Subject Facts；organization path、client、role 和 privilege 均稳定排序，无角色任职
  保留空 authorization 数组。
- PostgreSQL publication 是模块内部 deep seam：transaction 先对目标 dirty row 取行锁并重验同一 user/version 仍为
  processing，再单调 upsert/delete `user_profile`，最后在同一 transaction 标记 dirty processed。过期 candidate
  或低于已发布 `source_dirty_version` 的 candidate 直接丢弃。
- PostgreSQL 提交后，Worker 才把一个 versioned Subject record 发布到 Redis。Redis CAS 以规范十进制字符串比较
  Dirty Version，原子保留较新记录；缓存失败的结构化 warning 只记录 user、Dirty Version、`cacheStatus` 及严格
  白名单化的 error type/code。原始 error、message、stack、Redis command/args 和 Subject Facts record 不进入日志。
  `cacheStatus=failed` 同时进入 processor 结果和 Worker 完成日志，不执行数据库补偿。
  自动恢复由 Subject Facts Reader 的 read-through/cache repair 负责；Reader 只在缓存未命中或不可解析时读取
  `user_profile` 窄行，并继续使用同一版本 CAS publisher。Facts cache 发布成功后，Worker 还通过注入的
  Subject Access repair port 尝试收敛对应账号；repair 失败不回滚已经提交的 Profile 或 Dirty 状态。
- API 与 OIDC composition 为同一 Reader 注入 `subject_facts.operation.observed` logger adapter。事件只含
  `operation`、`outcome`、`durationMs`：区分 cache hit/miss/invalid、Profile/Dirty load、single-flight wait 和
  authorization freshness；不得包含 Subject Identifier、Facts/Dirty payload、Redis key 或 Token。observer 失败不会
  改变认证结果。

### Subject Access Barrier

- `@iam/api-core/subject-access` 是账号实时可访问性的唯一共享 seam。公开 Barrier 只接受严格版本化的
  `enabled`、`blocking`、`disabled` record；缺失、非法内容、Redis 失败和 `blocking` 都 fail closed。
  Redis adapter 独占 record、transition journal、repair ZSET 与 Lua 原子转换；rollback/finalize 只接受同一
  transition ID，repair 不从缺失 record 创建 `enabled`。普通 package export 只暴露 Barrier/lifecycle/repair
  factory、稳定错误和配置所需 port；record serializer、atomic store 结果和 Lua mechanics 保持模块私有。
  Barrier 写 adapter 的基础设施异常统一收敛为无 cause 的 `SubjectAccessWriteUnavailableError`，domain conflict
  仍使用 `SubjectAccessTransitionRejectedError`，原始 Redis error/message 不跨越写接口。
- API、Admin API 与 OIDC Provider 的 Session Kernel composition 都注入同一个 principal validator 形状，因此
  Principal Session、Client Binding 和 Credential 解析在返回调用方前检查 Barrier。`disabled` 形成
  `user_disabled` validation failure 并级联撤销；不确定状态直接传播中性 unavailable error，不触发撤销。
  API/Admin HTTP adapter 分别映射为 `401 / SESSION_INVALID`（清 Cookie）或
  `503 / SUBJECT_ACCESS_UNAVAILABLE`（不清 Cookie）。所有浏览器 Cookie 删除都带原创建路径 `Path=/`、
  epoch `Expires` 与 `Max-Age=0`。OIDC provider middleware 和原生 interaction handler 在协议边界分别映射
  disabled 为 `login_required`（UserInfo 为 `invalid_token`），unavailable 为
  `temporarily_unavailable`；只有 disabled 清除全局 Cookie。
- Admin 用户创建、状态变更、删除与离职 use case 复用同一 lifecycle coordinator：数据库 mutation 前原子
  pre-block，回滚时恢复转换前状态；pre-block 前先独立持久化窄 PostgreSQL transition intent，实际 domain mutation
  与精确 intent 的 `FOR UPDATE`/committed outcome 处于同一 transaction，因此被回收的旧 owner 会在 domain write 前
  被 status fence 拒绝。禁用类提交后 finalize `disabled` 再 best-effort 撤销 Principal Sessions。lifecycle
  disposition 可以由 transaction 结果决定；Admin 状态更新使用 transaction 内的 old/new 状态，同态更新
  `restore_previous`，实际新启用保持 `blocking`，直到当前版本 Subject Facts 发布成功并由 repair finalize `enabled`。
- Worker repair 以 Redis ZSET 为可索引 backlog，通过 PostgreSQL `user` 状态/删除标记核对账号权威状态；启用账号
  还必须证明 `user_profile` 与 processed Dirty version 一致、严格解析 Facts，并成功执行版本 CAS 发布。
  worker 用单个 Lua claim 原子领取所有到期成员并把 score 推进到 lease deadline；并发 worker 不重复领取，
  crash 后 lease 到期重试。deferred/failed 仅在 record 仍是同一 blocking transition 时重排，stable ack 与新
  pre-block 原子线性化，因此旧 worker 不能删除或推迟新 transition。
  从仅有 `idx:repair` 的旧部署滚动升级时，claim Lua 对缺失的 `idx:repair:age` member 做原子惰性补齐，不能因
  指标索引尚未迁移而阻断 repair。旧 entry 的精确首次入队时间不可恢复；迁移后的 entered-at 定义为“当前 legacy
  调度 score 与新 owner 首次观察到的 Redis server time 中较早者”，后续 lease/backoff 只推进调度索引，不重置该 age。
  `user-profile:repair` 的 Subject Access 路径严格分三阶段：先用 PostgreSQL server time 与
  `IAM_WORKER_USER_PROFILE_REPAIR_STALE_SECONDS` 阈值，在单条写事务中按 `update_time`、`id` 有界选取最多
  `--limit` 个 stale `pending` intent，以 `FOR UPDATE SKIP LOCKED` 跳过活跃 writer 并原子改为
  `rolled_back`/`rollback`；该扫描覆盖 Redis 尚未索引的 PG-only gap。之后处理 Redis transition recovery，最后
  运行上述 authority repair。PostgreSQL reaper 失败时命令 fail closed，不执行后续 Redis recovery 或 authority repair。
  `--subject-access-only` 使用不创建 BullMQ Queue、不执行 User Profile maintenance 的窄 command composition，
  但它不是 PostgreSQL 只读路径，也不局限于 indexed Barrier backlog；Worker DB role 必须具有 schema access 以及
  `subject_access_transition` 的 `SELECT`、`UPDATE` 权限，并保留 authority repair 所需读权限。默认模式在 transition
  recovery 后并行执行 Dirty maintenance 与 authority repair；`--stale-before` 只影响 Dirty row，不改变 PG-only
  transition 使用的 server-time threshold。
  仓库不内置 scheduler；部署 owner 必须按文档化恢复 SLO 配置外部周期、stale threshold、`--limit`、重复排空和告警，
  并把 threshold、等待下一轮调度和有界排空三段最坏耗时计入 SLO。
  结构化监控以 `Subject Access stale transition intent reap started` 的 `limit`、`staleAfterSeconds`，
  `Subject Access stale transition intents reaped` 的 `rolledBack`、`limit`、`staleAfterSeconds`，
  `Subject Access transition recovery backlog processed` 的 `prepared`、`rolledBack`、`deferred`、`failed`、
  `limit`，以及 `Subject Access repair backlog processed` 的 `disabled`、`enabled`、`deferred`、`failed`、
  `stable`、`limit` 为准；非零退出或 start 后缺少完成日志表示该轮未完成。请求路径、cache warmer 和 read-through
  都不得把缺失或不确定 Barrier 推断为启用。

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
  PrincipalSession 与实时用户校验、Independent Client Credential、Gateway Local Session、ORCAS、最小 Kernel
  metadata、audit 和失败补偿；共同的 resolved grant 只存在于 implementation 内。运行时不读取、规范化或删除
  Legacy 私有 payload，所有 credential/session 都只保存严格版本化的最小 Kernel metadata。
- Grant 固化已验证的 literal redirect、client mode/config version 与可选 opaque state。Gateway callback 通过
  callback-owned 窄 Client context 重新确认当前全局状态、Custom SSO 启用态、Gateway mode、ORCAS 配置与
  config version；该 context 不暴露通用 Client Secret。redirect 或版本错误在 reservation 前拒绝，因此错误
  callback 不烧码。
- Gateway 与 Independent 共用独立 Grant redemption state machine。`begin` 通过 attempt fence 保证并发兑换只有
  一个赢家；reserved 工作由 heartbeat 定期续租，renew 必须匹配 grant、attempt 和上一 lease deadline，且只延长
  lease、不延长 Grant 原始 expiry。Independent 在任何 Credential issuance、post-validation、Grant consume、成功审计或
  consumed artifact cleanup 前，必须先取得通过 Subject equality 与 strict schema 的完整 V2 Wire；随后只有 Credential
  签发并按当前 Client/Subject Access 复核成功才 consume。Gateway 只有最小 Local Session、可选 ORCAS 和当前 Client
  复核成功后才 consume。消费前
  失败按语义 release，并补偿已创建的 binding/credential；消费后 Session Kernel artifact 清理和成功审计是
  best-effort after-effect。
- Custom SSO Subject Projection 不变量错误按未处理内部错误返回通用 `500`，不增加公开 error code、logger dependency 或
  `Retry-After`。它发生在 Independent Credential issue state 为 `not_started` 时，不创建或撤销 Credential、不 consume、不写
  成功审计，也不清理 consumed artifact；当前 Grant attempt 不主动 release，heartbeat 停止后保持 `redeeming`，仅在 lease
  到期且原始 Grant 未过期时允许新 attempt 接管，且不得延长原始 expiry。Projection Not Ready 与 Subject Access unavailable
  仍保持既有 retryable `503`、`Retry-After` 和立即 release 语义。
- Production adapter 通过 TypeScript structural typing 直接满足上述三个 consumer-owned ports。Composition 只注入
  ORCAS 所需的最窄 `CustomSsoOrcasLoginPort`，不得增加 behaviorless wrapper，也不得恢复公开
  `consumeAuthCode → createLocalSession` 两阶段 interface。
- SSO route 只拥有 HTTP query/header/Cookie 解析、response envelope、Gateway/ORCAS Cookie、redirect query 和
  status 适配，不接触 Session Kernel 模型，也不编排 grant、credential、session、ORCAS 或补偿步骤。
- 现有 Redis key、credential discriminator 和 audit action 不因 module interface 收缩而重命名。维护窗口中的旧 key
  清理由独立运维命令负责；production composition 不注册旧 active session payload reader、normalizer 或 client logout
  notifier。

## Runtime-specific Composition

### OIDC Provider

- `apps/oidc-provider/src/provider/claims.ts` 直接实现 `oidc-provider` claims hooks，属于 protocol adapter。
  Factory、返回类型和 deps type 分别使用 `createOidcClaimsAdapter`、`OidcClaimsAdapter` 和
  `CreateOidcClaimsAdapterDeps`；它不属于 Domain-aligned Application Service。
- OIDC composition 按 ownership 分类：Claims Adapter 与 interaction policy 由 `composition/provider` 物化；
  client auth rate limiter 与 client secret verifier 由 `composition/security` 物化；Session Kernel 与
  `oidcSession` facade 由 `composition/session` 物化。
- 顶层 `createOidcProviderComposition()` 只向 `src/index.ts` 返回 `{ server, logger, shutdown }`。repositories、stores、
  session、security、provider runtime、interactions 与 workers 都由 composition implementation 持有并在内部连接；runtime
  入口只负责监听 server、记录生命周期日志，并把 process signal 或 Node HTTP server error 转交给 `shutdown`；下层 Module
  通过各自的 consumer-owned Interface 测试，不从顶层 composition result 获取内部对象。OIDC protocol 的
  `server_error` 仍是请求级 provider event，只记录协议错误，不触发进程关闭。
- Provider composition 可以显式接收 repositories、stores、security 和 session facades。Claims、interaction policy
  与 interaction handler 直接消费 `session.oidcSession`，不得通过 `services.globalSessionResolver` 或等价 services
  alias 二次分类。
- Claims composition 组合 Subject Access、Subject Facts Reader 与 Client Subject Projection。每个 Provider Session
  binding 以 `(sessionUid, clientCode)` 独立归属；Authorization Code 必须先取得同 client binding 并成功生成严格
  Claims Snapshot，失败时不得持久化 Code。Provider Session 的 authoritative Principal anchor 只由已验证 binding
  建立，Session payload 中的 `kernelPrincipalSessionId` 与 `providerSessionAnchorGeneration` 只是该 anchor 的协议镜像。
  同账号 Principal Session 轮换时，
  interaction policy 只通过窄 port 比较当前或本次已 stage 的 Principal。stage 必须以 oidc-provider 的 `Interaction.uid`
  作为 authorization attempt identity，并绑定 account、client 与已知的 Provider Session uid；首次流程尚无 uid 时显式记录
  `null`。Authorization Code payload 携带同一 attempt identity，Code adapter 通过 Lua 一次性校验并 claim 对应 stage，不能以
  account/client 猜测 stage，也不能用分离的 `GET`/`DEL` 消费。
- Code adapter claim stage 后，由 Session Kernel binding store 以 anchor generation CAS 原子发布新 anchor 与当前 client
  mapping；并发轮换中只有读取同一旧 generation 的一个 attempt 可以提交。静默补建 client binding 只能在读取到的同一
  generation 上 CAS mapping，不能重写或回滚较新的 Principal anchor。发布使用 attempt/mapping owner 幂等确认：Redis 已
  提交但响应丢失时确认现有 owner 并继续；只有确认未提交时才补偿撤销新 binding，结果仍不确定时保留 binding 等待 TTL，
  不得撤销可能已提交的 owner。旧 binding cleanup 必须按 mapping owner compare-delete，并从对应 generation membership
  移除自身；只有该 generation 的最后一个 member 清理且它仍是当前 anchor 时才删除 anchor，不得删除其他 client mapping 或
  后来的 generation。Session artifact 销毁只有同时持有匹配的 Principal Session 与 anchor generation mirror 时才能删除
  authoritative anchor；旧 payload 缺少任一 mirror 时必须 fail-safe no-op，由 bounded TTL 或后续完整 payload 的精确清理收敛。
- 同一 Provider Session 对新 client 静默授权时，Code adapter 必须按精确 session UID/account 读取 authoritative anchor，
  经 Session Kernel 重新校验 Principal、Subject Access Barrier、account 和当前 client config，再创建该 client 的独立
  binding。anchor 不等价于 binding，也不得绕过这些校验。
- Access Token、UserInfo 与 ID Token 复用 Authorization Code 的 Claims Snapshot，并校验 subject、client、scopes、
  Provider Session、Principal Session 与 binding ownership；撤销一个 client lifecycle 不得删除同一 Provider Session
  下其他 client 的 binding。
- `composition/workers` 是 client invalidation subscriber 的唯一 runtime owner。它创建 Redis subscriber，并只注入
  `oidcSession` 与 protocol-object store 的最窄 client revocation 能力：前者撤销当前 OIDC Client Binding 与 Session
  Kernel credential/token，后者清理该 client 的 provider protocol objects。Token store 只在 Redis adapter/store 内部提供
  单 token provider payload 删除，不作为 worker dependency；旧 user/client/global-session token index 不参与 runtime
  注册或撤销。单条消息的 cleanup failure 记录 structured warning，不反向进入 client update transaction。
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
- `createEmploymentCutoverCommandComposition` 是更窄的 PostgreSQL-only composition：只从
  `@iam/user-profile-read-model/worker` 组装 Employment Cutover Verifier 与只读 repository，不构造 Redis、queue、consumer、
  dashboard 或 HTTP server。对应命令仅由运维人员在切换前显式调用，不进入普通 Worker 启动或请求路径。
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
