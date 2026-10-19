# HR 组织责任管理契约

## 适用范围

具备有效范围的 `iam:hr-admin` 通过 `admin.organizationResponsibility.*` 管理当前 HR Administration Scope 内的组织责任。
完整管理员 `iam:admin` 保持全局能力，多角色能力取并集。

领域语义见 [CONTEXT.md](../../../CONTEXT.md) 的 **HR Organization Responsibility Administration**；
请求时授权与双端范围见 [ADR-0017](../../adr/0017-centralize-admin-role-policy-with-request-time-scope.md)，
Assignment 模型见 [ADR-0014](../../adr/0014-model-organization-responsibility-as-employment-bound-fact.md)。

## 授权契约

服务端每次请求从 PostgreSQL 当前 Effective Role、Effective Employment 与 Organization Path 解析 HR Administration Scope；
解析成功且有有效范围的 `iam:hr-admin` 才获得范围内管理能力。前端能力与异步 Profile 不能替代该授权。

对任一 Assignment，令：

- `H` 为 holder Employment 所属 Organization；
- `T` 为 target Organization；
- `S` 为 actor 当前 HR Administration Scope 中全部 Organization 的并集。

纯 HR 的可管理条件固定为 `H ∈ S AND T ∈ S`。`H` 与 `T` 可以位于不同 Scope Root；不要求同根。该条件同时用于列表、搜索、详情、创建、Pause、Resume、End 和 Ended 历史读取，不按 action 改变量词。

| 能力                        | `iam:admin`          | 纯 `iam:hr-admin`                    |
| --------------------------- | -------------------- | ------------------------------------ |
| Type Catalog                | 全局只读             | 有有效 HR scope 时全局只读           |
| Assignment 列表、搜索、详情 | 全局                 | 仅双端均在当前 scope                 |
| 创建 Assignment             | 满足业务前提即可     | 所选 holder 与 target 均在当前 scope |
| Pause、Resume、End          | 满足生命周期规则即可 | 当前 Assignment 双端均在 scope       |
| Ended 历史                  | 全局                 | 按请求时当前双端 scope               |
| 跨 Scope Root 任命          | 允许                 | 两端分别在 scope 即允许              |
| 自己作为 holder             | 允许                 | 不特殊处理，满足相同规则即允许       |
| Assignment 操作日志         | 允许                 | 不授予；隐藏操作日志 Tab             |
| 全局 Audit 模块             | 允许                 | 不授予                               |

