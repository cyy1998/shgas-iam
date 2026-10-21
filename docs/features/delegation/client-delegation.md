# Client 委托与管理契约

本文维护 Client Delegation 的在线契约与旧权限模型的协调切换边界；代码交付不表示目标环境已执行切换。
决策及本次取舍见 [ADR-0020](../../adr/0020-provide-fail-closed-privilege-delegation-resolution.md)，
领域词汇见 [CONTEXT.md](../../../CONTEXT.md)。本契约同时覆盖 Internal、Admin 和 SSO。
实施与验收记录见 [Spec #264](https://github.com/cyy1998/shgas-iam/issues/264)。
现行 Client Delegation 命名及错误码按 [Spec #269](https://github.com/cyy1998/shgas-iam/issues/269) 收敛。

## 委托含义与范围

Client Delegation 只为委托人查找一个直接代办人，不授予或复制角色、权限、登录身份，也不允许冒用委托人登录。
业务系统自行判断受托人能否执行具体代办操作。

一条委托绑定一个委托人、一个受托人、一个 Client 和一个 Organization，包含开始时间、结束时间、状态及说明。
多个 Client 分别建立记录，即使双方用户相同也分别管理。禁止自委托。

组织范围包含所选组织及当前全部后代，以解析时的组织树为准，未来新增后代自动纳入。
不冻结创建时的后代集合，不新增组织移动能力。

## 三类入口的权限

| 入口            | 可以观察及管理的范围                                               | 可信身份来源                             |
| --------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| Admin           | `iam:admin` 可以全局查看、代建和管理；HR 不获得此能力              | 当前请求的 Admin 授权结果                |
| SSO“我委托的”   | 本人作为委托人的全部 Client 委托，可创建和管理                     | 当前认证用户，不接受调用方指定其他委托人 |
| SSO“委托给我的” | 本人作为受托人的记录，只读                                         | 当前认证用户                             |
| Internal        | 当前 Client 的委托，可为符合条件的任意用户代建、代管，并搜索和解析 | Internal 认证凭据对应的 Client           |

Internal 的 Client 不由请求输入选择。创建、搜索、修改、解析均限定在认证 Client 内；
使用其他 Client 的记录 ID 不能越界读取、修改或暴露其详情。审计 actor 记录实际调用 Client。
SSO 的本人限制同样由后端落实，页面隐藏按钮不能代替授权。

三类入口适用相同的创建、生命周期和冲突规则，不能通过更换入口绕过限制。
Admin 授权沿用 [ADR-0017](../../adr/0017-centralize-admin-role-policy-with-request-time-scope.md)。

## 创建与对象选择

创建时委托双方、Client、Organization 均须存在、未删除且启用。
自助用户可以选择任意满足条件的 Client、组织和本人以外的受托人，不要求双方同部门，
不要求双方持有该 Client 的角色。Internal 的目标 Client 固定为调用方。

无需受托人接受、拒绝或审批；新记录以 Enable 创建，只有到达业务期间才参与解析。
必须指定开始、结束时间，沿用 `startTime < endTime`；允许提前安排未来委托。
选择列表返回选择所需的安全身份与名称信息，不因提供对象选择而开放完整管理接口。

## 生命周期与冲突

| 状态或操作 | 契约                                                                     |
| ---------- | ------------------------------------------------------------------------ |
| Enable     | 观察时刻位于闭区间 `[startTime, endTime]` 时参与解析                     |
| Pause      | 暂停解析，可恢复；仍保留期间占位                                         |
| Disable    | 手动结束，不可重新打开，不允许修改业务字段                               |
| 自然到期   | 超过截止时间后不再解析，不自动转换为 Disable                             |
| 修改       | 未手动结束时只允许修改期间、说明或进行合法状态转换                       |
| 延期       | 自然到期但未结束的记录可以延期；仍须通过冲突检查，Pause 不因延期自动恢复 |
| 更换绑定   | 委托双方、Client、组织创建后固定；需要更换时先结束原委托，再新建         |
| 重复结束   | 允许纯重复结束，保留已有事实，不改写业务行                               |
| 删除       | 不提供委托删除操作；新模型的结束和到期记录继续可查                       |

共享状态名称为 `ClientDelegationStatus`，Enable、Pause、Disable 仍分别持久化为 `1`、`2`、`3`。
命名切换不迁移或清空已有 Client 委托，也不改变生命周期与期间。

同一委托人在同一 Client 下，两条未结束委托的组织范围和闭区间期间均相交时构成冲突。
同组织或祖先与后代组织算范围相交，互不包含的部门可以并存；不同 Client 不冲突。
Pause 仍占位，同一受托人也不豁免，时间端点相接算相交；不采用下级优先、最近祖先优先或重复折叠。
更新检查完整候选并排除自身，不能只检查本次提交的字段。

创建、修改、恢复和延期均须遵守同一冲突规则，跨 Admin、SSO、Internal 的并发写入也不能绕过。
沿用 [ADR-0020](../../adr/0020-provide-fail-closed-privilege-delegation-resolution.md) 的委托人协调顺序，
在同一事务内重读、检查和写入，并记录成功审计。审计 actor 区分管理员、本人和 Internal Client。

## 关联对象生命周期与历史

双方 User 或 Organization 后来被 Pause、Disable，不自动结束委托，也不因此排除解析结果。
新建仍要求对象启用；已有关系不证明受托人可以登录或获得业务操作权限。
Client 停用不自动结束它的委托，但该 Client 不能通过 Internal 认证。

委托人、受托人、绑定的 Client 或所选 Organization 被任何未结束委托直接引用时，拒绝删除。
Pause、未来开始、自然到期的 Enable/Pause 记录均阻断，必须先显式结束；删除命令不隐式结束委托。
只被祖先委托范围覆盖的后代不是该委托的直接组织引用。
这些门禁叠加对象原有的删除约束，不替代 Role、Employment 或子组织等既有检查。

结束记录不阻止关联对象合法软删除。历史继续展示关联对象保留的当前名称和已删除标记，
不保存创建时的名称快照；引用停用或删除不使已经结束的记录重新参与解析。
引用检查遵守 [ADR-0039](../../adr/0039-tighten-admin-reference-integrity-and-preserve-history.md) 及
[后端事务边界](../../architecture/backend-architecture.md#admin-同对象写入规范)，不据顺序操作门禁宣称全局跨对象串行化。

## Internal 接口切换与解析结果

保留以下入口，统一切换为 Client 模型，不保留旧 Privilege 参数的兼容解释：

| 入口                                 | 新模型行为                                                 |
| ------------------------------------ | ---------------------------------------------------------- |
| `POST /internal/delegations/`        | 创建调用方 Client 的委托，双方用户和组织等业务输入保留     |
| `POST /internal/delegations/search`  | 在调用方 Client 内搜索管理记录，包含可查询的结束、到期记录 |
| `PATCH /internal/delegations/:id`    | 只修改调用方 Client 内的记录，并遵守不可变绑定和终态规则   |
| `POST /internal/delegations/resolve` | 使用认证 Client、`usernames` 和 `orgCode` 解析直接受托人   |

新契约移除 `privilegeCode/privilegeCodes`，旧参数必须被拒绝，不能忽略后伪装成功。
Internal 创建沿用详情结果、更新沿用 boolean；Admin 使用统一 `{ changed, result }`，
创建保留新资源，编辑、暂停、恢复及结束的 `result` 为 null。
结果和失败恢复见 [Admin 写入契约](../admin/admin-mutation-contract.md)。

### 业务错误码

委托错误使用 `CLIENT_DELEGATION` 领域名称，三类入口共用同一错误含义；不存在旧错误码别名。

| HTTP 状态 | 错误码                                         | 含义                                                   |
| --------- | ---------------------------------------------- | ------------------------------------------------------ |
| 404       | `CLIENT_DELEGATION.NOT_FOUND`                  | 委托不存在或不属于当前调用范围，不泄露其他范围的记录   |
| 409       | `CLIENT_DELEGATION.ENDED`                      | 已手动结束，当前修改不属于允许的纯重复结束             |
| 409       | `CLIENT_DELEGATION.CONFLICT`                   | 同 Client 的未结束记录在组织覆盖范围及闭区间期间上相交 |
| 404       | `CLIENT_DELEGATION.RESOLUTION_INPUT_NOT_FOUND` | 解析输入中的用户或组织不存在或已删除，整体失败         |
| 503       | `CLIENT_DELEGATION.RESOLUTION_UNAVAILABLE`     | 解析完整性异常、数据库不可用或超时；响应保持脱敏       |

用户删除的未结束委托门禁返回 `USER.HAS_OPEN_CLIENT_DELEGATION`；Client 和 Organization 的既有门禁错误含义保持。
调用方必须配对升级错误码处理，不能继续依赖 `PRIVILEGE.*` 或 `USER.HAS_OPEN_PRIVILEGE_DELEGATION`。
Admin tRPC 沿既有 transport 错误适配交付业务失败；HTTP 状态与管理权限不因领域命名变化而改变。

解析沿用以下基线规则：

- 同一服务端观察时刻、同一数据库快照，按输入顺序返回 `{ username, delegateeUsername }`。
  usernames 精确、唯一且为 1–100 项；没有匹配时为 null，不沿链递归，双向直接委托可以分别解析。
- 缺失或已删除的输入用户、组织属于输入不存在，整体失败；Pause、Disable 不影响输入识别。
  调用 Client 的可用性由认证检查，不接受另一个目标 Client 参数。
- 同一用户匹配多条记录、自委托或匹配记录的引用缺失、已删除属于完整性异常。
  即使多条记录指向同一个受托人也不能折叠；异常时整体失败，不选 winner、不返回部分结果或伪装 null。
- 保留输入错误 422、输入不存在 404、完整性异常及数据库不可用或超时 503 的分类，
  保留 2 秒 statement timeout、5 秒 handler budget，不增加 resolver 缓存或自动重试。

委托独立解析，不进入 User Profile 搜索、Subject Facts 或角色权限投影，不因委托变化登记 Profile dirty。
所有委托写入口共用规则；app 之间不得导入彼此私有 service 或 repository，边界按
[后端架构](../../architecture/backend-architecture.md)和[共享契约](../../architecture/contracts-and-database.md)组织。

## Admin 与 SSO 页面

Admin 新增独立“委托管理”菜单，支持按委托人、受托人、Client、组织、状态和期间查询。
提供创建、修改期间与说明、暂停、恢复、结束操作，行操作受后端授权及当前生命周期约束。
Admin 对象选择显式区分 `purpose:create` 与 `purpose:filter`：创建目录只含启用且未删除对象，
管理筛选目录包含停用及软删除对象的安全身份与当前名称，便于定位历史；SSO 选择目录仍只用于创建。
创建命令独立校验对象前提，筛选目录中的对象不因此获得可创建资格。

SSO 在个人设置增加“委托设置”，包含“我委托的”和“委托给我的”两个列表。
前者管理本人委托，后者只读；不存在代表其他委托人创建的自助入口。

列表显示应用、双方用户、组织范围、期间、状态和说明，区分未开始、生效中、暂停、已到期、已结束。
结束或到期记录可通过筛选查看，生命周期状态和期间事实不相互覆盖。
已到期筛选包括未手动结束的 Enable 与 Pause；暂停记录在业务期间内只表示“期间内”，不标为生效中。
写入成功后刷新列表与可操作状态；冲突和终态拒绝应明确呈现，不自动重放失败写入。
页面服务、capability 和请求恢复沿用[前端架构](../../architecture/frontend-architecture.md)。

## 旧数据与发布切换

旧权限委托和权限绑定数据不转换、不保留业务历史，新 Client 委托从空记录开始。
已有统一审计日志继续保留，不随旧委托业务数据一起清空。
该决定不授权清理其他领域数据，也不表示已在任何环境执行清理。

Internal 消费方与服务端同步切换请求契约；旧 writer、旧 reader 与新 schema 不能混跑。
正式 migration 和核验流程如下；旧数据清理、空的新模型以及非目标数据保留必须在放流前观察。
不提供旧权限参数兼容层或自动推导 Client 的迁移。

### 正式 migration 与维护窗口

正式 SQL 为 `packages/db/src/migrations/20261020090553_client_delegation/migration.sql`，执行前必须审查该文件。

适用于来源数据库仍保留 `privilege_delegation`、`delegation_detail` 且此前正式 migrations 已完整应用的环境。
更早来源须先恢复匹配版本的升级流程；新装空库直接执行完整正式 migrations，不伪造 migration journal。
本节仅定义操作顺序，目标环境的备份、停流及命令执行由发布负责人按其部署配置安排。

本节的清理及空模型验收只适用于尚未执行该项迁移的旧委托来源。已经使用 `client_delegation` 且 journal
已登记该项的环境跳过本节清理，保留已有全部 Client 委托。升级到当前完整制品还包含权限点退役，须继续执行
[Profile v4 协调切换](../../releases/user-profile-maintenance.md#权限点退役的协调切换)的停流、重建、双门禁及配对验收；
不能仅完成本节的旧委托 DDL 就开放当前协议入口。

1. 冻结 Admin、SSO、Internal 的委托写入与读取流量，排空在途请求并停止全部旧 API/Admin API 副本。
   同步准备新 Admin/SSO 前端、配对后端及 Internal 消费方，确保没有旧 reader/writer 再访问旧表。
2. 在同一停流窗口保管可恢复的数据库备份，记录 migration journal、旧委托及绑定行数、已有审计和 User、Client、Organization、Role 等非目标事实基线。
   不单独删除历史 migration、journal 或审计，也不把审计当成可恢复的旧委托数据源。
3. 由部署环境显式提供 `DATABASE_URL`，通过 `pnpm --filter @iam/db db:migrate` 执行正式链，包含
   `20261020090553_client_delegation`。迁移创建 `client_delegation`，删除旧两表及其业务记录，不向新表复制数据。
   不使用 `db:push` 或临时手写清表替代正式 migration；migration 未成功时保持停流并核对实际 journal/表状态。
   完整当前链还会删除权限点源表；Profile v4 全量重建和独立双门禁通过前，不执行下方协议 smoke。
4. 启动新副本前，只读核验 migration 已登记、新表行数为零、旧两表已不存在，且审计及基线中的非目标事实保留。
   可在受控数据库连接执行以下核验；PostgreSQL 默认 schema 为 `public`，若部署采用其他 schema，应使用实际配置：

   ```sql
   SELECT to_regclass('public.privilege_delegation') AS old_delegations,
          to_regclass('public.delegation_detail') AS old_bindings,
          to_regclass('public.client_delegation') AS client_delegations;
   SELECT count(*) FROM client_delegation;
   ```

5. 部署配对的全部消费者，在仍受控的流量下确认旧 `privilegeCode/privilegeCodes` 返回 422，
   新 Internal 解析接受 `usernames/orgCode` 且返回空匹配。再经正式 Admin 或 SSO 创建一个受控新委托，
   核验另一端可见、对应 Internal Client 可解析、暂停后为空、结束后历史仍可查，随后结束 smoke 记录。
   有新写入后不再要求新表为空；空模型的证据必须在 smoke 前取得。
6. 全部门禁和配对检查通过后恢复流量，管理员或本人明确重新建立所需 Client 委托。
   只完成 DDL、新进程 health 或本地 E2E 通过均不足以宣布目标环境切换完成。

迁移后不能仅回退旧制品：旧代码需要的业务表已删除。需要回退时保持停流、停止新写入，
使用本次备份及匹配旧制品恢复完整一致状态，并由发布负责人处理备份之后的新写入；不得删除 journal 重放旧链。
失败或 COMMIT 状态不确定时先核对数据库实际事实，避免自动重跑破坏已创建的新委托。

正式 SQL 及迁移事实由 `@iam/db` 拥有，
[迁移 Integration](../../../packages/db/test-integration/migrations/client-delegation-migration.integration.test.ts)
在临时 PostgreSQL 以真实旧记录执行切换，观察旧数据清理、空新表、审计/非目标保留及重复正式 migrate 不重置新数据。
这不代表任何目标环境已经运行迁移。

## 验收场景

以下是持续成立的验收要求；具体候选与实际执行结果记录在 Spec 及子票，不以本文代替验收记录。

| 场景                          | 必须观察的结果                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| 同用户、不同 Client           | 可以分别委托，解析与 Internal 搜索只返回调用方 Client 的关系                       |
| Internal 越界 ID、伪造 Client | 无法读取或修改其他 Client 的记录，不能绕过输入校验                                 |
| Admin 与 SSO 权限             | 完整管理员可全局管理，HR 被拒绝；本人不能管理他人发起的委托，受托列表只读          |
| 跨部门且没有 Client 角色      | 满足对象启用条件即可建立关系，不增加受托人的角色、权限或登录身份                   |
| 上下级组织、兄弟组织与新后代  | 覆盖和冲突按当前组织树判断，新后代自动被祖先范围覆盖                               |
| 同期间并发创建或恢复          | 三类入口共用冲突裁决，不产生重叠委托；Pause、相同受托人、相接端点不能绕过          |
| 到期、延期、手动结束          | 到期不解析，合法延期可恢复匹配；Pause 延期仍暂停；结束不可恢复，重复结束不改写事实 |
| 引用停用与删除                | 停用不结束关系；未结束引用阻止删除，到期仍阻止；显式结束后可按其他门禁合法删除     |
| 历史关联对象软删除            | 结束记录可查，显示保留的当前名称及删除状态，不丢失历史记录                         |
| 解析异常                      | 缺失输入、多条匹配、自委托、损坏引用及超时均按契约整体失败                         |
| 切换                          | 旧委托及绑定数据清理、新模型为空；旧参数拒绝，已有审计和其他业务数据保留           |
| 两端交互                      | 查询、筛选、合法操作、只读及拒绝反馈可用，写后刷新且不自动重放未知结果             |

按受影响后端真实 PostgreSQL Integration、前端行为测试与跨端旅程取得证据；
测试资源和执行入口遵守[测试编排](../../architecture/testing-architecture.md)及[命令入口](../../development/commands.md)。
