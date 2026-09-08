# HR Organization Responsibility Administration 设计

## 状态与目标

本设计已经实现并由 Full-system E2E 验证。部署中的所有有效 `iam:hr-admin` 通过既有 `admin.organizationResponsibility.*` operations 获得当前 HR Administration Scope 内的组织责任管理能力；该能力不使用 feature flag，不创建 HR 专用角色，也不改变数据库 schema。

领域语义以根目录 `CONTEXT.md` 的 **HR Organization Responsibility Administration** 为准；架构决策见 [ADR-0018](../../adr/0018-authorize-hr-organization-responsibility-by-both-endpoints.md)。Assignment 模型与请求时授权边界继续分别遵守 [ADR-0014](../../adr/0014-model-organization-responsibility-as-employment-bound-fact.md) 和 [ADR-0017](../../adr/0017-centralize-admin-role-policy-with-request-time-scope.md)。

## 授权契约

`iam:admin` 保持全局能力。只有能够从 PostgreSQL 当前 Effective Role、Effective Employment 与 Organization Path 成功解析 HR Administration Scope 的 `iam:hr-admin` 才获得 scoped 能力；多角色仍取并集。

对任一 Assignment，令：

- `H` 为 holder Employment 所属 Organization；
- `T` 为 target Organization；
- `S` 为 actor 当前 HR Administration Scope 中全部 Organization 的并集。

纯 HR 的可管理条件固定为 `H ∈ S AND T ∈ S`。`H` 与 `T` 可以位于不同 Scope Root；不要求同根。该条件同时用于列表、搜索、详情、创建、Pause、Resume、End 和 Ended 历史读取，不按 action 改变量词。

| 能力 | `iam:admin` | 纯 `iam:hr-admin` |
|---|---|---|
| Type Catalog | 全局只读 | 有有效 HR scope 时全局只读 |
| Assignment 列表、搜索、详情 | 全局 | 仅双端均在当前 scope |
| 创建 Assignment | 现有全局行为 | 所选 holder 与 target 均在当前 scope |
| Pause、Resume、End | 现有全局行为 | 当前 Assignment 双端均在 scope |
| Ended 历史 | 全局 | 按请求时当前双端 scope |
| 跨 Scope Root 任命 | 允许 | 两端分别在 scope 即允许 |
| 自己作为 holder | 允许 | 不特殊处理，满足相同规则即允许 |
| Assignment 操作日志 | 允许 | 不授予；隐藏操作日志 Tab |
| 全局 Audit 模块 | 允许 | 不授予 |

既有业务规则全部保持：Type Catalog 只增不减且不可管理；创建只接受 Enable holder Employment 与 Enable target Organization；Assignment 三项绑定不可编辑或删除；Pause 仍占 cardinality 槽位；End 不可恢复；Resume 重新检查父对象和 cardinality；Employment、Organization、User 级联及 User Profile invalidation、审计写入继续原子执行。

## Deep module 与 seam

外部 Interface 继续使用现有 `admin.organizationResponsibility.*` REST/tRPC operations，不新增 `/hr` route、HR router 或调用方声明的 scope。Admin adapter 只负责输入适配、operation classification 和取得请求上下文。

在现有 Admin Authorization Policy seam 增加 `AdminOrganizationResponsibilityAuthorization`。它是一个 full/scoped 联合，向应用层只公开三个概念：

```ts
interface AdminOrganizationResponsibilityAuthorization {
  readonly kind: "full" | "scoped";
  readonly readScope: OrganizationResponsibilityReadScope;
  getAllowedActions(
    facts: AdminOrganizationResponsibilityActionFacts,
  ): AdminOrganizationResponsibilityAllowedActions;
  denyMutation(input: AdminOrganizationResponsibilityMutationDenial): never;
}
```

`OrganizationResponsibilityReadScope` 是 repository adapter 消费的内部 seam；scoped adapter 必须把同一个 `organizationIds` 集合分别应用到 holder Organization 与 target Organization，并以 `AND` 组合。Route、React 页面和调用方不得读取数组后自行重建 predicate。删除这个 module 时，full/scoped 分支、双端量词、denial logging 和 concealment 会重新散落到所有查询与命令，因此该 Interface 有足够 Depth。

`getAllowedActions` 同时观察 scope facts、Assignment lifecycle 与现有 parent integrity facts。`denyMutation` 统一记录 actor、operation、resource type、有限 resource identifier 和稳定 reason，不记录 scope/root 集合；越界时抛出 not-found error，其他状态拒绝沿用现有领域错误。Full 与 scoped 共用相同 Interface 和测试 surface。

## 请求与数据流

```text
REST / tRPC operation
  -> generic Admin operation gate
  -> Admin Authorization Policy resolves full/scoped authorization
  -> Organization Responsibility service or use case
  -> scoped repository query or transaction-bound resource guard
  -> existing domain transition, audit, dirty registration and commit
```

Generic operation gate 把全部 `admin.organizationResponsibility.*` IDs 加入 HR operation 集合，但只证明 actor 具有有效 HR scope；它不证明具体 Assignment、target 或 holder 可访问。资源授权必须留在后续 deep module 中。

