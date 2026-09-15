# 后端架构

本文记录后端 runtime、依赖方向、composition、事务和关键模块的稳定边界。具体编码方式见
[后端实现约定](../development/backend-implementation.md)，package/database ownership 见
[共享契约与数据库](contracts-and-database.md)，验证通道见 [测试编排架构](testing-architecture.md)。

## Runtime 与 App 边界

| App | Runtime 与职责 | Composition 入口 |
|---|---|---|
| `apps/api` | Bun + Hono public IAM backend，拥有 `/public`、`/open`、`/internal`、`/sso`、`/auth` | `src/app.ts` → `createApiComposition()` |
| `apps/admin-api` | Bun + Hono admin backend，拥有 `/admin` 和 `/rpc`；`/rpc` 对应 `src/routes/trpc/` | `src/app.ts` → `createAdminApiComposition()` |
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
- 外部 side effect 不在数据库 transaction callback 内直接执行；应在 callback 外执行，或注册为
  after-commit task。Client runtime cache 同样只通过 required after-commit invalidation 协调，不存在 pre-commit
  Redis fence 例外；不得把通知、Session 撤销、业务 cache 写入或其他不可逆作用放入 transaction callback。
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

## Admin 同对象写入规范

[ADR-0025](../adr/0025-align-admin-mutation-results-with-committed-facts.md) 已实施，现存 Admin PostgreSQL 写入口及全部 Admin 结果契约已迁移；逐命令与协议/页面 census 见[最终契约核对](../features/admin/admin-mutation-contract.md)：后续新增或修改的 Admin PostgreSQL 同对象写入统一在同一 UnitOfWork 内使用 `SELECT ... FOR UPDATE` 读取目标，再检查前提、判断业务变化、写入并登记审计和 Profile dirty，持锁至事务结束。Organization Responsibility Assignment 已移除 Admin expectedStatus CAS，与级联共用责任集合取锁能力，不按领域维持第二套同对象并发方案。

