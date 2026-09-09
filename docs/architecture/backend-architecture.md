# 后端架构

本文记录后端 runtime、依赖方向、composition、事务和关键模块的稳定边界。具体编码方式见
[后端实现约定](../development/backend-implementation.md)，package/database ownership 见
[共享契约与数据库](contracts-and-database.md)，验证通道见 [测试编排架构](testing-architecture.md)。

## Runtime 与 App 边界

| App | Runtime 与职责 | Composition 入口 |
|---|---|---|
| `apps/api` | Bun + Hono public IAM backend，拥有 `/public`、`/open`、`/internal`、`/sso`、`/auth` | `src/app.ts` → `createApiComposition()` |
| `apps/admin-api` | Bun + Hono admin backend，拥有 `/admin` 和 `/rpc`；`/rpc` 对应 `src/routes/trpc/` | `src/app.ts` → `createAdminApiComposition()` |
| `apps/oidc-provider` | Node.js 24 + `oidc-provider`，拥有标准 OIDC protocol、interaction、session 和 store runtime | `src/index.ts` → `createOidcProviderComposition()` |
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

公共模块把确认提交后的 `AfterCommitRequiredTaskError` 映射为 `ADMIN_MUTATION_COMMITTED`，普通失败原样保留；当前岗位、组织与角色切片只有既有 bestEffort Profile 唤醒，不新增 required 副作用。User 创建、显式状态命令、删除与 Resignation 通过公共 `runAdminSubjectAccessMutation` 保持既有 Subject Access lifecycle；仅在源事务成功返回后发生的 lifecycle 失败映射为同一已提交错误，事务回滚错误保持原对象以供 lifecycle 确认。User 页面自动刷新已提交事实并保留修复提示，不自动重放；生成密码未交付时提示先修复再主动重置。Client 基础管理也已迁移该错误契约与实际详情恢复；OIDC 与 Custom SSO 专项结果也已迁移，均在锁定事实下比较配置并返回安全 Client 与必要的一次性 Secret。Custom SSO 相同规范化配置与合法重复启停/移除保留意图审计和 required Snapshot invalidation，不推进 epoch 或撤销会话；启用时真实配置修改及 Secret 轮换仍须先禁用，Maintenance 不阻止合法准备操作。User 创建返回安全用户对象与原有生成密码，密码重置返回新密码，均置于统一 result 内；密码哈希不进入响应或审计。用户名预检覆盖软删除行，repository 仅映射已知用户名唯一约束。User 资料空更新拒绝，同值普通资料不写审计/dirty；显式状态仍保留 lifecycle 和意图审计，专用状态与删除也返回统一结果；删除按 User 行、精确 transition intent 的次序加锁，检查未删除目标和 Open Employment，并验证实际软删除返回行。该顺序与资料状态命令一致；只读 Employment predicate 保持既有跨表乐观边界。reset 取得 User 行锁后仍执行 Enable 且非删除的 guarded update，保留当前会话例外和 bestEffort 撤销。

直接 Responsibility 创建、Pause、Resume 与 End 已采用同一公共 mutation 结果：创建保留 `result:{id}`，生命周期返回 `result:null`。直接命令先按 ID 锁定 Assignment，再普通读取父对象并校验双端授权与转换；与任职级联共用 `lockAssignmentsByIds`，不反向锁父 Employment。合法 no-op 保留 `changed:false` 意图审计且不新增 dirty，非法终态转换返回 409。Open slot 唯一约束继续裁决创建竞争；真实 Drizzle 已知约束按 Full/HR 映射稳定安全冲突，未知约束不掩盖为领域冲突。

Client 基础创建、code 编辑、legacy ID 编辑、状态和删除已通过公共 mutation 统一结果与锁定流程。Client target-bound wrapper 仍是唯一 Snapshot 失效与未知 COMMIT 保守失效 owner；公共模块适配其单一事务，不启动嵌套 UnitOfWork。锁定 legacy ID 后使用 canonical code 写入，编码保持不可修改。基础资料同值不写审计或重写时间；显式状态及通用凭据意图保留 `changed:false` 审计，所有合法公开 mutation（包括 no-op）仍 required invalidation。真停用推进两个协议 epoch 并 bestEffort 撤销，重复停用不制造新生命周期事件。OIDC configure、enable、disable、remove 和 rotateSecret 同样复用公共锁；配置按规范化集合比较，锁后保留当前 enabled 与 Secret，合法同目标命令只记无变化意图并执行 required invalidation，不推进 epoch 或撤销会话；非法状态转换返回 409。显式轮换始终更新 Secret；配置首次生成及轮换均在 result 中保留安全 Client 对象与一次性 Secret。提交后交付失败只保留修复提示与主动轮换恢复路径，不提供明文补领。Client 的这些基础字段不进入当前 User Profile 投影，不新增 dirty。创建的全表编码唯一约束覆盖软删除占用，只映射已知约束；缺失目标返回 404，锁后零行失败关闭。