### 查询

- `listTypes` 只需要有效的 module capability，不带资源范围。
- target-scoped list 与 global search 都在 SQL `WHERE` 和 cursor/page 计算前应用双端 `AND` scope；调用方传入的 target、employment、type、lifecycle filters 只会继续收窄结果。
- 禁止先取全局页再在内存删除越界项；那会造成空洞页、错误 cursor 和存在性泄露。
- target-scoped list 的越界 target 与 global search 的越界 filters 返回空结果；Assignment detail 任一端越界返回 404。
- Ended Assignment 使用 holder Employment 与 target Organization 当前保留的组织关系判断，不保存授权或路径快照。
- 读取继续执行现有 Assignment Integrity fail-closed 检查。

### 创建

Create use case 接收 authorization，在既有 UnitOfWork 内读取 holder Employment、其 `organizationId`、target Organization 与当前状态。顺序为：确认资源存在、执行双端 scope guard、执行现有 parent/cardinality 规则、插入 Assignment、写审计和 dirty registration。任一端越界时不进入写入、副作用或业务冲突分支，并以 404 conceal existence。

前端目标组织选择继续复用 scoped Organization selector；holder 选择继续复用 `searchEmployments`，显式请求 `EmploymentStatus.Enable`。现有两个 selector 已由 Admin Authorization Policy 限制在 HR scope，服务端 Create guard 仍是权威校验。

### 生命周期命令

Pause、Resume、End use case 在事务内复用级联的集合取锁能力，先按 Assignment ID 锁行，再普通读取父对象组成 lifecycle context，并扩充 holder 与 target 的 Organization IDs。scope guard 必须发生在 transition/no-op 判断之前，因此当前 scope 已丢失时，即使重复已完成命令也返回 404。通过 guard 后根据锁定状态判断转换；合法重复命令返回 `changed:false` 并保留意图审计，不新建 dirty 或改写结束时间；非法转换返回 409。只读父对象保持普通预检，不因直接命令增加父行锁，也不防止新 Assignment phantom。

HR scope 仍在事务外按请求时 PostgreSQL 事实解析，再传入事务；授权通过后发生的并发撤权不会中止当前事务，后续请求才观察新范围。本设计不声称 commit-time linearizable 或 serializable。

## 响应与前端

