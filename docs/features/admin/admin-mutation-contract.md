# Admin 写入最终契约与规格核对

本文记录 [Spec #95](https://github.com/cyy1998/shgas-iam/issues/95) 的代码候选范围与证据入口，
由 [#110](https://github.com/cyy1998/shgas-iam/issues/110) 整合。它不替代固定候选的实际命令结果；
完整执行日志、失败记录和最终验收由议题保存。环境消费者、部署与放流仍按
[协调切换清单](../../releases/admin-mutation-contract-cutover.md)核验。

## 最终结果与恢复

所有 Admin 业务 mutation 成功返回 `{ changed, result }`。REST 在现有 envelope 的 `data` 中返回该业务结果，
tRPC 直接返回业务结果。创建及 Transfer 保留新资源，凭据操作保留原有的一次性交付字段，普通无资源命令为 `result:null`；
Session 与登录限制保留真实数量、安全摘要和 `failureStateCleared`。Internal 委托保持独立的详情/boolean 协议。

资料空更新为 400；普通缺失与重复删除为 404；非法生命周期转换和已知唯一约束冲突为 409。
同值资料不记变更审计或 dirty，生命周期、安全和授权命令 no-op 保留 `changed:false` 意图审计。
授权与范围检查先于可公开的存在性、冲突信息，范围外仍沿既有安全语义。

`ADMIN_MUTATION_COMMITTED` 表示已确认业务提交而后续 required 处理失败；未知 COMMIT 仍保留未知错误及原 owner 的保守处理。
页面自动读详情，持续提示修复，不自动重放写入。读取成功不证明传播恢复。Secret 未交付显示
“轮换已生效，新 Secret 出现错误”，先修复传播再主动轮换；不提供明文补领。
Redis 作用后审计失败继续使用 `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`，不能冒充数据库事务回滚。

## 行为证据入口

下表缩写供后续逐项核对使用。文件内的真实断言与测试资源决定证明范围，文件存在和静态扫描均不表示测试已执行。

| 证据 | 公开边界与代表文件 |
|---|---|
| M | [公共 mutation contract](../../../apps/admin-api/test-integration/component/admin-mutation.integration.test.ts)、[Client UoW contract](../../../apps/admin-api/test-integration/postgres/client-mutation.integration.test.ts) |
| P | [Position PostgreSQL](../../../apps/admin-api/test-integration/postgres/position-mutation.integration.test.ts)、[Position adapter](../../../apps/admin-api/test-integration/component/position-mutation.adapter.integration.test.ts)、[页面](../../../apps/admin/test-integration/component/PositionsPage.integration.test.tsx) |
| O | [Organization PostgreSQL](../../../apps/admin-api/test-integration/postgres/organization-mutation.integration.test.ts)、[adapter](../../../apps/admin-api/test-integration/component/organization-mutation.adapter.integration.test.ts)、[页面](../../../apps/admin/test-integration/component/OrganizationsPage.integration.test.tsx) |
| R | [Role/Assignment PostgreSQL](../../../apps/admin-api/test-integration/postgres/role-mutation.integration.test.ts)、[adapter](../../../apps/admin-api/test-integration/component/role.adapter.integration.test.ts)、[页面](../../../apps/admin/test-integration/component/RolesPage.integration.test.tsx) |
| U | [User PostgreSQL](../../../apps/admin-api/test-integration/postgres/user-mutation.integration.test.ts)、[adapter](../../../apps/admin-api/test-integration/component/user.adapter.integration.test.ts)、[页面](../../../apps/admin/test-integration/component/UsersPage.integration.test.tsx) |
| E | [Employment/PostgreSQL](../../../apps/admin-api/test-integration/postgres/employment-mutation.integration.test.ts)、[adapter](../../../apps/admin-api/test-integration/component/employment.adapter.integration.test.ts)、[页面](../../../apps/admin/test-integration/component/EmploymentsPage.integration.test.tsx)、[Full/HR 离职页面](../../../apps/admin/test-integration/component/ResignByUserModal.integration.test.tsx) |
| A | [Responsibility PostgreSQL](../../../apps/admin-api/test-integration/postgres/organization-responsibility-assignment.integration.test.ts)、[adapter](../../../apps/admin-api/test-integration/component/organization-responsibility.adapter.integration.test.ts)、[页面与嵌入面板](../../../apps/admin/test-integration/component/OrganizationResponsibilityAssignmentModule.integration.test.tsx) |
| C | [Client 基础 PostgreSQL](../../../apps/admin-api/test-integration/postgres/client-command.integration.test.ts)、[adapter](../../../apps/admin-api/test-integration/component/client.adapter.integration.test.ts)、[OpenAPI](../../../apps/admin-api/test-integration/component/client.openapi.integration.test.ts)、[页面](../../../apps/admin/test-integration/component/client.integration.test.ts) |
| I | [OIDC PostgreSQL](../../../apps/admin-api/test-integration/postgres/client-oidc-command.integration.test.ts)、[Client 浏览器](../../../apps/admin/test-integration/browser/clients.spec.ts) |
| S | [Custom SSO PostgreSQL](../../../apps/admin-api/test-integration/postgres/client-custom-sso-command.integration.test.ts)、[PG/Redis composition](../../../apps/admin-api/test-integration/composition/client-runtime-hard-cutover-rehearsal.integration.test.ts) |
| L | [Session/Restriction Redis](../../../apps/admin-api/test-integration/redis/session-management.integration.test.ts)、[Session adapter](../../../apps/admin-api/test-integration/component/session-management.adapter.integration.test.ts)、[Sessions 浏览器](../../../apps/admin/test-integration/browser/sessions.spec.ts) |
| G | [离职 Redis](../../../apps/admin-api/test-integration/redis/resign-user.integration.test.ts)、[Kernel 捕获代际撤销](../../../packages/api-core/test-integration/redis/session-kernel-prepared-revocation.integration.test.ts) |
| D | [Internal 委托写入与 resolver 联验](../../../apps/api/test-integration/postgres/privilege-delegation-writes.integration.test.ts)、[resolver fail-closed](../../../apps/api/test-integration/postgres/privilege-delegation-resolution.integration.test.ts) |
| F | 既有 Full-system [Admin](../../../e2e/system/admin-custom-sso.spec.ts)、[HR](../../../e2e/system/hr-admin-user-management.spec.ts)、[OIDC](../../../e2e/system/oidc-pkce.spec.ts)；同一 exact-project、真实 Gateway/页面/后端/Worker/PG/Redis |

## 42 条用户故事逐项核对

| Story | 最终行为 | 切片与证据 |
|---|---|---|
| 1 | 成功明确真实变化或合法 no-op | #96–108；M、P–L、F |
| 2 | 被占用标识稳定业务冲突，未知 constraint 不误分类 | #96–105；P、O、R、U、E、A、C |
| 3 | 软删除用户名仍占用 | #99；U |
| 4 | Pause/Disable/软删除组织编码仍占用 | #97；O |
| 5 | 真实唯一约束裁决并发创建，一个成功、另一个业务冲突 | #96–105；P、O、R、U、E、A、C |
| 6 | 普通 CRUD 缺失为 404 | #96–107；P–S |
| 7 | 零行删除不记 changed-success 审计/dirty | #96–105；P、O、R、U、C |
| 8 | 空资料明确 400 | #96–105；P、O、R、U、E、C |
| 9 | 同值资料成功且 changed:false | #96–105；P、O、R、U、E、C |
| 10 | Organization 只以 Enable 创建，显式非 Enable 拒绝 | #97；O |
| 11 | 生命周期基于持锁当前状态 | #96–107；P–S |
| 12 | 重复 End 合法 no-op，不重写原时间 | #101、103、104；E、A、F |
| 13 | Resume 已结束任职为 409 | #101；E |
| 14 | 资料保存只覆盖明确请求字段，页面不回填旧状态 | #96–107；P–S |
| 15 | OIDC configure 不撤销并发 disable 意图 | #106；I |
| 16 | 配置保存不恢复旧 Secret | #106、107；I、S |
| 17 | 移除/轮换锁后判配置，不产生非法 Secret 配对 | #106、107；I、S |
| 18 | 同配置不推进 epoch 或撤销会话 | #106、107；I、S、F |
| 19 | 显式轮换每次产生新 Secret | #106、107；I、S |
| 20 | Role 真状态变化必登记 dirty，publication 收敛 | #98；R |
| 21 | 安全/生命周期/授权/凭据/会话 no-op 保留意图审计 | #96–108；P–L |
| 22 | 普通资料 no-op 无变更审计和新 dirty | #96–105；P、O、R、U、E、C |
| 23 | Full/HR 重复离职审计分类相同 | #103；E |
| 24 | 源事实、事务审计与 dirty 原子提交或回滚 | #96–107；M、P–S |
| 25 | Session/Restriction 仍依据真实 Redis 结果 | #108；L、G |
| 26 | 已确认提交后的 required 失败用专用错误 | #96–107；M、U、E、C、I、S |
| 27 | 页面自动刷新事实，不自动重复 mutation | #96–108；P–L |
| 28 | 读取成功不抹去未修复传播/审计提示 | #96–108；U、E、C、I、S、L |
| 29 | Secret 未交付使用指定中文及主动恢复流程 | #106、107；C、I、S |
| 30 | 创建/Transfer/密码与 Secret 保留必要 result | #96–107；P–S、F |
| 31 | REST、挂载 legacy、tRPC、页面同一契约 | #96–108、110；P–L、F；环境核验见切换清单 |
| 32 | Full/HR 授权与 scope 不因错误分类泄漏事实 | #97、100–104；O、U、E、A、F |
| 33 | 委托禁止自委托且 startTime < endTime | #109；D |
| 34 | 部分更新按合并后的完整委托重新校验 | #109；D |
| 35 | 不相交组织范围可并存同一权限委托 | #109；D |
| 36 | 同组织与祖先/后代覆盖在权限/时间相交时冲突 | #109；D |
| 37 | Pause 占用期间，闭区间端点相接冲突 | #109；D |
| 38 | 同受托人不豁免重复覆盖 | #109；D |
| 39 | create/update/end 共同经过委托人协调 | #109；D |
| 40 | 已结束委托不可修改或重开，纯重复结束 no-op | #109；D |
| 41 | 委托事实与成功审计同事务，审计失败回滚 | #109；D |
| 42 | 新 Admin 入口沿公共 mutation、统一锁序与结果 | #96–110；M、下方入口/锁序核对、后端架构 |

## Implementation Decisions 逐项核对

| 决策 | 实现与保留边界 |
|---|---|
| 1 | ADR-0025/0026 已实施；本表和行为证据区分目标与事实。 |
| 2 | 全部现存 Admin mutation census 见下节；Type Catalog 和查询不新增写入口；D 保持 Internal 独立边界。 |
| 3 | `services/admin-mutation/admin-mutation.ts` 统一 UoW/目标锁/结果；领域 service/use-case 持有判断，transaction-bound ports 隔离 raw transaction。 |
| 4 | 现存业务目标锁后判断；责任旧同行 CAS/fallback 已收缩；Redis/Runtime/Profile 原子 owner 保留。 |
| 5 | 完整选中业务写集合先锁齐、重验，再写；表间与主键顺序见锁序表，不锁只读父对象。 |
| 6 | 创建依靠原唯一约束；不声称锁住空槽、阻止 phantom 或提升 Primary/全部 Open Employment 保证。 |
| 7 | DB 只解结构化 SQLSTATE/constraint/cause，领域 repository 只映射已知约束；P–A、C、D。 |
| 8 | 返回行/集合/数量检查与锁后业务比较分开；零行 fail closed；P–S。 |
| 9 | 无页面版本协商；明确字段 patch、空更新400、同值 no-op；P–C。 |
| 10 | 普通缺失404、非法转换409、已达目标 no-op，先保留授权安全语义；P–A、F。 |
| 11 | Organization 默认 Enable、非 Enable 拒绝；软删除标识占用不释放；O、U。 |
| 12 | Admin 成功统一 changed/result，资源/凭据/数量保留；REST envelope 不变，tRPC 无第二层 envelope。 |
| 13 | 意图审计与变更审计区分；Full/HR 离职一致，不改写结束时间；P–L。 |
| 14 | 源事实/audit/dirty 原子；no-op 不新增 dirty，但保留离职旧代 Session 撤销恢复；E、G。 |
| 15 | 协议配置规范化比较；no-op 不推进 epoch/撤销，仍 required invalidation；I、S、F。 |
| 16 | 确认提交后失败才映射 ADMIN_MUTATION_COMMITTED；bestEffort、未知 COMMIT、Snapshot 窗口和 repair 保留；M、S。 |
| 17 | 页面 changed/no-op/普通失败/已提交失败分开，刷新不重放且保留提示；P–L。 |
| 18 | Secret 指定提示、先修复再主动轮换，无明文补领；I、S。 |
| 19 | 所有仓库内协议/页面同契约；环境 REST/legacy 消费者仍须负责人核验，禁止混合中间态发布。 |
| 20 | Internal User(delegator)→Delegation 协调，不依赖 Admin 公共模块；D。 |
| 21 | 权限、闭期间、实际组织覆盖三者相交才冲突；不引入覆盖优先级；D。 |
| 22 | 完整候选、不可变绑定、终态稳定、自身排除；D。 |
| 23 | resolver 仍 fail closed；不加引用生命周期强约束、自动修复或 Profile dirty；D。 |
| 24 | ADR/CONTEXT/架构/索引同步；Guard 观察模型不扩展，SQL 与事务依靠行为测试。 |

## Testing Decisions 逐项核对

| 决策 | 验证归属与限制 |
|---|---|
| 1 | P–S 使用公开 Admin 命令、production UoW/repository、隔离真实 PostgreSQL；queue/runtime seam 替代不证明投递。 |
| 2 | D 使用公开写入与现有 resolver 联验；独立 API UoW。 |
| 3 | P–L 的实际 adapter 与页面 component/browser；页面 mock 后端不能替代服务器安全或系统证据。 |
| 4 | I/S 的 configure/disable/rotate/remove 双向交错、R dirty/publication、E 多行锁等待用显式同步与独立事务。 |
| 5 | P–C 真实唯一冲突、Drizzle cause、非启用/软删除占用；未知 constraint 不误分类。 |
| 6 | P–S 缺失、受控零行、空/同值、重复 End/非法 Resume 与组织创建矩阵。 |
| 7 | P–L 意图/变更审计、dirty；E Full/HR 重复离职；PG 原子回滚。 |
| 8 | I/S 配置 no-op/轮换、真实 composition；L/G 和 API Core Redis 验证实际作用与恢复。 |
| 9 | M/C/I/S 公开命令 required 失败与 bestEffort；已确认提交与未知结果分开；页面刷新不重放并保留修复提示。 |
| 10 | I/S 首次配置与轮换的正常交付、提交后未交付、指定中文、错误/审计不泄露 Secret；无明文补领或自动重试，修复后主动轮换。 |
| 11 | D 覆盖组织/时间/权限/状态矩阵、六组协调竞争、审计回滚与读端 fail-closed。 |
| 12 | adapter/OpenAPI/component/browser 与 F 扩展三条既有系统旅程；不新增旁路 harness。 |
| 13 | 每票静态/类型/行为/资源结果在其 issue；#110 固定候选最终聚合由父流程记录，未执行不能算通过。 |

系统旅程只证明选定正常组合链：Admin 在启用前通过可编辑表单验证配置 no-op，随后继续原有 Local Session 协议链；HR changed 创建与生命周期、
REST/tRPC 重复 End no-op 且时间不变及 scope 拒绝；OIDC 同配置保存后原 Code 继续兑换并保持 authorization-time snapshot。
它们不替代单领域的真实竞争、事务回滚或传播失败注入，也不证明外部消费者已升级。

## 现存入口 census

核对范围为 50 个唯一业务 mutation operationId（49 个 tRPC 命令，另加 Client legacy ID 编辑）、51 条实际挂载 REST 写路径。
REST 多出的一条是与 canonical create 共用 operationId 的 Client legacy create 别名。
Session 按单 Session/用户撤销共用一个公开命令。所有 REST 基址为 `/admin`，tRPC 前缀为 `admin.`；
实际 Gateway 再加 `/api/iam`。`generate-password` 虽为 POST，属于纯值生成查询，无持久 mutation。

| 领域与命令 | REST 路径 | tRPC procedure | 页面/共享组件 |
|---|---|---|---|
| Position：create/update/status/delete | `POST /positions/`，`PUT/DELETE /positions/:posCode`，`PATCH .../status` | `position.create/update/updateStatus/delete` | `pages/positions`、`PositionFormModal` |
| Organization：create/update/status/delete | `POST /organizations/`，`PUT/DELETE /organizations/:orgCode`，`PATCH .../status` | `organization.create/update/updateStatus/delete` | `pages/organizations`、`OrgFormModal/OrgDetailPanel` |
| Role：create/update/status/delete | `POST /roles/`，`PUT/DELETE /roles/:roleCode`，`PATCH .../status` | `role.create/update/updateStatus/delete` | `pages/roles`、`RoleFormModal` |
| Role Assignment：create/updateScope/delete | `POST /roles/:roleCode/assignments`，`PATCH .../:assignmentId/scope`，`DELETE .../:assignmentId` | `role.assignments.create/updateScope/delete` | `RoleAssignmentFormModal/RoleDetailDrawer` |
| User：create/update/status/delete/resetPassword | `POST /users/`，`PUT/DELETE /users/:username`，`PATCH .../status`，`POST .../reset-password` | `user.create/update/updateStatus/delete/resetPassword` | `UserFormModal/UserDetailDrawer/ResetPasswordModal` |
| Employment：create/update/pause/resume/end/transfer/setPrimary/clearPrimary/resign | `POST /employments/`，`PUT /employments/:id`，`POST .../{pause,resume,end,transfer,set-primary,clear-primary}`，`POST /employments/users/:username/resign` | `employment.create/update/pause/resume/end/transfer/setPrimary/clearPrimary/resignUser` | Employment Form/Detail/Transfer、`EmploymentLifecycleActions/EmploymentPrimaryActions/ResignByUserModal`、UserDetail 离职 |
| Responsibility：create/pause/resume/end | `POST /organizations/:orgCode/responsibility-assignments`，`POST /organization-responsibilities/assignments/:id/{pause,resume,end}` | `organizationResponsibility.createAssignment/pauseAssignment/resumeAssignment/endAssignment` | Assignment 独立页、共享 Module/FormModal、Organization/Employment/User 嵌入面板 |
| Client：create/update/status/delete、legacy ID update | `POST /clients/`，`PUT/DELETE /clients/:clientCode`，`PATCH .../status`；legacy `POST /clients/create`、`POST /clients/update` | `client.create/update/updateStatus/delete`；legacy ID 无 tRPC | ClientFormModal/BasicSettings/edit；legacy ID 无仓库页面消费者 |
| OIDC：configure/enable/disable/remove/rotateSecret | `PUT /clients/:clientCode/oidc/configure`，`POST .../{enable,disable,remove,rotate-secret}` | `client.oidcConfigure/oidcEnable/oidcDisable/oidcRemove/oidcRotateSecret` | `OidcSettings` |
| Custom SSO：同上五命令 | `PUT /clients/:clientCode/custom-sso/configure`，`POST .../{enable,disable,remove,rotate-secret}` | `client.customSsoConfigure/customSsoEnable/customSsoDisable/customSsoRemove/customSsoRotateSecret` | `CustomSsoSettings` |
| Session/Restriction：revoke/release | `POST /sessions/revoke`，`DELETE /login-restrictions/{userId}` | `sessionManagement.revokeSessions/releaseLoginRestriction` | Sessions、LoginRestrictionsTab |

真实挂载由 [composition/routes](../../../apps/admin-api/src/composition/routes/index.ts)和各领域 `*.index.ts` 拥有，
REST 与 tRPC 共用 adapter operation。[adapter helper](../../../apps/admin-api/src/lib/admin-api-adapter.ts)在授权后执行 command，
REST 用 `resp.ok(data)`，tRPC 直接返回；没有转换回旧 boolean/裸资源。
页面经 `apps/admin/src/services` 消费结果和已提交错误；User 内部 lifecycle 的 `current/disposition` 在公开前收敛为 `result:null`，
不属于第二种公开契约。Type Catalog、查询、搜索和 capability 不在写命令清单。

可复算数量为：Position 4、Organization 4、Role 4、Role Assignment 3、User 5、Employment 9、Responsibility 4、
Client 基础 5、OIDC 5、Custom SSO 5、Session/Restriction 2，共 50。Client 基础中 legacy ID 编辑没有 tRPC；
legacy create 在 REST 多挂载一条，其余领域 operationId、tRPC、REST 数量一致。

## 公共模块与锁序核对

[Admin mutation](../../../apps/admin-api/src/services/admin-mutation/admin-mutation.ts)实际包住领域 transaction/locked command；
[production UoW](../../../apps/admin-api/src/composition/tx/index.ts)在同一事务内构造 repository、audit、dirty 和责任 participant。
Client 公共模块适配原 target-bound wrapper 的单一事务，保留 required invalidation 和未知 COMMIT 保守失效，无嵌套 UoW。
Session/Restriction 用统一业务结果，但继续由 Redis owner 执行。Internal 委托由 API 自有 UoW 拥有，无 Admin 反向依赖。

| 写入口 | 锁定既有业务集合的顺序 |
|---|---|
| Position/Organization/Role 普通写入 | 目标本行；Organization 子组织/任职/责任与 Role Assignment 是 blocker 查询，不级联写入它们。 |
| Role Assignment、Responsibility 直接命令 | Assignment 本行；父对象普通读取，不反向锁父 Employment/Organization。 |
| User 资料/密码 | User 本行；需要 Subject Access 的状态/删除再锁精确 intent。 |
| Employment 说明/Resume/Clear Primary | URL Employment 本行。 |
| Create Primary | 既有选中 Open Primary 按 ID 升序，再插入新任职。 |
| Set Primary | URL Employment 与既有选中 Primary 去重合并，按 ID 升序一次锁齐。 |
| Pause/End Employment | Employment → 本次选中 Responsibility Assignment 按 ID 升序，锁齐后重验并写。 |
| Transfer | URL Employment 与选中 Primary 合并按 ID 升序 → 选中 Responsibility 按 ID 升序。 |
| User Resignation | User → 精确 Subject Access intent → 完整选中 Open Employment 按 ID 升序 → 完整选中 Responsibility 按 ID 升序；锁齐后重验 HR。 |
| Client 基础/legacy ID/OIDC/Custom SSO | 同一 Client 行；legacy ID 锁后以 canonical code 写。 |
| Internal Delegation create/update/end | delegator User → 目标 Delegation（创建则插入新行/绑定）；锁后重新读取完整候选与绑定。 |

责任 participant 的 `selectedAssignments` 现为必填，旧未提供集合的 fallback、两个 CTE `beforeStatus` CAS 批量写出口已删除；
无生产消费者的 `unsetOpenPrimariesByUserId` 也已删除。原过渡 component 用例迁移到最终锁定集合流程并保留审计/no-op 断言。
这只是移除已经不被公开路径使用的内部形式，不引入新的业务行为或永久静态扫描规则。

各表集合锁先选择 ID，再按身份锁齐并重验；等待期间状态变化不会令已选择对象被偷偷跳过或重开。
只保护已选择的现存行，不阻止之后插入或未选择行的变化，不提升跨表父状态、全体 Open Employment、Primary 或请求时 HR scope。
Internal 的协调不提升 delegatee、Organization、Privilege 生命周期保证；resolver 继续 fail closed。