Client required after-commit 失败映射公共 `ADMIN_MUTATION_COMMITTED`，未知 COMMIT 原错误与保守失效路径保持。Client 页面自动读详情且持续显示尚需修复的传播提示，创建以已知 code 恢复，删除后的 404 也不清除提示；不自动重发 mutation。协议页面同时识别该共享失败语义，一次性 Secret 未交付时保留主动修复和重新轮换流程。真实 PostgreSQL 证明竞争、审计回滚与提交边界，PG/Redis composition 通过真实 ClientService 和三个公开 Reader 证明已提交后的旧 Snapshot 窗口与 no-op required invalidation；它不证明生产环境已修复。

Client 协议配置撤销固定本次 `RETURNING` 新行中的 canonical Client 与版本边界，仅选择 `< V` 的对象；停用/删除分别
携带两个协议版本。Kernel 显式批量接口由协议公开 selector 解释必要 metadata，选择后保留原序列化观察值用于 CAS，
各子对象独立选择，旧 Binding 不无条件级联新代。未知版本跳过并聚合诊断，在线仍拒绝；Admin 未装配的 cleanup adapter
继续产生 pending，单次枚举不保证排空极迟旧写入。完整 owner、no-op/unknown COMMIT 和验证边界见
[Client 协议版本撤销](../features/admin/client-protocol-revocation.md)。

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
- API production composition 已把 Projection Module 接入 Custom SSO Independent token exchange、
  `/public/user-info` 和 Gateway `/auth/authz`。前两者按当前 Client selection 输出 Custom SSO V2 wire；
  `/auth/authz` 强制收窄为 Subject Identifier 与可选 username/name，并把同一 Base64 值写入 body/header。
  Gateway Local Session 解析形成最小 Subject/client/ORCAS 认证数据，并携带仅供跨请求凭据校验的 config version；
  该版本不进入 projection 或 wire。Authorize、callback、token、`/public/user-info` 与 Gateway `/auth/authz` 各自在
  request boundary 分别固定协议配置和 Gate 的首次结果（含并行进行中、拒绝与暂态失败），并把该 request capability 贯穿 Session Kernel 与 delivery；一旦接受，
  当前请求不会在 artifact/credential/projection 副作用前后重读 generation 或当前 Client。并发 mutation 只影响后续请求，
  已签发凭据仍在下一次独立请求按当前 Snapshot 校验。已确认旧代对象精确撤销，高于本操作配置的对象只拒绝并保留，错误用途不清可恢复 Cookie；详细顺序与证明范围见 [Custom SSO 操作契约](../features/sso/custom-sso-protocol-validation.md)。Gateway Header 继续使用独立最小 mapping、Subject equality 与
  Base64 路径。Custom SSO Runtime 已使用 `@iam/api-core` 的 Client Runtime Snapshot Module：API composition 注册
  `custom-sso` canonical Adapter，并通过绑定 kind 的窄 Reader 取得 present/absent Snapshot；positive/negative TTL
  分别为 30 秒/3 秒。Adapter 只拥有 PostgreSQL loader、strict codec 与 TTL，业务调用方不接触 control、generation、
  Redis key 或 Lua。共享 required invalidation 成功后，late source result 不能发布；Snapshot acquisition unavailable
  映射为既有 Custom SSO typed retryable error。Admin Client mutation 的 canonical freshness seam 是 target-bound wrapper
  注册的 `clientRuntimeInvalidation` required task；Custom SSO 在线 mutation 不再写 legacy cache/generation/mutation key，
  也不再建立 ownership fence、续租 heartbeat 或执行 settlement。旧 Custom SSO Runtime key 已退出当前
  repair/verify inventory；旧部署或备份的迁移须另行安排。
  协议中性的 Client Traffic Gate 使用同一 Client Runtime Snapshot Module：API 与 OIDC Provider composition
  各自注册 `traffic-gate` canonical Adapter，并通过绑定 kind 的窄 Reader 取得 Gate Snapshot。Adapter 从 PostgreSQL
  Client 全局状态派生 `enabled`、`maintenance`、`disabled` 或 `deleted`；只有明确 `enabled` 放行，absent、source/Redis/CAS
  失败与无法取得可信 control 均映射为通用 unavailable 并 fail closed。成功取得的 normal 或 Maintenance Snapshot 对当前
  请求保持有效，不在后续协议副作用前重新校验 generation。
  Admin Client mutation 不再建立 Traffic Gate pre-commit reserve，不持有 ownership token，也不运行 heartbeat、
  complete/abort 或 settlement。target-bound wrapper 在 commit 后执行 required client-wide Snapshot invalidation；成功传播后
  后续 Gate acquisition 重新取得 PostgreSQL 当前事实。若 PostgreSQL 已提交但 invalidation 失败，Admin 返回 required
  after-commit error，既有正常 Snapshot 仍可被新请求取得并放行，直到显式 targeted repair；这不回滚数据库事实，也不
  改变协议 Session、Credential 或 artifact revocation 规则。旧 Traffic Gate Runtime key 同样不参与在线读取、mutation
  correctness 或当前 repair/verify。
  Subject Facts cache hit 热路径不访问 PostgreSQL。OIDC Provider production composition 已注入同一 Projection
  Module，并在 Authorization Code 持久化前按当前 client、scope、config version 与 Provider Session binding 创建严格
  Claims Snapshot；Access Token 只转移该快照，UserInfo/ID Token 只重放并复验快照，不重新读取当前主体事实。
  Subject Access 由 API、Admin API 与 OIDC Provider 的操作容器统一检查，Kernel 不再调用账号验证。
  API 的 Custom SSO retryable error adapter 将 Projection Not Ready 与 Subject Access unavailable 分别映射为稳定
  `503` code 和配置的 `Retry-After`，不复用于 OIDC。