普通资料编辑本次不增加页面版本校验；只能覆盖请求明确提交的资料字段，生命周期或 Secret 等关联状态使用锁定后的当前事实。锁定命令拟修改的现存目标及级联选中行，只读父对象保留普通预检；多行写入统一安排取锁顺序。创建不存在的目标由既有数据库唯一约束裁决重复并映射已知冲突，不假定已锁住空槽。该规范不替代 Redis Session、Runtime Snapshot、Profile publication 的既有原子机制，也不自动提升跨对象、跨表的完整性保证；实施范围与验收沿 [Spec #95](https://github.com/cyy1998/shgas-iam/issues/95) 跟踪，来源讨论见 [Issue #29](https://github.com/cyy1998/shgas-iam/issues/29)，代码候选与真实部署仍须区分；外部消费者和部署动作见[协调切换清单](../releases/admin-mutation-contract-cutover.md)。

Admin 应用层公共模块统一事务、锁定流程与 `{ changed, result }` 业务结果；repository 提供锁定读取和明确的写入结果，领域拥有合法转换、变化比较及审计内容。数据库基础层提取包含 `cause` 的结构化 SQLSTATE/constraint 信息，由领域 repository 映射已知约束，未知约束不伪装成普通业务冲突。

当前 `services/admin-mutation` 复用 UnitOfWork，提供创建事务与现存目标锁定流程；所有 Admin PostgreSQL 命令均直接使用或通过既有 Client/Subject Access wrapper 适配该模块。创建和 Transfer 保留新资源，密码/Secret 保留必要一次性结果，其他无资源命令返回 `result:null`；普通资料无变化不写审计和 dirty，显式提交状态的所有入口（包括资料更新入口）及 Assignment scope 无变化保留 `changed:false` 意图审计。页面编辑不回填未修改的初始状态。锁后写入零行属于不变量失败，不产生成功审计或 dirty；普通缺失目标和重复删除返回 404。岗位、组织和角色编码的既有全表唯一约束继续覆盖非启用及软删除行，Assignment 保留角色与目标组合唯一约束，由 repository 映射真实 Drizzle 包装错误。

Role 状态变化根据锁定后的当前事实登记 dirty；名称与说明不进入当前 Profile 角色投影，因此这些资料的真实变化只记录审计。Assignment 创建、scope 变化与删除在源事务中登记保存目标的失效，仍由原 resolver 推导受影响用户。Assignment 命令只锁拟修改的 Assignment，Role 与其他只读父对象保持普通预检，不提升跨对象保证。真实 PostgreSQL 测试通过显式事务同步、中间版本的 production Profile publication 和最终 dirty/version 验证角色状态交错，并覆盖 Assignment 删除、创建与重复删除竞争。

Employment 创建、说明编辑、Pause、Resume 与 End 已使用公共 mutation 和统一结果；创建保留 `result:{id}`，其余返回 `result:null`。说明空输入拒绝，同值不写审计或 dirty；合法重复生命周期命令保留 `changed:false` 意图审计，不重写结束时间。真实父、子变化与各自审计及 dirty 在同一事务提交。

基础任职级联采用固定取锁顺序：Employment 在前，Organization Responsibility Assignment 在后，各表均按主键升序。Pause/End 先锁任职，再一次选出本次 Enable/Open Assignment 的 ID，以身份锁定完整选中集合，然后才重验状态、更新父子并记录真实变化。Responsibility repository 的 `lockAssignmentsByIds` 同时为直接责任命令提供集合取锁能力。锁等待期间已经结束的选中责任不会被重新暂停或重写结束时间；后来新插入或从未选中的责任不在该集合中。创建时调整既有 Primary 的路径也先锁完整选中任职集合；不存在的目标与后来出现的 Primary 槽位仍不受行锁保护。

上述方法只锁拟修改目标和级联选中行，User、Organization、Position 等只读父对象仍普通预检。它不防止 phantom，不提升跨表父对象、跨记录 Primary 或请求时 HR scope 的乐观保证。Set/Clear Primary 和 Transfer 也已采用统一结果与意图审计：主任职命令合法 no-op 不登记 dirty，Transfer 返回新任职的 `result:{id}`。这些命令在首次业务行锁前合并 URL 任职与拟清除的既有 Primary ID，一次按 ID 升序锁齐；Transfer 随后锁齐选中责任，才重验状态与候选并原子结束旧任职、结束责任、清除 Primary、创建新任职。审计记录实际清除的 Primary ID，非法重复 Transfer 不改写历史时间。Resignation 已统一 Full Admin 与 HR 的 `{ changed, result:null }` 结果：合法 no-op 保留 `changed:false` 意图审计，不登记 dirty、不重写既有结束时间，仍执行 Subject Access 与 Session 撤销重试。离职依次锁 User、精确 transition intent、按 ID 升序的完整选中 Employment 集合、按 ID 升序的完整选中 Assignment 集合，锁齐后重验 HR 资格，再以同一事务提交业务事实、审计及 dirty。该锁定范围仍仅覆盖拟修改的现存行与级联选中行，不提升上述乐观保证。离职在 pre-block 后、数据库事务前通过外层 Subject Access adapter 与 Kernel 的 `prepareUserSessionRevocationByContext` 计划原始读取合法已存在 Principal Session 的上下文，不做访问校验或触发 cleanup；提交后将捕获代际与 callback 的前代合并，按代际集合精确撤销。重试重新捕获遗留旧代，晚到撤销保留重新启用后的新代。准备失败仅记录 bestEffort 诊断并退回 callback 前代撤销，不阻断业务；本次未知的更早代留待后续重试。该读取不是全局原子快照：捕获后才落库的更早代极迟在途 Session 由下一次重试或访问校验处理，已 tombstone 对象的派生清理仍属既有 cleanup owner。

组织省略初始状态时以 Enable 创建，显式非 Enable 输入被拒绝；成功创建原子完成路径及闭包关系。父组织保持普通预检，Open Employment、子组织与 Open Responsibility 的既有生命周期和安全范围阻断继续生效，不增加全父树锁或跨表强保证。

公共模块把确认提交后的 `AfterCommitRequiredTaskError` 映射为 `ADMIN_MUTATION_COMMITTED`，普通失败原样保留；当前岗位、组织与角色切片只有既有 bestEffort Profile 唤醒，不新增 required 副作用。User 创建、显式状态命令、删除与 Resignation 通过公共 `runAdminSubjectAccessMutation` 保持既有 Subject Access lifecycle；仅在源事务成功返回后发生的 lifecycle 失败映射为同一已提交错误，事务回滚错误保持原对象以供 lifecycle 确认。User 页面自动刷新已提交事实并保留修复提示，不自动重放；生成密码未交付时提示先修复再主动重置。Client 基础管理也已迁移该错误契约与实际详情恢复；OIDC 与 Custom SSO 专项结果也已迁移，均在锁定事实下比较配置并返回安全 Client 与明确授权的 Secret 结果。Custom SSO 相同规范化配置与合法重复启停/移除保留意图审计和 required Snapshot invalidation，不推进 epoch 或撤销会话；当前配置修改及 Secret 轮换不要求先禁用，Maintenance 不阻止合法准备操作。User 创建返回安全用户对象与原有生成密码，密码重置返回新密码，均置于统一 result 内；密码哈希不进入响应或审计。用户名预检覆盖软删除行，repository 仅映射已知用户名唯一约束。User 资料空更新拒绝，同值普通资料不写审计/dirty；显式状态仍保留 lifecycle 和意图审计，专用状态与删除也返回统一结果；删除按 User 行、精确 transition intent 的次序加锁，检查未删除目标和 Open Employment，并验证实际软删除返回行。该顺序与资料状态命令一致；只读 Employment predicate 保持既有跨表乐观边界。reset 取得 User 行锁后仍执行 Enable 且非删除的 guarded update，保留当前会话例外和 bestEffort 撤销。

直接 Responsibility 创建、Pause、Resume 与 End 已采用同一公共 mutation 结果：创建保留 `result:{id}`，生命周期返回 `result:null`。直接命令先按 ID 锁定 Assignment，再普通读取父对象并校验双端授权与转换；与任职级联共用 `lockAssignmentsByIds`，不反向锁父 Employment。合法 no-op 保留 `changed:false` 意图审计且不新增 dirty，非法终态转换返回 409。Open slot 唯一约束继续裁决创建竞争；真实 Drizzle 已知约束按 Full/HR 映射稳定安全冲突，未知约束不掩盖为领域冲突。

Client 基础创建/list/兼容 ID 编辑与 Internal API credential 保留；统一 `ClientSso` management 拥有单协议配置、
启用意图、SSO Secret、状态与删除。锁定 Client 后比较规范化事实；合法显式 no-op 仍审计并失效 Snapshot。
配置、启停、Secret 轮换和协议选择不自动撤销会话，永久终止由 Session management 捕获精确实例表达。
当前 Secret 与 Internal credential 分离；普通 detail 不带敏感值，超级管理员窄读取需留审计。

数据库提交后 required Snapshot invalidation 及 generic InternalAuthz code/secret cache 失效各自执行；
未知 COMMIT 保守失效，已提交传播失败保留修复提示，不自动重放写入。详情与页面使用安全 mutation DTO。
相关真实 PG/Redis composition 位于 `apps/admin-api/test-integration/composition/client-sso-snapshot.integration.test.ts`。
岗位、组织、Role、Role Assignment 及上述 User、Employment、Responsibility 命令及 Client 基础、OIDC 与 Custom SSO 命令的 REST、legacy、tRPC 和页面已协调修改；整个集成分支的混合中间态不得部署，外部 REST 调用方核验仍是最终切换前的责任。

成功业务结果通过现有 REST envelope 或直接通过 tRPC 返回，并协调切换调用方。状态/生命周期、主任职、授权、协议、凭据及会话命令的合法 no-op 保留意图审计，普通资料无变化不记变更审计。保留的 Client Runtime invalidation、提交后传播失败的专用错误语义及一次性 Secret 恢复由 ADR-0025 统一约束。

Internal Privilege Delegation 已在 API 自身的 service、repository 与 UnitOfWork 中实现 [ADR-0026](../adr/0026-serialize-privilege-delegation-writes-by-delegator.md)：创建先锁委托人 User，更新仅预读不可变委托人 ID，取得 User 锁后再锁定、重读完整委托及权限绑定；候选校验、冲突检查、业务事实与成功审计在同一事务完成。该领域的协调锁扩展不自动改变上述 Admin 通用范围。同一委托人的未结束委托仅在权限、闭区间期间及组织覆盖范围都相交时冲突；Pause 占用期间，同组织或祖先与下级范围互斥，不相交范围可并存，不引入覆盖优先级。Disable 后仅纯重复结束合法且不重写业务行；Internal 保留详情/boolean 响应，handler 只传入 actor 与请求上下文，不在提交后另写成功审计。该能力不依赖 Admin mutation 模块、不登记 Profile dirty，也不提升其他引用对象的生命周期保证；现有 resolver 继续 fail closed。

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

- `@iam/client-subject-projection` 通过单一 `PermittedClientSubjectProjectionService.resolve` Interface 隐藏 Catalog
  校验、Subject Facts 读取、client 裁剪、稳定排序与投影组装。调用方只提交 Subject Identifier、`clientCode` 和
  `SubjectClaimSelection` 与本操作许可证明；facts/permission dependencies 只在 factory 处注入。
- Subject Facts port 只暴露已发布 Profile 与有效任职事实，不暴露 Legacy User Detail。普通 Profile 与
  `iam:authorization` 统一消费取得的合法已发布 Facts，允许源权限已改变但重建未完成或持续失败时仍交付旧权限，
  不再查询 Dirty 或执行 Authorization Freshness Barrier。Facts 缺失或主体错配时整份投影失败；
  撤权传播不承诺固定期限，第三方复制后自行刷新，见 [ADR-0032](../adr/0032-consume-published-subject-facts-for-authorization.md)。
- 核心投影保持协议中性。`@iam/custom-sso/wire` 只公开一个完整 V2 交付 Interface：
  `resolveCustomSsoSubjectProjection` 先调用 root Projection Service，再核对返回的 Subject Identifier 与 resolve input，
  随后执行 wire mapping 和 strict schema parse。Schema、Wire 类型与 placeholder preview
  继续公开。Subject mismatch 产生只含安全 reason `subject_mismatch` 的内部不变量错误，mapping/parse 失败产生
  `invalid_wire`；resolve 阶段的既有错误原样传播。该 subpath 只能通过 package root public Interface 取得 Projection
  类型或能力，不得导入其他 core subpath、Facts persistence、client 配置、runtime 或 transport。
- Package root 是唯一 active V2 projection Interface；Custom SSO wire 只从 `@iam/custom-sso/wire` 公开。Catalog V2 保持既有 claim vocabulary，
  选择 `profile:employments` 时每条 Employment 原子携带 canonical `responsibilities`/`[]`；authorization employment
  继续只含 Employment identity、roles 与 privileges。Custom SSO 的 `/wire` 拥有 V2 strict schema/mapper，缺失、
  未知或非法 responsibility 拒绝整份 projection，不提供 V1 alias、translation、fallback 或 caller version switch；
  V1 投影、wire 与演练源码已移除。
- `@iam/user-profile-read-model/subject-facts` 只公开 Facts read 能力：有效 Redis record 直读；miss、损坏、
  未知 schema 或主体错配按 Subject single-flight 查询一行窄 `user_profile` 并以版本 CAS 尽力回填；
  回填失败仍可使用合法数据库 Facts。Redis 读取故障直接失败，不触发回源；数据库错误沿用既有失败路径。
  查询不读取 Legacy `detail`/`search_doc`、Dirty 状态或联查源业务表，数据库行缺失或无效时返回 Projection Not Ready。
- API 默认 composition 组装 Root authentication、Custom SSO 与 OIDC，Kernel 只管两类会话，协议各自管 Code/Token。
  Client Snapshot 一次取得当前状态和单协议配置，Secret 由独立认证能力读取；操作接受后不追溯重查配置。
  访问必须验证 UserSession/ClientSession 关系及 Subject Access。SSO disable/maintenance/config/secret 维护与显式撤销分离。
- Custom SSO token/UserInfo 按当前 Client selection 输出 V2 wire；Gateway authz 强制裁剪 Subject、username/name，
  body/header 使用同一 Base64 值。单 callback 决定托管或业务接入，不再接受 mode/logoutEndpoint。
- OIDC 的 Code 保留原 redirect/scope/nonce 等授权事实；UserInfo 使用当前 Client 披露范围和已发布 Facts，
  ID Token 固定签发内容并排除 IAM 扩展声明，不再持有 Claims Snapshot。OIDC HTTP、Cookie、错误与进程生命周期由 API 拥有。
- Snapshot `control/payload/credential` 由 API Core `client-snapshot` 独占。成功 invalidation 阻止晚到旧回填；
  传播失败可能继续读到旧已发布事实，required 提示和显式 repair 保持。旧三类 Snapshot/Gate 不进入在线图。
User Profile 的初代 V1 builder、Facts reader/publisher 与 Subject Projection 切换实现已移除。
当前 Worker 通过 `createCurrentUserProfileProjectionBundle` 直接组装 V3 builder、原子 publication 与 Facts publisher；
查询 DTO 由 `query/user-query.schema.ts` 拥有，readiness 继续复用版本无关校验规则。

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
- Admin Organization Responsibility 管理由同一个 `AdminOrganizationResponsibilityAuthorization` deep seam 统一表达
  `full` 与 `scoped`。有效 `iam:hr-admin` 的 scoped read scope 在 SQL pagination/cursor 前同时约束 holder Employment
  Organization 与 target Organization，并以 `AND` 组合；Create、Pause、Resume、End 在事务内复查同一双端条件。
  任一端越界对 detail/mutation 返回 404 concealment，拒绝日志只记录稳定 operation/resource/reason，不记录 Assignment、
  holder、Organization path 或 scope/root 集合。`iam:admin` 以及 mixed-role actor 继续走 full 分支。
- Assignment view/detail 的 `allowedActions` 是服务端事实，综合当前 scope、lifecycle、parent integrity 与隐藏 blocker；
  Organization lifecycle 的不可管理开放责任使用稳定 `UNMANAGEABLE_RESPONSIBILITY_BLOCKED` reason，安全 cardinality
  conflict 不暴露被隐藏记录。请求时 scope 每次从 PostgreSQL Effective Role/Employment/Organization Path 解析，撤权后的
  下一请求立即收敛。
- `@iam/user-profile-read-model` 默认入口生成并读取同一 Dirty Version
  下的 Detail、Search 与 Subject Facts v3，并复用 PostgreSQL atomic publication、Redis monotonic CAS 与严格 v3
  cache/PostgreSQL read-through。Active Internal Detail、canonical Filter DSL、Internal/Public legacy adapter 与 Delegation
  基础搜索均只读同一个 `user_profile` v3 row；API 使用独立的 2 秒 PostgreSQL statement timeout 连接和 5 秒 handler
  budget，并在 composition shutdown 中关闭该资源。Worker 通过版本无关的 `user-profile:backfill`、`user-profile:repair`
  与 PostgreSQL/Redis readiness 命令复用普通 dirty/job/publication 路径；命令不应用 client manifest 或推进 epoch。Active
  Worker consumer、Internal User、Custom SSO 与 OIDC 只发布和读取 v3，不允许同一 live User 混写、双读、fallback 或由
  caller 选择版本。Client Protocol V2 仍是独立版本边界。

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
  `operation`、`outcome`、`durationMs`：区分 cache hit/miss/invalid、Profile load 与 single-flight wait；不得包含 Subject Identifier、Facts/Dirty payload、Redis key 或 Token。observer 失败不会
  改变认证结果。

### Subject Access Barrier

- API、Admin API、Custom SSO 与 OIDC 已统一使用每操作一次的 Subject Access Permission。
  `createSubjectAccessOperations({ barrier, revocation })` 提供 `run(callback)`（自动关闭）和
  `createOperation()`（调用方在 `finally` 关闭）。可信认证后用 `acquireForAuthentication` 取得新代际，
  只读对象解析后用 `acquireForSession` 比较已有 context；同一个 pending Promise 固定成功、拒绝与暂态失败。
  无主体和未解析出可信身份的无效凭据可以零读取结束；并行回调共享检查，新请求重新检查。
- `requireSubjectAccessOperation` 拒绝缺失、伪造和已关闭容器，`requirePermission` 验证同主体的已有许可；
  `getSubjectContext` 只接受该容器创建的许可。不同主体或代际直接拒绝，不换身份重查，也不向后台转交许可。
  `encodeSubjectAccessContext` / `parseSubjectAccessContext` 严格编码 JSON string 中的
  `{ version: 1, subjectIdentifier, transitionId }`。缺失、坏 JSON、额外字段、非法 UUID 或不支持版本失败关闭，
  不按当前 Barrier 补齐；持久化 context 不是许可。
- 许可成功后账号进入 blocking、disabled 或重新启用，不推翻本次判断；迟到签发沿用原代际。
  下一调用重新检查，重新启用不恢复旧代。对象存在、到期、撤销、消费、归属和并发冲突仍由 Kernel 校验。
- 明确拒绝使用 `SubjectAccessOperationDeniedError`：旧代撤当前根，disabled 按原凭据 context 精确撤销，
  新认证尚无旧代时不撤销。撤销或 cleanup 失败仍拒绝。`createSubjectAccessSessionRevocation` 在 Subject Access
  内将代际翻译成不透明 context，Kernel 不解释账号含义。blocking、缺失、坏记录和 Redis 故障不撤销、不清 Cookie。
- Admin authentication 在管理员可信 Principal 解析后、资料和 REST/tRPC 业务处理前取得许可。
  资料只按 Subject Identifier 查询；缺失仍是既有未登录结果，角色、scope 和目标用户业务状态保持独立。
  session-management 使用中性 inventory/control 返回未过期、未撤销的 Principal Session Record，
  不读取目标 Barrier，不触发账号拒绝清理。User、Client 和 Resignation 经统一 Session Revocation adapter 执行终止。
  prepared 读取失败保持 bestEffort 诊断和 callback 前代 fallback；空集合不扩大撤销，新代不受晚到清理影响。
  完整入口、故事核对和人工证据边界见[最终契约](../features/sso/subject-access-operation-contract.md)。
- `@iam/api-core/subject-access` 是账号实时可访问性的唯一共享 seam。公开 Barrier 只接受严格版本化的
  `enabled`、`blocking`、`disabled` record；缺失、非法内容、Redis 失败和 `blocking` 都 fail closed。
  Redis adapter 独占 record、transition journal、repair ZSET 与 Lua 原子转换；rollback/finalize 只接受同一
  transition ID，repair 不从缺失 record 创建 `enabled`。普通 package export 只暴露 Barrier/lifecycle/repair
  factory、稳定错误和配置所需 port；record serializer、atomic store 结果和 Lua mechanics 保持模块私有。
  Barrier 写 adapter 的基础设施异常统一收敛为无 cause 的 `SubjectAccessWriteUnavailableError`，domain conflict
  仍使用 `SubjectAccessTransitionRejectedError`，原始 Redis error/message 不跨越写接口。
- API/Admin HTTP adapter 将明确拒绝映射为 `401 / SESSION_INVALID`（清 Cookie），暂态为
  `503 / SUBJECT_ACCESS_UNAVAILABLE`（保留 Cookie）。Cookie 删除保持 `Path=/`、epoch `Expires` 和 `Max-Age=0`。
  OIDC Subject Access 明确失效在 Token 返回 `401 / login_required`，UserInfo 返回 `401 / invalid_token`，
  暂态失败返回 `503 / temporarily_unavailable`；只有明确失效清全局 Cookie。`invalid_grant` 属于已消费 Code
  重放等协议拒绝，不是 Token 的 Subject Access 错误映射。原生 handler 继续保留各自路由错误契约。
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

- `createUnifiedSessionKernel` 是唯一在线中性工厂，从 `@iam/session-kernel` 根出口消费。Kernel 只拥有 UserSession/ClientSession，
  不依赖 API Core、协议或 app。新根显式接收不透明 subjectContext，应用关系继承原根与主体，调用方不能替换。
- 根期限由统一认证 env 决定且固定不滑动，ClientSession 期限受根上限约束。Redis 原子状态拥有时间、关系、open 复用、
  实例观察与撤销；协议 Token 不放入 Kernel，不使用旧四对象或配置代际比较。
- Subject Access 由 API Core 的每操作容器拥有；首次可信主体取得许可后固定结果，在途不重新判账号状态。
  新操作再次取许可，并验证 Token 自身及 UserSession/ClientSession。缺失、损坏或未知关系失败关闭，不误清暂态 Cookie。
- 四认证用例保留身份验证、限制、AMR、Origin 和审计，通过 API root-authentication composition 创建 UserSession。
  `global_session` Cookie 是浏览器根；新授权复用有效根，续接事实由所属协议保存。普通登录参数不能绕过 guard。
- Root security 供 Admin/本人安全/账号 lifecycle 复用；禁用、删除和离职按原 Subject Access transition 规则处理。
  Prepared 只捕获合法原上下文，损坏结果不伪造空集合；明确原代际撤销保留重新启用后的新代。
- 管理查询是中性索引观察，不给目标账号发许可，不把 total 当完整在线人数。撤销捕获精确 identity，
  用户/根/应用关系结果与失败、未知、剩余原集合分开。原请求重试不重选新实例，根终止后 Token 在线访问拒绝。
- 同根与子对象的作用不是一般事务；不承诺第三方本地退出或可靠后台补齐。Code/Token TTL、同步精确补偿、
  独立维护与 #121/#145 剩余责任见[统一维护手册](../releases/unified-session-maintenance.md)。
- `/maintenance` 与 `/testing` 分离；source decoder 只在显式停 writer 后处理固定旧布局，不能在线探测/转换旧关系。
  当前 API/Admin/Worker 同一生产图只消费一代；环境切换仍需人工发布验收。
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
- 解除意图只调用共享 `clearLoginState` 原子删除限制、当前失败历史与限制索引成员，返回 `{ changed, result:{ failureStateCleared:true } }`；自然过期或并发处理返回 `200 / changed:false`。它不调用 Session inventory/control，
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

- `@iam/custom-sso` 完整操作拥有授权、续接、Code 唯一消费、Token、交付、ORCAS 和本次 Token 补偿。
  单 callback 决定托管/业务路径，不再接受 mode/logoutEndpoint；原 Code purpose 固定，后续配置不能绕过业务 Secret。
- 业务兑换先认证当前 Client 并精确定位原 ClientSession，再消费 Code。适用门槛后失败在本请求内有界尝试终止原实例，
  不恢复 Code、不重放成功结果；失败与未知保留真实副作用报告。错误 Client/用途不会撤销无关实例。
- 托管回调保持 #186 已交付的同步外部/签发/补偿语义，不强加业务兑换失败撤销。ORCAS 响应丢失可能已有外部作用，
  实际幂等与退出由 #145/外部 owner 负责。当前审计保留 historical gateway/independent 标签，不构成配置字段。
- 取得 Client Snapshot 和 access 后交付 capability 复用同一观察，Mapper 不重新读 Client；根 UserInfo 独立 Client 校验保持。
  真实 I/O、唯一消费、替换保护和 Token 补偿不能作为重复内存判断删除，#155 清单在统一维护手册。
- API route 只负责 HTTP、Cookie、错误/redirect，完整操作处理内部顺序。协议 `/wire` 是浏览器可用纯出口，
  `/maintenance` 负责离线库存；当前 Code/Token 与旧 Grant decoder 各有明确布局，不混读或复制旧状态。
## Runtime-specific Composition

### API OIDC

API composition 装配 `@iam/oidc` 的授权、Code、Token、续接、UserInfo 与退出确认；旧独立 app 已删除。
HTTP adapter 保持外部 issuer 和 `/oidc` 各路径，负责 Cookie、标准错误、CORS 与重定向，协议包不依赖 HTTP/DB/app/Custom SSO。

Code 保留首次接受的授权事实并由所属 owner 原子消费；认证和原实例定位后的失败有界处理原 ClientSession。
Token 使用校验自身与两类会话关系及当前 Client/Subject Access；UserInfo 使用当前披露和已发布 Facts，
不保存 Claims Snapshot，已签发 ID Token 内容固定。取消只消费退出确认，确认作用于请求当前根，不新增多标签页保证。

API env 注入 current/previous RS256 JWK，JWKS 只输出公钥；非法配置启动失败。`/health`、`/oidc/health` 检查 Redis，
`/ready` 检查 PG 与 Redis；进程关闭由 composition/lifecycle 释放 server 和连接。依赖失败保留可恢复 Cookie并返回暂态。
安全 `oidc_protocol_error`/`oidc_server_error` 日志由 API 写出，Gateway `/oidc` 路由只改 upstream 为 API。
具体配置、密钥轮换、当前协议接口和人工边界见[OIDC 接入](../features/oidc/oidc-integration.md)与[发布手册](../releases/oidc-release-runbook.md)。
### Worker

- Spec #178 的新维护由 Worker `online-auth:state` 只通过公开 owner 组合 source/unified inventory、CAS apply 和只读 verify；
  Kernel、OIDC、Custom SSO 分别拥有 decoder、索引及终态，不导入 app 私有状态。OIDC 的冻结旧 Provider decoder 仅由
  `/offline-maintenance` 出口消费，在线 factory 不探测旧布局。新 `client-snapshot:repair/verify` 只消费 API Core 新 Snapshot
  维护出口；三个 CLI 默认读取 `apps/worker/.env`，已有进程环境变量优先，使用 Worker 资源变量连接、限制 deadline 并在结束时断开资源。它们没有 HTTP、队列或 PG 连接，
  也没有可靠后台执行器。完整 owner、旧命令替代和人工边界见[统一维护手册](../releases/unified-session-maintenance.md)。

- `apps/worker/src/modules/registry.ts` 定义稳定 `WorkerModule` contract：`key`、`queueRegistrations`、
  `startConsumers()` 和 `close()`。具体 queue/processor implementation 由对应 public workspace package 提供。
- `createWorkerComposition` 拥有 runtime、已构造 modules、module selection、dashboard queue selection、HTTP server
  和 shutdown。未知 module key 在启动时失败；consumer 按配置启动，module 按反向顺序关闭。
- `src/http/` 只提供 health/readiness 与可选 Bull Board，不是业务 API。Readiness 由 composition 注入依赖检查和
  module 状态；Bull Board 只接收 module 显式注册的 queues。
- `createWorkerCommandComposition` 使用 `commandOnly` 模式复用 DB/Redis/module wiring，但不启动 consumers、不注册
  dashboard queues，也不启动 HTTP server；`src/commands/` 的 backfill/repair entrypoints 使用该入口。
- 当前 Snapshot repair/verify 使用独立 Redis-only composition，普通/敏感 payload 共享控制，targeted 与 full 分开，
  full 必须停流，另起进程 scan-only verify；旧三类 Runtime command 已删除。Client 业务升级使用 PostgreSQL-only
  `client-sso:upgrade`，最终 DDL 前固定旧扩展期制品完成 apply/verify。命令不重放业务写入或提供通用可靠执行器。- `createEmploymentCommandComposition` 是更窄的 PostgreSQL-only composition：只从
  `@iam/user-profile-read-model/worker` 组装 Employment Verifier 与只读 repository，不构造 Redis、queue、consumer、
  dashboard 或 HTTP server。对应命令仅由运维人员按需显式调用，不进入普通 Worker 启动或请求路径。
- `audit:actions` 是独立 PostgreSQL-only 一次性命令，入口直接拥有单连接与关闭，不加载 Worker composition barrel。
  固定八映射不依赖 runtime aliases；只读 inventory/verify 与持写锁事务 apply 的门禁见
  [审计规范化手册](../releases/audit-action-canonicalization.md)。当前代码候选已删除运行时别名，Admin 按精确 action/outcome 查询；目标环境迁移与代码交付分开。
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

- Bun runtime apps（`apps/api`、`apps/admin-api`、`apps/worker`）的 `tsconfig.json` 包含 Bun types。
- App-local maintenance scripts 属于非生产工具。新增 `scripts/` 时，在 `tsconfig.json` 中排除该目录，并在 ESLint
  配置中忽略 `scripts/**`。API、Admin API 已预留这些模式；Worker 使用 production
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