Type Catalog 由 IAM 代码拥有，只增不减，管理端只提供读取。
所有调用方使用同一组 REST/tRPC operations，不接受调用方自行声明的 scope。
模块可见或具有创建能力，只说明管理员具备有效范围；具体 Assignment、holder 和 target 仍须分别通过资源授权。
授权模块、查询与事务的实现边界见[后端架构](../../architecture/backend-architecture.md#organization-responsibility-解析)。

## 查询与写入

### 查询

- `listTypes` 只需要有效的模块访问能力，不按资源范围裁剪 Catalog。
- 指定目标的列表和全局搜索都先按双端范围筛选，再计算分页与 cursor；调用方传入的 target、employment、type、lifecycle filters 只会继续收窄结果。
- 列表的 target 越界，或全局搜索的 filters 越界时返回空结果；Assignment detail 任一端越界返回 404。
- Ended Assignment 使用 holder Employment 与 target Organization 当前保留的组织关系判断，不保存授权或路径快照。
- Ended Assignment 可以读取仍存在但已软删除的关联 User、Position、holder/target Organization 及其保留的组织路径，使用当前名称，不保存任命时快照。真正物理缺失的关联对象或不完整路径仍按完整性错误失败；Open Assignment 继续拒绝软删除引用。
- 历史可读性不扩大 HR scope。当前 scope resolver 排除软删除 Organization，因此删除任一端组织后，纯 HR 可能失去该历史的读取能力；完整管理员仍可读取保留的历史。

### 创建

创建只接受 Enable holder Employment 与 Enable target Organization。
服务端在同一事务内确认两端存在并检查双端范围，再判断父对象和 cardinality，最后创建 Assignment、写审计并登记 User Profile dirty。
任一端越界时返回 404，且不进入业务冲突判断、写入或副作用。

目标组织与 holder 选择器只展示当前 HR 范围内候选；holder 通过 `searchEmployments` 显式请求 `EmploymentStatus.Enable`。
服务端创建时仍重新校验双端范围。

### 生命周期命令

| 规则或操作         | 条件与结果                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| 固定绑定           | Assignment 的 type、holder Employment 和 target Organization 创建后不可编辑；Assignment 不提供删除。 |
| Pause              | 暂停后仍占 cardinality 槽位。                                                                        |
| Resume             | 重新检查父对象完整性与 cardinality。                                                                 |
| End                | 结束后不可恢复。                                                                                     |
| 合法重复命令       | 返回 `changed:false` 并保留意图审计，不新增 dirty、不改写结束时间。                                  |
| 非法转换           | 返回 409。                                                                                           |
| 任一端不在当前范围 | 在转换或 no-op 判断前返回 404，重复已完成命令也不能绕过授权。                                        |

生命周期命令根据事务内锁定的 Assignment 判断转换，真实变化、审计和 User Profile dirty 原子提交；
Employment、Organization 与 User 的级联遵守各自生命周期规则。
只读父对象保持普通预检，不防止并发新建 Assignment。
HR 范围按请求时事实解析，授权后的并发撤权不会中止在途事务，后续请求才观察新范围；不保证提交时强一致授权。
锁序与并发边界见[Admin 同对象写入规范](../../architecture/backend-architecture.md#admin-同对象写入规范)。

## 响应与前端

通用页面请求、路由与权限规则见[前端架构](../../architecture/frontend-architecture.md#管理路由与权限)。

`AdminCapabilitySummary` 表达：

- 有效 HR 的 `visibleModules` 包含 `organizationResponsibility`；
- `collectionActions` 包含 `organizationResponsibility.create`；
- 无有效 scope 继续 fail closed；mixed `iam:admin` + `iam:hr-admin` 继续得到 full capability。

创建成功返回 `{changed:true,result:{id}}`，Pause、Resume、End 返回 `{changed,result:null}`；REST 保留 envelope，tRPC 直接返回业务结果。列表和各嵌入入口统一区分已修改与无需修改，并刷新事实。

Admin Assignment view/detail 在 `holder.user`、`holder.position`、`holder.organization`、`targetOrganization` 及 `fullPath` 各节点上显式返回 `isDelete`。列表与详情使用这些字段标注已删除的关联名称；Ended 历史保持只读。

Assignment 列表与详情返回服务端计算的 `allowedActions.pause/resume/end`，综合当前范围、生命周期和父对象完整性。
页面按该结果显示按钮，mutation 后重新加载列表和详情；服务端每次 mutation 仍重新授权，响应 capability 不是凭据。

HR 可访问独立 Organization Responsibility Assignment 页面，也可在 Organization、Employment、User 详情中看到责任入口。
所有入口复用同一 scoped service；holder 与 target selector 只展示当前 scope 候选，允许从不同 Scope Roots 选择两端。
holder 在 scope 但 target 越界，或 target 在 scope 但 holder 越界的 Assignment 都不显示。Assignment drawer 的 Audit Tab
按 `canAccessAudit` 隐藏，纯 HR 不展示全局 Audit 菜单；不新增 scoped audit operation，也不开放 `admin.audit.search`。
不可管理的隐藏 blocker 只显示下一节规定的稳定安全文案，不渲染 Assignment、holder 或范围外 Organization。
如需撤销该能力，必须关闭服务端授权；只隐藏页面入口不能撤销权限。

## 越界阻塞与错误语义

完整管理员可能已经创建一端位于 HR scope 外的 Open Assignment。它仍参与全局 cardinality 和 Organization integrity：

- scoped 列表和详情不返回该 Assignment；
- HR 创建冲突时返回稳定且安全的说明：责任槽位已占用；如果当前列表没有可管理记录，联系完整管理员；
- Organization 生命周期被此类 Assignment 阻止时，allowed action 使用稳定的不可管理责任阻塞 reason；
- 响应与日志不得包含 Assignment ID、holder、范围外 Organization、path 或 scope/root 集合；
- 数据库唯一约束裁决的并发竞争也使用安全错误：完整管理员得到 cardinality conflict，HR 的 single slot 竞争得到不可管理责任的通用阻塞说明。

详情和 mutation 的范围拒绝统一使用内部 `RESOURCE_OUT_OF_SCOPE` reason、外部 404 与结构化 denial log。列表和搜索以过滤后的结果表达范围，不逐条记录 denial。

授权、事务、分页与 UI 能力的证明范围见[架构验证归属](../../architecture/architecture-verification.md)。
首次消费者协调发布与回滚要求见[整理前的发布说明](https://github.com/cyy1998/shgas-iam/blob/48c2d6cc20e8a3675cbd1269eed2d5612141791d/docs/features/organization-responsibility/hr-admin-management-design.md#发布与回滚)。