- API production composition 直接组装 User Profile v3 Subject Facts reader、Client Protocol V2 projection 与 Custom SSO
  delivery；`/public/user-info` 与 Gateway Header 都复用 request boundary 已接受的 Runtime Snapshot，且 Gateway Header
  仍硬裁剪为 Subject、username/name。Catalog 版本固定在服务端，
  Admin 配置请求不能提交版本字段。Opaque Credential 继续只持有 Principal Session 关联与 mode/config version，UserInfo
  每次按当前 User Profile v3 Subject Facts 重建 Client Protocol V2 输出，不保存 responsibility snapshot。
  `custom_sso_config` JSONB、Admin detail/audit、runtime context 与 Client Protocol cutover manifest 均不再携带 per-Client
  Catalog marker；历史 key 由 schema migration 删除，旧配置输入和旧 manifest 字段由 strict parser 拒绝。

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

- Custom SSO 的唯一工厂 `createCustomSsoOperations` 用 `forOperation` 绑定显式容器。
  授权和续接在可信根解析后检查，授权早于 renew/Artifact；兑换与 callback 在 Artifact 的 mode、Client、redirect、
  版本及主体一致性校验后、Grant 消费前检查，ORCAS 出站与签发均在其后。authz 和 Public UserInfo 在首次可信
  Credential/根解析后检查，父对象和延迟交付复用许可。退出走中性终止能力，不要求目标许可。
  API composition 把此工厂和同一 Kernel 接到 services、use-cases、routes 与 middlewares；Public 容器覆盖 `next()`
  及延迟交付，结束后关闭。缺少许可没有 fallback。
- `createPermittedClientSubjectProjectionService` 是唯一投影工厂，`resolve(input, proof)` 通过注入的窄
  `assertPermission` 证明当前许可，不独立读取 Barrier。已发布 Facts、主体一致性、选择和
  wire 规则保留。ORCAS 的 `findOrcasUserBySubjectIdentifier` 按可信主体查 ID，再复用 Profile 来源裁剪资料，
  不以 status/isDelete 推翻许可；不影响其他用户业务查询。