通用 service、路由与权限 UI 规则见 [前端架构](../../architecture/frontend-architecture.md#管理路由与权限)。

`AdminCapabilitySummary` 作以下扩展：

- 有效 HR 的 `visibleModules` 增加 `organizationResponsibility`；
- `collectionActions` 增加 `organizationResponsibility.create`；
- 无有效 scope 继续 fail closed；mixed `iam:admin` + `iam:hr-admin` 继续得到 full capability。

创建成功返回 `{changed:true,result:{id}}`，Pause、Resume、End 返回 `{changed,result:null}`；REST 保留 envelope，tRPC 直接返回业务结果。列表和各嵌入入口统一区分已修改与无需修改，并刷新事实。

Admin Assignment view/detail 增加服务端计算的 `allowedActions.pause/resume/end`。React module 不再只根据 status 推断按钮；按钮使用 `allowedActions`，mutation 后重新加载列表和详情。服务端每次 mutation 仍重新授权，响应 capability 不是凭据。

HR 可访问独立 Organization Responsibility Assignment 页面，也可在 Organization、Employment、User 详情中看到责任入口。
所有入口复用同一 scoped service；holder 与 target selector 只展示当前 scope 候选，允许从不同 Scope Roots 选择两端。
holder 在 scope 但 target 越界，或 target 在 scope 但 holder 越界的 Assignment 都不显示。Assignment drawer 的 Audit Tab
按 `canAccessAudit` 隐藏，纯 HR 不展示全局 Audit 菜单；不新增 scoped audit operation，也不开放 `admin.audit.search`。
不可管理的隐藏 blocker 只显示下一节规定的稳定安全文案，不渲染 Assignment、holder 或范围外 Organization。

## 越界阻塞与错误语义

完整管理员可能已经创建一端位于 HR scope 外的 Open Assignment。它仍参与全局 cardinality 和 Organization integrity：

- scoped 列表和详情不返回该 Assignment；
- HR 创建冲突时返回稳定且安全的说明：责任槽位已占用；如果当前列表没有可管理记录，联系完整管理员；
- Organization 生命周期被此类 Assignment 阻止时，allowed action 使用稳定的不可管理责任阻塞 reason；
- 响应与日志不得包含 Assignment ID、holder、范围外 Organization、path 或 scope/root 集合；
- DB unique race 按 Full/HR 安全映射已知约束：Full Admin 保留 cardinality conflict，HR 的 single slot 竞争使用不可管理责任的通用阻塞说明；不在已失败事务继续读取 blocker，不为分类阻塞来源增加父行锁、提高隔离级别或自动重试。

详情和 mutation 的范围拒绝统一使用内部 `RESOURCE_OUT_OF_SCOPE` reason、外部 404 与结构化 denial log。列表和搜索以过滤后的结果表达范围，不逐条记录 denial。

## 当前实现落点

- `packages/contracts/src/admin-authorization.ts`：Organization Responsibility collection/row actions 与稳定 reason contract。
- `apps/admin-api/src/services/admin-authorization/`：operation grant、capability summary、authorization Interface 与双端 decision。
- `apps/admin-api/src/services/organization-responsibility/`：scoped list/search/detail、action facts、SQL 前置过滤。
- `apps/admin-api/src/use-cases/organization-responsibility/`：Create 与 lifecycle 的事务内双端 guard。
- `apps/admin-api/src/routes/admin/organization-responsibility/`：取得 authorization 并向 service/use case 传递，不实现 predicate。
- `apps/admin-api/src/composition/`：连接新增依赖；不创建第二套 repository 或 HR adapter。
- `apps/admin/src/access.ts`、route registry 与 Organization Responsibility UI：模块可见性、collection action、row actions、嵌入面板与 Audit Tab 条件。
- `e2e/system/hr-admin-user-management.spec.ts` 与相应 component/PostgreSQL tests：把“菜单隐藏、直达 403”改为正向管理 journey 和双端 denial matrix。

## 验证矩阵

### Policy 与 adapter component tests

- HR capability summary 包含 Organization Responsibility，其他既有模块能力不变。
- 全部现有 Organization Responsibility REST/tRPC operations 对有效 HR 通过 module gate；无 scope、错误 client 绑定和 ordinary role 仍拒绝。
- full/scoped authorization 对双端 in/in、in/out、out/in、out/out 四种 facts 给出稳定决定；不同 Scope Root 的 in/in 允许。
- Assignment `allowedActions` 同时覆盖 Enable、Pause、Disable、parent unavailable 和完整管理员回归。
- REST 与 tRPC 使用同一 operation classification 和 authorization Interface。

### Service/use-case tests

- list/search/detail 在 repository seam 接收 scoped read scope，显式 filters 只能收窄。
- Create 对四种双端组合、自 holder、跨 roots、Enable/Pause/Disable holder、target 状态及 `head`/`supervising` cardinality 全覆盖。
- Pause、Resume、End 在事务内先授权再 transition；越界、scope 丢失验证无 audit、dirty 或状态写入；合法幂等重试保留 `changed:false` 意图审计，不增加 dirty 或状态写入。
- 范围外 blocker 只返回安全原因，不包含 Assignment、holder、Organization 或 scope 身份。

### PostgreSQL integration tests

- 双端 `AND` predicate 在 pagination/cursor 前生效，没有空洞页、错误 cursor 或越界详情。
- Ended 历史按当前 scope 变化立即出现或消失。
- full admin 创建的单端越界 Assignment 仍占用 cardinality、阻止 Organization 生命周期，并向 HR 返回安全 blocker。
- 既有 unique indexes、并发 create/resume、rollback、audit 与 invalidation contract 不回归。

### Frontend 与 Full-system E2E

- HR 菜单、独立页面及 User/Employment/Organization 嵌入面板可见，Audit 菜单和 Assignment Audit Tab 不可见。
- 两个 selector 只返回 scope 内候选，但允许从管理员不同 Scope Roots 各选一端。
- HR 可创建、暂停、恢复、结束并查看 Ended 历史；按钮由 server-owned `allowedActions` 控制。
- 直接 URL、猜测 Assignment ID 和手工 API 请求不能绕过双端 guard。
- scope 变更后的下一请求立即收敛；full admin 与 mixed-role journey 保持全局行为。

以上矩阵已由 policy/adapter、service/use-case、PostgreSQL/component 测试与 `@iam/e2e-system` 的真实
`hr-admin:journey` 覆盖。Full-system seed 固定建立两个 HR Scope Roots、双端四组合、隐藏 blocker、mixed-role
Full Admin、ordinary actor 与无有效 scope 的 HR actor；浏览器 journey 通过真实 Gateway/SSO/Admin API/Admin UI
验证创建、Pause、Resume、End、Ended 历史、嵌入面板、direct URL、REST/tRPC 四组合、scope 撤销后的读取与 mutation
拒绝和安全 blocker。同一 full actor 在移除 HR Role Assignment 前后分别以 mixed/full 身份完成全局隐藏 Assignment 的
读取和 lifecycle mutation。随后由 production Drizzle verifier 与有界 Admin API 日志核验 audit、User Profile 收敛、
无越界写入和所有 HR denial log 均不泄露。

## 发布与回滚

本变更没有数据迁移、backfill 或 role provisioning。Admin API 与 Admin 前端按一次协调发布交付：统一 mutation 结果按 [ADR-0025](../../adr/0025-align-admin-mutation-results-with-committed-facts.md) 与全部消费者协调切换，不部署混合结果契约；切换前核验外部 REST 调用方，并运行 Full-system HR journey。部署后所有有效 `iam:hr-admin` 立即获得能力。

若必须回滚权限，先从 Admin API 的 HR operation/capability policy 撤销服务端授权，再回滚前端入口；只隐藏 UI 不能构成安全回滚。数据库、Assignment 数据、审计和 User Profile 投影不需要回滚。