- `createSessionKernel` 是唯一中性工厂。新根必须显式接收 `subjectContext`；Binding、Credential 和带主体 Artifact
  原样继承，续期不修改，派生调用不能替换父 context。无主体 Artifact 无此要求。Kernel 不调用账号 validator/fence，
  不解释 Subject Access 代际，不持有 HTTP 容器，也不补齐缺失内容。
  `revokeUserSessionsByContext` 与 `prepareUserSessionRevocationByContext` 按完整不透明 context 集合选择对象；
  空捕获不变全用户撤销。Prepared 的原始读取不是全局快照，捕获后新建的同 context 根在执行时仍可选中。
  全部旧工厂策略、专用字段/选项和双表示已退役；旧在线状态按[维护手册](../releases/subject-access-operation-cutover.md)
  在停流排空后清理，消费者统一版本并重新登录。代码候选不表示环境已完成切换。

- `@iam/session-kernel` 独占四类生命周期、配置、三个 Kernel 日志事件、存储与 Lua。根入口只公开生命周期能力和必要配置/接口类型，`/maintenance` 提供当前 namespace inventory，`/testing` 提供测试构造、种子与检查。Kernel 不依赖 API Core、Custom SSO 或 app；连接和日志实例、协议 cleanup 由 composition 注入；协议配置校验由各协议 owner 拥有，不再注入 Kernel。旧 API Core Kernel 出口与实现已删除，不保留兼容转导出。

- API 的四类身份认证统一由 `use-cases/authentication/` 拥有，production wiring 在
  `composition/use-cases/authentication.ts`。密码、手机、OA、微信只消费各自的 Principal Session 创建 port；
  `services/authentication/principal-session.adapter.ts` 直接使用同一 Session Kernel，负责 `browser_user`、AMR、
  Session Origin 与创建结果/错误映射，不构造 Custom SSO facade。身份解析、凭据校验、登录限制与认证审计继续由
  原用例拥有；OA/微信的 HTTP 路径和 Cookie 仍由 SSO route 适配。Custom SSO facade 不再提供根会话创建成员。
- Custom SSO 登录续接仍通过协议 owner 校验 Client、Traffic Gate 和 redirect，再以 Kernel 检查 Principal Session；
  `inspectPrincipalSession` 因仍有该协议消费者而保留。它只读、失败关闭，不续期、不创建 Credential，也不加载主体投影。
- Session Kernel 的 Principal Session、Client Binding、Credential 与 Protocol Artifact 使用 Redis 时间计算生命周期期限；
  读取通过同一次 Redis 原子观察取得对象和当前时间，成功结果的 `observedAt` 是该观察的毫秒时间。
  签发派生对象与续期复用取得时的观察，校验通过后不按应用时钟或再次取得的当前时间追加到期拒绝；
  后续对象缺失、撤销、消费和 CAS 冲突仍可阻止操作，不恢复已消失的对象。`authTime` 保留应用记录的原认证事件时间。
- 续期以 active payload CAS 维护对象与索引；有 token lookup 的对象还校验 lookup owner 和 lookup tombstone，并同步延长 lookup。
  共享索引不设置由某个成员决定的 TTL，读时按 Redis 时间清理到期 score；pending cleanup tombstone 在外围清理成功前保持存在，
  成功后按 Redis 时间恢复其原 tombstone 期限或删除。Credential 正常新签发使用服务端 UUID，内部已知 identity 与不确定写入补偿保持。
- 上述 Kernel 契约由 [ADR-0027](../adr/0027-own-online-authentication-lifecycle-time-in-redis.md) 和 #116 落实；
  #158/#159 让两种 Custom SSO Grant 直接使用 Kernel Artifact 的 Redis deadline 与原子消费，不再初始化独立 redemption。
  Independent 响应 TTL 与 Gateway Local Session Cookie 的 Max-Age 从 Credential `expiresAt - observedAt` 向上取整为秒，
  亚秒有效结果仍交付一秒，不以取整或应用时间追加过期拒绝，也不延长 Redis 中的期限。ORCAS Cookie 保持原外部集成契约。
  Independent 签发后与 Local Session 认证中的父 Session 读取继续保护对象存在和撤销，并复用本操作许可；这些独立操作仍可因真实缺失失败。
  每个兑换 attempt 的服务端 UUID 在签发前固定，不确定写入仍按同一 identity 精确补偿；后续 attempt 使用新 UUID。
  #118 已让 OIDC store 在一次 Redis Lua 写入中以 Redis 时间计算主对象、UID/user-code lookup 与 Grant/Client 索引的相同期限，
  共享索引只延长到期时间，短成员和重复写入不会缩短长成员的追踪期限。清理与盘点读取实际对象，清理不按应用时间裁剪成员；
  payload CAS、lookup owner 比较和已有 Kernel/config 校验保持。此保证覆盖正常新写入，不自动发现或修复历史已丢索引的孤立对象。
  #119 将 mapping 发布/刷新改为 Kernel 毫秒绝对 deadline，anchor 与 generation membership 只延长期限。
  staged binding 以 Redis TIME 和 Principal deadline 的较小值限制最长 60 秒，并与索引原子写入；claim 后不按应用时间复查。
  每次未消费 Code 读取重新取得 Kernel Principal 的 `expiresAt - observedAt` 并向上取整，供本次 AccessToken/IdToken TTL 使用；
  该观察不持久化；已消费 Code 返回原消费标记供 provider 拒绝回放并撤销关联 Grant，不要求已删除的 Kernel artifact 提供签发期限。
  Code、AccessToken 与 Grant 的 opaque 模型只在本次 Redis adapter 取得成功时沿用有效结果，
  不再由模型的本地 `exp` 校验推翻；后续读取仍须经过 Redis 存在性、Kernel 和配置校验。JWT `exp`、`auth_time` 保持协议语义。
  已取得的 Grant 增补 scope 后再保存时，Lua 保留 Redis 当前绝对期限并要求对象仍存在，不消费模型按应用时钟计算的 remainingTTL。
  #120 最终核对补齐 Session/Interaction 的取得时有效观察：Interaction 更新与 Session.persist 保留原 Redis deadline；
  Session.save(configuredTTL) 保持 rolling 续期，同 identity 已缺失时失败；瞬时标记不持久化。
  42 条故事与证据见[最终契约核对](../features/oidc/online-auth-redis-time-contract.md)。
  `online-auth:state` 人工命令直接扫描当前 Kernel/Grant/OIDC owner 固定键族，清理无索引孤立对象，并要求新进程独立 verify；
  不写 PostgreSQL，不改变正常按 owner index 的业务撤销。代码迁移不代表维护切换已执行，执行边界见
  [维护手册](../releases/online-auth-redis-time-cutover.md)。

- Admin `services/user/**` 和 `services/client/**` 的会话终止只经过 consumer-owned Session Revocation port。
  只有 `services/session-revocation/**` 与 `composition/**` 直接持有 Session Kernel、OIDC runtime、concrete
  session adapter 或 app-local Redis runtime dependency。
- `@iam/session-kernel` 拥有用户根 Principal Session 的实时 inventory。默认全局索引为
  `sess:v2:idx:principal_sessions`，member 沿用 lifecycle object 编码，score 为 `expiresAt`；创建、续期和撤销
  Principal Session 时，对象与该索引必须在同一 Redis transaction 中变化。
- Inventory 只返回 `principalType=user` 的未过期且未撤销根记录，并通过全局索引或精确用户索引按 `expiresAt` 倒序分块读取；
  查询先批量清理到期 score，遇到悬空成员时删除并继续补足当前页，不执行 Redis `SCAN`。上线前未进入全局索引的旧
  会话不在读取时回填，只有后续续期才进入。
- Admin `services/session-management/**` 只通过消费方拥有的 inventory/control port 读取或撤销 Principal Session Record，并通过一次批量用户摘要 port 补充正常、暂停、结束、已删除或未知账号状态。用户摘要基础设施错误正常
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
- 单会话与用户级撤销统一返回 `{ changed, result }`；result 保留 scope、实际撤销数量、当前根会话例外和 cleanup 数量，
  changed 仍只依据实际撤销数量。Redis 管理命令不进入 PostgreSQL 公共行锁流程。
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

- `packages/custom-sso/src/index.ts` 的 `createCustomSsoOperations` 是完整应用入口，拥有 authorize、Independent
  exchange、Gateway callback、续接检查、Public Authentication/UserInfo、Gateway authz 与 logout。原三个授权/兑换
  use case 与 session adapter 位于包内 `internal/`，旧 Grant 库存维护位于 `grant/`；在线消费由 Kernel Artifact 拥有，签发中间态和补偿不作为生产公开操作。
- 独立 `@iam/custom-sso/cleanup` 接收 Redis 并内部构造 Grant store；API/OIDC 先构造 cleanup，再注入 Kernel，API 最后构造完整 Custom SSO。OIDC 不加载或构造完整协议操作。`/maintenance` 提供 owner prefix、旧库存 decoder 与目标判定，`/testing` 提供实际测试所需构造与检查；各出口不经 root，浏览器只消费 `/wire`。
- 模块内校验 Client mode/version/Secret、redirect allowlist，并解释 Traffic Gate 结果；外部能力由自有窄 ports
  表达，Client Runtime/Secret reader、Secret hash verifier、ORCAS、User lookup、审计 writer、logger 和 Kernel
  由 API composition 注入；Redis 仅由 cleanup/maintenance 消费。模块不导入 API provider、repository、composition 或 HTTP；连接生命周期仍在 API。
- 续接检查仅返回 `absent | invalid | valid`；API 门户用例将结果映射为页面 decision 和 Cookie 清除指令。
  UserInfo capability 在模块中捕获已接受的 Client Snapshot；API 的 WeakMap request scope 仅负责请求对象绑定与释放。
  Gateway 最小字段裁剪和 base64 编码由模块拥有，HTTP adapter 负责 header/body、Cookie 与 Retry-After 映射。
- 内部 session implementation 拥有一次性 grant resolution、PrincipalSession 与实时用户校验、Independent Client
  Credential、Gateway Local Session、ORCAS、最小 Kernel metadata、协议 audit 和失败补偿；resolved grant 不跨模块公开。
  运行时不读取、规范化或删除 Legacy 私有 payload，credential/session 只保存严格版本化的最小 Kernel metadata。
- Grant 固化已验证的 literal redirect、client mode/config version 与可选 opaque state。Gateway callback 通过
  callback-owned 窄 Client context 使用本次操作首次取得的全局状态、Custom SSO 启用态、Gateway mode、ORCAS 配置与
  config version；该 context 不暴露通用 Client Secret。redirect 归属不符、或对象版本高于本操作配置时，在消费
  前拒绝并保留 Code/Grant；确认归属且对象版本低于本操作配置时，在消费前拒绝并精确撤销已观察的 Artifact，
  旧 redemption 由其 cleanup owner 清理，不影响其他对象。不能把所有版本不符统一解释为“不烧码”。
- Independent 与 Gateway 使用 Kernel `consumeProtocolArtifact(code, purpose, observed)` 作为唯一消费权威；完整已观察 payload、lookup 和
  tombstone 的原子比较保护替换、撤销与并发唯一赢家。成功消费同时删除该 Artifact 的 active/lookup 与精确索引成员，保留
  consumed tombstone 供重放拒绝。消费报错或结果不明确不进入投影或签发，不新建恢复记录。
- Independent 前置 Client/用途/mode/redirect/版本、根会话、Gate 与 Subject Access 通过后消费，再构建和严格验证完整 V2
  主体，最后以写前新 UUID 签发 Credential。消费后任何错误不恢复 Code；未进入 Credential 写入时不创建补偿 identity。
  写入结果不确定或签发后可处理失败按本次 identity 同步尽力撤销，失败不换 identity 重签、不建立队列或最终补偿承诺。
  签发后的父会话存在与主体一致性保护保留；全程复用当前操作许可和配置/Gate，不增加响应前业务复查。
- Independent 的 Projection Not Ready 仍为暂态 `503`；投影不变量或格式错误仍为通用 `500`，不新增公开字段或内部原因。
  两类失败均要求重新授权，token 的 `Retry-After` 表示新授权前的等待；UserInfo/authz 继续原凭据重试。成功审计是 best-effort，
  其失败不撤销可交付 Credential。未交付 Credential 保留 `extend_with_principal`，受根绝对期限、版本、账号与撤销约束。
- Gateway 在前置校验与根主体一致后消费，成功才执行适用的 ORCAS，然后以写前新 UUID 签发 Local Session；签发后保留父会话
  存在与主体一致性检查。ORCAS 或签发失败不恢复 Code，同步尽力补偿仅处理本次 Credential；ORCAS 外部成功但响应丢失仍可能
  留下会话，新授权可能再次登录，外部幂等/撤销归 #145。callback 保持 JSON 失败与既有 Cookie/redirect/state，用户返回业务应用
  重新访问，不刷新旧 callback 或自动循环授权。在线 reservation/lease/heartbeat/release/takeover 与固定租约配置已删除。
- 维护 owner 保留 `authorization-grant:redemption:v1:` 的 issued/redeeming/consumed 库存 decoder、精确 removal 与 cleanup ref。
  `/maintenance` 的 `decodeCustomSsoLegacyGrant` 严格核对 key/record identity，`isCustomSsoAuthorizationArtifact` 判定 active
  或 tombstone 的 custom-sso/auth_code；不凭业务索引发现全部目标。两种模式的新 Artifact 均不带 redemption cleanup ref；旧三状态由 testing 专用 fixture 构造。
  #160 已通过 OIDC `custom-sso:grants` 组合 Kernel `/maintenance` 的无索引 Artifact authority/lookup 扫描、已观察四值 CAS 和精确索引成员删除，
  以及 Custom SSO `/maintenance` 的旧三态扫描/CAS。inventory/verify 独立只读 factory 仅持 SCAN/GET，apply 才持 eval；
  未知归属、损坏状态、比较/扫描失败均非成功，不能触及 Principal、Credential、OIDC 或以成功计数推定核验。
  仅在停旧 writer、排空后且启新 writer 前使用；保留集外部基线对照和能力退役条件见[定向维护手册](../releases/custom-sso-grant-maintenance.md)。
- 内部 state implementation 通过 structural typing 满足三个操作的私有 ports；外部 ORCAS/User/audit/logger
  provider 直接满足模块自有 ports。不得恢复公开 `consumeAuthCode → createLocalSession` 两阶段 interface。
- SSO route 只拥有 HTTP query/header/Cookie 解析、response envelope、Gateway/ORCAS Cookie、redirect query 和
  status 适配，不接触 Session Kernel 模型，也不编排 grant、credential、session、ORCAS 或补偿步骤。
- 现有 Redis key、credential discriminator 和 audit action 不因 module interface 收缩而重命名。旧 Session cleanup 命令已退役，旧环境或旧备份的迁移须另行安排。
  当前维护保留 Kernel 撤销/pending cleanup 与协议 owner 的精确 artifact 清理；后者保护 Principal Session，不是全量 reset。
  Production composition 不注册旧 active session payload reader、normalizer 或 client logout notifier。

## Runtime-specific Composition

### OIDC Provider

- 在线 Kernel 解析要求预期 protocol/type，已知 Client 时一并匹配；用途拒绝早于 Subject Access。
  OIDC owner 校验 Binding、Code、AccessToken 和 Return Handle 的配置版本。Binding 的 mapping/anchor、Code 的已认证
  Client/redirect、Return Handle 的浏览器/回调归属先于永久清理。永久失效调用 Kernel 的已观察对象精确撤销，暂态
  Gate/读取失败保留对象与可恢复 Cookie。Artifact 消费携带同一已观察对象，CAS 不重新选择替换对象或复查期限。
  Code 同时保留首次 Provider payload：消费前核对其字节，再消费同一 Kernel Artifact，最后 CAS 写入 Provider 消费标记。
  替换对象不能取得旧请求的消费标记；普通读取的版本失败清理也按首次 Provider payload 原子比较删除，保留替换对象及其标记。
  两个 owner 的状态转换仍不是一般原子事务，双状态恢复由独立议题拥有。
  Kernel cleanup 回调取得瞬时 `deleteOwnedKeys` 能力：仅在 lookup 已移除且 lookup tombstone 仍等于原撤销对象时原子删除
  Code/Token payload 与消费标记；当前或已消费的新 owner 均使旧清理成为无作用操作。pending cleanup 重试重新绑定原
  tombstone 的同一约束，不新增持久字段，不退回无条件删除；Binding mapping 继续使用其原有 owner compare-delete。
  显式整 Client/协议管理撤销仍独立存在；Admin 配置变更已使用固定提交版本选择，见[版本撤销契约](../features/admin/client-protocol-revocation.md)。
  高于本操作配置版本的对象只拒绝并保留，不能由版本不等推断永久失效。

- OIDC 的正式 Session/Provider 工厂统一拥有操作许可链。Provider middleware 在 `ctx.state` 专用槽建立容器，
  回调通过公开 `Provider.ctx` 桥接，finally 删除槽并关闭；原生 interaction、login guard、resume 各自显式 `run`。
  可信 Principal、Binding、Credential 或有主体 Artifact 解析后检查，早于 renew/stage/claim/签发。
  `load_account` 早于 policy，因此账户 hook 先解析当前根并取得许可，再读资料；已许可 reader 不按账号状态过滤。
  Claims 与 Token extra 交付必须持有活跃许可，结束后捕获的 callback 不再有效。
  同一 operation 的各个 facade 共享配置与 Gate 各自首次 Promise；版本从本次完整配置派生，成功、拒绝和暂态失败均固定。
  原生 `run` 的私有 ALS 把同一 operation 传给 Provider 原生方法间接调用的 storage callbacks，结束时关闭，不能供后台任务复用。
  Provider Client、Session/Interaction/Grant/Code/Token adapter、Claims、policy 与原生 handler 均接入；退出读取保持中性许可语义。
  两类 Snapshot 不构成原子联合事实，不增加提交或响应前复查；完整边界与验证见 [OIDC 操作契约](../features/oidc/oidc-operation-snapshots.md)。
- 未消费 Code 的 `AuthorizationCode.find` 在可信 Artifact/Principal 解析和许可成功后才返回 Provider；
  `consume` 在写消费标记前也要求该解析成功。UserInfo 首次 Credential 解析检查早于 Binding mapping 刷新。
  后续 consume、findAccount、Claims 和签发复用许可。已消费 Code 直接返回消费标记供 Provider 拒绝重放并撤销
  Grant 及关联协议载荷，不要求已消失的 Artifact 或本次许可。无主体 Return Handle 和退出保留中性路径。
  Client/config、scope、Facts 可用性与对象归属仍独立生效。

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
  经中性 Session Kernel 校验 Principal，并在当前操作取得或复用 Subject Access Permission，再校验 account 资料和当前 client config，再创建该 client 的独立
  binding。anchor 不等价于 binding，也不得绕过这些校验。
- Access Token、UserInfo 与 ID Token 复用 Authorization Code 的 Claims Snapshot，并校验 subject、client、scopes、
  Provider Session、Principal Session 与 binding ownership；撤销一个 client lifecycle 不得删除同一 Provider Session
  下其他 client 的 binding。
- OIDC artifact 生命周期不再与 Runtime cache invalidation 通过 Pub/Sub 串联。Admin mutation 仍通过 Session Kernel
  revocation seam 撤销当前 OIDC Client Binding 与 credential/token；Provider protocol object 在读取时使用本操作首次
  `oidcConfigVersion` fail closed，并由其 store 删除确认过期的对象，高于本操作版本的对象保留。显式 Client Protocol artifact cleanup 继续由独立
  maintenance command 拥有，不作为 Runtime Snapshot invalidation 的在线副作用。旧 OIDC Runtime key 已退出当前
  Snapshot Module 的 repair/verify inventory。
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
- `createClientRuntimeRepairCommandComposition` 位于独立 composition 子模块，只创建有界连接的 Redis client 和
  Client Runtime Snapshot maintenance 窄 Interface；它不经过普通 Worker composition barrel，因而不静态加载数据库、
  UnitOfWork、ClientService、Reader Adapter、queue 或业务 mutation owner。`client-runtime:repair --client-code
  <clientCode>` 原子推进目标 Client 的共享 control 并删除三类 payload；重复执行保持安全。命令只输出包含 canonical
  `clientCode` 的低熵 completed/failed report，observer/report logger 失败不反转已完成 repair。Full restore repair 与
  targeted 模式互斥并要求显式停流确认；它以 `SCAN` 和分批 `UNLINK` 只清理当前 Module-owned Snapshot namespace，
  部分失败后可以从头重跑。独立 `createClientRuntimeVerifyCommandComposition` 只注入 scan-only verifier，不持有 eval、
  unlink 或 repair capability；`client-runtime:verify` 在新的 Worker process 只读重扫同一 inventory，只有完整扫描且 owner key
  为零时退出 0。两类 full command 的 safe report 以 status 为 gate，计数只用于诊断，不声称证明停流、drain、
  业务可用或旧 namespace 已清空。当前 namespace 中的 `v1` 是有效存储版本；七条旧 OIDC、Custom SSO 与 Traffic Gate
  pattern 已退出维护 inventory。当前恢复步骤见[恢复手册](../releases/client-runtime-snapshot-restore.md)，旧备份迁移须另行
  固定适用候选与操作边界，不允许旧 reader/writer 混跑。
- `createEmploymentCommandComposition` 是更窄的 PostgreSQL-only composition：只从
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

Spec #157 的全部 56 条故事、20 项实现和 10 项测试决定见[一次消费最终账本](../features/sso/custom-sso-one-shot-grant-contract.md)。
#161 在正式 HTTP/Redis 上组合定向清理、独立核验、同根新授权与已有凭据访问；完整 OIDC 保留集复用 #160。
统一 writer/consumer、基线、停流排空、smoke 与回退见[保留会话升级手册](../releases/custom-sso-one-shot-grant-upgrade.md)，目标环境未执行。
