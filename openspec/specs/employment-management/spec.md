# employment-management Specification

## Purpose
描述当前管理端任职/雇佣关系能力，包括搜索、详情、创建、更新、状态变更、软删除、转岗、设为主岗和按用户离职。该 baseline 记录现状，不新增 HR 流程或审批语义。
## Requirements
### Requirement: 管理端暴露雇佣管理操作
系统 SHALL 通过管理端 REST 和 tRPC 暴露雇佣搜索、详情、创建、更新、状态变更、删除、转岗、设为主岗和用户离职操作。

#### Scenario: REST 雇佣接口可用
- **WHEN** 调用 `/admin/employments` 下的搜索、详情、创建、更新、状态变更、删除、转岗、设为主岗或用户离职路由
- **THEN** 系统 SHALL 校验请求输入并调用对应 employment operation

#### Scenario: tRPC 雇佣接口可用
- **WHEN** 管理后台通过 `admin.employment` tRPC router 调用雇佣操作
- **THEN** 系统 SHALL 复用与 REST 路由一致的 employment operation

### Requirement: 搜索和查询雇佣
系统 SHALL 在未软删除雇佣中按管理端条件查询列表和详情，返回结构化 Employment DTO/VO，并聚合角色权限。

#### Scenario: 搜索雇佣
- **WHEN** 管理端提交雇佣分页查询条件
- **THEN** 系统 SHALL 只查询 `employment.isDelete=false` 的记录
- **AND** 系统 SHALL 支持按 statuses、isPrimary、usernames、posCodes 和 organization 过滤
- **AND** organization 过滤 SHALL 支持 `matchMode=exact` 精确匹配任职组织
- **AND** organization 过滤 SHALL 支持 `matchMode=subtree` 匹配组织子树下任职
- **AND** organization 过滤 SHALL 支持 `matchMode=company` 匹配 Company 祖先下任职
- **AND** 系统 SHALL 在迁移期继续接受 companyOrgCodes 和 deptOrgCodes，并将其映射为 organization 过滤
- **AND** 系统 SHALL 支持按 username 或 name 模糊匹配 text
- **AND** 系统 SHALL 按 `isPrimary desc` 和 `id desc` 排序并返回分页结果

#### Scenario: 查询雇佣详情
- **WHEN** 管理端按 id 查询到未软删除雇佣
- **THEN** 系统 SHALL 返回包含 `user`、`position` 和 `organization` 上下文的雇佣 DTO/VO
- **AND** 系统 SHALL NOT 在雇佣顶层返回 username、name、mobile、wxId、posCode、posName、orgCode、orgName、orgType、compCode 和 compName deprecated 扁平字段
- **AND** 系统 SHALL 聚合该雇佣通过岗位、组织和任职直接关联得到的 active roles 与 privileges

#### Scenario: 雇佣不存在
- **WHEN** 管理端按 id 查询不到未软删除雇佣
- **THEN** 系统 SHALL 拒绝请求并报告雇佣不存在

### Requirement: 创建雇佣
系统 SHALL 在事务内创建雇佣，并校验用户、实际任职组织、可选祖先组织、岗位和重复任职关系。

#### Scenario: 创建时引用对象不存在
- **WHEN** 创建请求引用的 username 无法匹配未软删除用户，或 orgCode 无法匹配启用组织，或 posCode 无法匹配未软删除岗位
- **THEN** 系统 SHALL 拒绝创建并报告用户、组织或岗位不存在

#### Scenario: 创建时祖先校验失败
- **WHEN** 创建请求提供 expectedAncestorOrgCode，且 orgCode 对应组织不在该祖先组织子树内
- **THEN** 系统 SHALL 拒绝创建并报告任职组织不属于期望组织范围

#### Scenario: 相同任职关系已存在
- **WHEN** 同一用户、实际任职组织和岗位已存在 status 为 Enable 且未软删除的 employment
- **THEN** 系统 SHALL 拒绝创建并报告相同任职关系已存在

#### Scenario: 创建主岗
- **WHEN** 创建请求设置 `isPrimary=true`
- **THEN** 系统 SHALL 先将该用户其他未软删除主岗更新为非主岗
- **AND** 系统 SHALL 创建新的 Enable 雇佣记录
- **AND** 新雇佣记录 SHALL 只写入 userId、posId、orgId、isPrimary、startTime、description 和 status

#### Scenario: 创建普通雇佣
- **WHEN** 创建请求未设置 `isPrimary`
- **THEN** 系统 SHALL 使用 `isPrimary=false` 创建新的 Enable 雇佣记录
- **AND** 响应 SHALL 返回新雇佣 id

#### Scenario: 创建输入兼容旧公司部门字段
- **WHEN** 创建请求在迁移期仍提供 companyOrgCode 和 deptOrgCode
- **THEN** 系统 SHALL 将 deptOrgCode 作为实际任职组织
- **AND** 系统 SHALL 将 companyOrgCode 作为 expectedAncestorOrgCode 执行祖先校验
- **AND** 系统 SHALL NOT 将 companyOrgCode 写入 employment 记录

### Requirement: 更新雇佣与状态
系统 SHALL 在更新雇佣前确认记录存在，并禁止编辑已结束雇佣。

#### Scenario: 更新已结束雇佣
- **WHEN** 管理端更新 status 为 Disable 的雇佣
- **THEN** 系统 SHALL 拒绝请求并报告雇佣不可编辑

#### Scenario: 更新为主岗
- **WHEN** 管理端将非主岗雇佣更新为 `isPrimary=true`
- **THEN** 系统 SHALL 将该用户其他未软删除主岗更新为非主岗
- **AND** 系统 SHALL 更新当前雇佣的请求字段

#### Scenario: 状态变更为结束
- **WHEN** 管理端将雇佣状态更新为 `EmploymentStatus.Disable`
- **THEN** 系统 SHALL 同时将 `endTime` 写为当前时间

#### Scenario: 从结束状态恢复
- **WHEN** 管理端将已有 Disable 状态雇佣更新为非 Disable 状态
- **THEN** 系统 SHALL 清空 `endTime`

### Requirement: 删除雇佣
系统 SHALL 通过软删除隐藏雇佣记录。

#### Scenario: 删除不存在雇佣
- **WHEN** 管理端删除的 id 无法匹配未软删除雇佣
- **THEN** 系统 SHALL 拒绝请求并报告雇佣不存在

#### Scenario: 软删除雇佣
- **WHEN** 管理端删除的雇佣存在
- **THEN** 系统 SHALL 将该雇佣 `isDelete` 更新为 `true`
- **AND** 响应 SHALL 返回 true

### Requirement: 转岗结束旧雇佣并创建新雇佣
系统 SHALL 在事务内通过转岗结束旧雇佣，并基于新的实际任职组织创建新的 Enable 雇佣记录。

#### Scenario: 转岗已结束雇佣
- **WHEN** 管理端对 status 为 Disable 的雇佣执行转岗
- **THEN** 系统 SHALL 拒绝请求并报告雇佣不可编辑

#### Scenario: 转岗引用对象不存在
- **WHEN** 转岗请求的新实际任职组织无法匹配启用组织，或新岗位无法匹配未软删除岗位
- **THEN** 系统 SHALL 拒绝转岗并报告对应对象不存在

#### Scenario: 转岗祖先校验失败
- **WHEN** 转岗请求提供 expectedAncestorOrgCode，且 newOrgCode 对应组织不在该祖先组织子树内
- **THEN** 系统 SHALL 拒绝转岗并报告新任职组织不属于期望组织范围

#### Scenario: 转岗成功
- **WHEN** 转岗请求通过校验
- **THEN** 系统 SHALL 将旧雇佣状态设置为 Disable、写入当前 endTime、并将旧雇佣 isPrimary 置为 false
- **AND** 若 inheritPrimary 缺省或为 true，系统 SHALL 让新雇佣继承旧雇佣的主岗状态
- **AND** 系统 SHALL 创建新的 Enable 雇佣
- **AND** 新雇佣记录 SHALL 只写入旧用户、新岗位、新实际任职组织、isPrimary、startTime、description 和 status
- **AND** 响应 SHALL 返回 newEmploymentId

#### Scenario: 转岗输入兼容旧新公司新部门字段
- **WHEN** 转岗请求在迁移期仍提供 newCompanyOrgCode 和 newDeptOrgCode
- **THEN** 系统 SHALL 将 newDeptOrgCode 作为新的实际任职组织
- **AND** 系统 SHALL 将 newCompanyOrgCode 作为 expectedAncestorOrgCode 执行祖先校验
- **AND** 系统 SHALL NOT 将 newCompanyOrgCode 写入 employment 记录

### Requirement: 设为主岗与用户离职
系统 SHALL 支持将某条雇佣设为用户主岗，并支持按用户结束全部活跃雇佣。

#### Scenario: 设为主岗
- **WHEN** 管理端将存在且未结束的雇佣设为主岗
- **THEN** 系统 SHALL 将该用户其他未软删除主岗更新为非主岗
- **AND** 系统 SHALL 将当前雇佣 `isPrimary` 更新为 true

#### Scenario: 用户离职
- **WHEN** 管理端对存在用户执行离职
- **THEN** 系统 SHALL 将该用户 status 为 Enable 或 Pause 且未软删除的 employments 更新为 Disable 并写入当前 endTime
- **AND** 系统 SHALL 将用户状态更新为 `UserStatus.Disable`

### Requirement: 管理端任职生命周期服务规则具备单元测试覆盖
系统 SHALL 为 `employment.service.ts` 中的管理端任职生命周期业务规则提供 Bun 单元测试覆盖，且测试不得依赖真实数据库、Redis 或网络。

#### Scenario: 创建任职校验引用对象和重复关系
- **WHEN** `createEmploymentForAdmin` 被调用且用户、实际任职组织、可选祖先组织或岗位不存在，或同一用户、组织和岗位已有有效任职
- **THEN** 单元测试 SHALL 验证服务抛出对应错误并且不会创建任职记录

#### Scenario: 创建任职处理主岗和默认值
- **WHEN** `createEmploymentForAdmin` 被调用且请求设置 `isPrimary=true`
- **THEN** 单元测试 SHALL 验证服务在创建前调用 `unsetPrimariesByUserId(user.id, null, tx)`
- **AND** 单元测试 SHALL 验证创建记录包含 userId、posId、orgId、startTime、description 和 `status=EmploymentStatus.Enable`
- **AND** 单元测试 SHALL 验证创建记录不包含 compId
- **AND** 单元测试 SHALL 验证缺省 `isPrimary` 时创建记录使用 `isPrimary=false`
- **AND** 单元测试 SHALL 验证成功响应为 `{ id: created.id }`

#### Scenario: 更新任职保护不可编辑状态并限制更新字段
- **WHEN** `updateEmployment` 被调用且任职不存在或任职状态为 `EmploymentStatus.Disable`
- **THEN** 单元测试 SHALL 验证服务分别抛出 `EmploymentNotFoundError` 或 `EmploymentNotEditableError`
- **AND** 单元测试 SHALL 验证非主岗更新为主岗时先调用 `unsetPrimariesByUserId(existing.userId, id, tx)`
- **AND** 单元测试 SHALL 验证当前已经是主岗时不会重复清理其它主岗
- **AND** 单元测试 SHALL 验证传给 `updateEmploymentRecord` 的字段仅包含 isPrimary、startTime 和 description
- **AND** 单元测试 SHALL 验证成功响应为 true

#### Scenario: 更新任职状态维护 endTime
- **WHEN** `updateEmploymentStatus` 被调用且任职不存在
- **THEN** 单元测试 SHALL 验证服务抛出 `EmploymentNotFoundError`
- **AND** 单元测试 SHALL 验证更新为 `EmploymentStatus.Disable` 时同时写入 Date 类型 endTime
- **AND** 单元测试 SHALL 验证从 Disable 恢复到 Enable 或 Pause 时写入 `endTime=null`
- **AND** 单元测试 SHALL 验证非 Disable 的普通状态变更不会写入 endTime
- **AND** 单元测试 SHALL 验证成功响应为 true

#### Scenario: 删除任职执行软删除
- **WHEN** `deleteEmployment` 被调用且任职不存在
- **THEN** 单元测试 SHALL 验证服务抛出 `EmploymentNotFoundError`
- **AND** 单元测试 SHALL 验证任职存在时调用 `softDeleteEmployment(id, tx)`
- **AND** 单元测试 SHALL 验证成功响应为 true

#### Scenario: 转岗结束旧任职并创建新任职
- **WHEN** `transferEmployment` 被调用且原任职不存在或状态为 `EmploymentStatus.Disable`
- **THEN** 单元测试 SHALL 验证服务分别抛出 `EmploymentNotFoundError` 或 `EmploymentNotEditableError`
- **AND** 单元测试 SHALL 验证新实际任职组织、可选祖先组织或新岗位不存在时抛出对应错误
- **AND** 单元测试 SHALL 验证祖先校验失败时不会结束旧任职或创建新任职
- **AND** 单元测试 SHALL 验证服务先将旧任职更新为 `status=EmploymentStatus.Disable`、写入当前 endTime、并设置 `isPrimary=false`
- **AND** 单元测试 SHALL 验证 `inheritPrimary` 缺省时继承旧任职主岗状态，`inheritPrimary=false` 时新任职 `isPrimary=false`
- **AND** 单元测试 SHALL 验证新任职为主岗时调用 `unsetPrimariesByUserId(existing.userId, null, tx)`
- **AND** 单元测试 SHALL 验证新 Enable 任职字段来自旧用户和新实际任职组织、新岗位，并正确处理缺省或传入的 startTime
- **AND** 单元测试 SHALL 验证新任职创建记录不包含 compId
- **AND** 单元测试 SHALL 验证成功响应为 `{ newEmploymentId: created.id }`

#### Scenario: 设置主岗维护主岗互斥
- **WHEN** `setPrimaryEmployment` 被调用且任职不存在或状态为 `EmploymentStatus.Disable`
- **THEN** 单元测试 SHALL 验证服务分别抛出 `EmploymentNotFoundError` 或 `EmploymentNotEditableError`
- **AND** 单元测试 SHALL 验证有效任职先调用 `unsetPrimariesByUserId(existing.userId, id, tx)`，再调用 `updateEmploymentRecord(id, { isPrimary: true }, tx)`
- **AND** 单元测试 SHALL 验证成功响应为 true

#### Scenario: 用户离职结束活跃任职并禁用用户
- **WHEN** `resignUser` 被调用且用户不存在
- **THEN** 单元测试 SHALL 验证服务抛出用户不存在错误
- **AND** 单元测试 SHALL 验证用户存在时先调用 `endActiveEmploymentsByUserId(user.id, tx)`
- **AND** 单元测试 SHALL 验证随后调用 `updateUserByUsername(username, { status: UserStatus.Disable }, tx)`
- **AND** 单元测试 SHALL 验证成功响应为 true

#### Scenario: Employment DTO mapper 返回结构化上下文
- **WHEN** 单元测试映射包含用户、岗位和组织链的 employment 记录
- **THEN** 单元测试 SHALL 验证 DTO 包含 user、position、organization.assignedOrg、organization.fullOrgPath 和 organization.companyNodes
- **AND** 单元测试 SHALL 验证 DTO 不包含 username、name、mobile、wxId、posCode、posName、orgCode、orgName、orgType、compCode 和 compName 顶层字段
- **AND** 单元测试 SHALL 验证无 Company 节点时 `organization.companyNodes` 为空数组

### Requirement: Employment 仅持久化实际任职组织
系统 SHALL 将 Employment 的组织事实收敛为实际任职组织，且 SHALL NOT 在目标态继续持久化公司组织字段。

#### Scenario: Employment 记录不再包含 compId
- **WHEN** 系统创建、转岗或查询 employment 记录
- **THEN** `employment` 表 SHALL 使用 `orgId` 表示实际任职组织
- **AND** 系统 SHALL NOT 依赖 `employment.compId` 保存或读取公司组织

#### Scenario: 公司信息由组织链派生
- **WHEN** 系统需要返回或过滤 employment 的公司信息
- **THEN** 系统 SHALL 基于 `employment.orgId` 对应组织的 `organization_closure` 祖先链派生公司节点
- **AND** 系统 SHALL NOT 使用独立公司外键作为公司事实来源

### Requirement: Employment DTO 暴露结构化组织上下文
系统 SHALL 通过 Zod schema 定义 Employment DTO 的结构化用户、岗位和组织上下文，且 SHALL NOT 继续暴露 deprecated 顶层扁平兼容字段。

#### Scenario: Employment DTO 包含 summary 与组织上下文
- **WHEN** 系统返回 Employment DTO
- **THEN** DTO SHALL 包含 `user` summary，至少提供 id、username、name、mobile 和 wxId
- **AND** DTO SHALL 包含 `position` summary，至少提供 id、posCode 和 posName
- **AND** DTO SHALL 包含 `organization.assignedOrg`
- **AND** DTO SHALL 包含按 root 到 assignedOrg 排序的 `organization.fullOrgPath`
- **AND** DTO SHALL 包含 `organization.companyNodes`，其内容为 `fullOrgPath` 中 `orgType=OrganizationType.Company` 的节点

#### Scenario: 组织节点包含路径定位字段
- **WHEN** DTO 返回 `organization.fullOrgPath` 中的组织节点
- **THEN** 每个节点 SHALL 包含 id、orgCode、orgName、orgType、level、parentId、isVirtual、isEntity
- **AND** 每个节点 SHALL 包含 `pathIndex`
- **AND** 每个节点 SHALL 包含 `distanceToAssignedOrg`

#### Scenario: deprecated 扁平字段已移除
- **WHEN** 系统返回 Employment DTO
- **THEN** DTO SHALL NOT 包含 username、name、mobile、wxId、posCode、posName、orgCode、orgName、orgType、compCode 和 compName 顶层字段
- **AND** 调用方 SHALL 通过 `user`、`position`、`organization.assignedOrg` 和 `organization.companyNodes` 读取对应信息

#### Scenario: DTO type 从 schema 推导
- **WHEN** 系统定义 Employment DTO、组织节点、组织上下文、用户 summary 或岗位 summary type
- **THEN** TypeScript type SHALL 通过 `z.infer<typeof XxxSchema>` 从对应 Zod schema 推导
- **AND** 系统 SHALL NOT 手写与 schema 重复的 DTO 结构 type

### Requirement: Employment domain errors use centralized API errors
Employment management SHALL use centralized named errors for stable employment failure cases.

#### Scenario: Employment does not exist
- **WHEN** an employment operation targets a missing employment record
- **THEN** the backend SHALL throw the centralized employment not found error

#### Scenario: Employment is not editable
- **WHEN** an operation attempts to modify an employment record that is no longer editable
- **THEN** the backend SHALL throw the centralized employment not editable error

#### Scenario: Employment relationship already exists
- **WHEN** creating an employment relationship would duplicate an existing relationship
- **THEN** the backend SHALL throw a centralized employment already exists error

### Requirement: 管理端任职写操作标记 profile dirty
管理端任职生命周期写操作 SHALL 标记受影响用户 profile dirty，使用户详情和搜索文档中的 employments、roles、privileges、organization context 和 primary 标记最终收敛。

#### Scenario: 创建任职标记用户 dirty
- **WHEN** 管理端成功创建任职
- **THEN** 系统 SHALL 在同一事务内标记该任职所属用户 profile dirty
- **AND** dirty reason SHALL include `EmploymentUpdated`
- **AND** commit 后系统 SHALL best-effort enqueue 该用户的 rebuild job

#### Scenario: 更新任职标记用户 dirty
- **WHEN** 管理端成功更新任职 startTime、description、isPrimary 或其它 profile-relevant 字段
- **THEN** 系统 SHALL 在同一事务内标记该任职所属用户 profile dirty
- **AND** 如果该操作取消同一用户其它主岗标记，系统 SHALL 仍至少标记该用户一次 dirty

#### Scenario: 更新任职状态或删除任职标记用户 dirty
- **WHEN** 管理端成功禁用、启用或软删除任职
- **THEN** 系统 SHALL 在同一事务内标记该任职所属用户 profile dirty
- **AND** commit 后系统 SHALL best-effort enqueue 该用户的 rebuild job

#### Scenario: 转岗标记用户 dirty
- **WHEN** 管理端成功结束旧任职并创建新任职
- **THEN** 系统 SHALL 在同一事务内标记该用户 profile dirty
- **AND** dirty record SHALL cover both old employment removal and new employment addition

#### Scenario: 设置主岗标记用户 dirty
- **WHEN** 管理端成功设置某任职为主岗
- **THEN** 系统 SHALL 在同一事务内标记该用户 profile dirty
- **AND** profile 重建 SHALL eventually reflect the new primary employment state

#### Scenario: 用户离职标记用户 dirty
- **WHEN** 管理端成功结束用户 active employments 并禁用该用户
- **THEN** 系统 SHALL 在同一事务内标记该用户 profile dirty
- **AND** dirty reasons SHALL include `EmploymentUpdated` and `UserUpdated`

## Open Questions
- 创建雇佣时重复校验只查 status=Enable；如果存在 Pause 状态同一任职关系，是否允许重复创建需要人工确认。
- 创建雇佣和转岗引用用户/岗位时，当前代码主要按未软删除查询，不统一要求用户或岗位 status=Enable；是否应收紧需要确认。
- 更新雇佣状态没有禁止直接恢复已结束雇佣，只会清空 endTime；这是否是目标行为需要确认。
- 转岗创建新雇佣前没有显式复用“相同任职关系已存在”校验；可能依赖业务流程避免冲突。
- 用户离职不软删除雇佣，只更新状态和 endTime；是否应同时清理 session 或权限快照未在代码中体现。

## Evidence Review
- 管理端暴露雇佣管理操作: 证据 `apps/admin-api/src/routes/admin/employment/employment.adapter.ts`, `employment.index.ts`, `employment.routes.ts`, `employment.trpc.ts`。状态: 有代码证据。
- 搜索和查询雇佣: 证据 `apps/admin-api/src/services/employment/employment.repository.ts`, `apps/admin-api/src/services/employment/employment.service.ts`, `packages/domain/src/employment/schema.ts`, `apps/admin-api/src/services/role/role.repository.ts`, `apps/admin-api/src/services/privilege/privilege.repository.ts`。状态: 有代码证据。
- 创建雇佣: 证据 `apps/admin-api/src/services/employment/employment.service.ts`, `apps/admin-api/src/services/employment/employment.repository.ts`, `packages/db/src/schema/core/employments.ts`。状态: 有代码证据。
- 更新雇佣与状态: 证据 `apps/admin-api/src/services/employment/employment.service.ts`, `apps/admin-api/src/services/employment/employment.repository.ts`, `packages/contracts/src/enums/employment.status.ts`。状态: 有代码证据。
- 删除雇佣: 证据 `apps/admin-api/src/services/employment/employment.service.ts`, `apps/admin-api/src/services/employment/employment.repository.ts`。状态: 有代码证据。
- 转岗结束旧雇佣并创建新雇佣: 证据 `apps/admin-api/src/services/employment/employment.service.ts`。状态: 有代码证据；重复新任职关系语义需确认。
- 设为主岗与用户离职: 证据 `apps/admin-api/src/services/employment/employment.service.ts`, `apps/admin-api/src/services/employment/employment.repository.ts`, `apps/admin-api/src/services/user/user.repository.ts`。状态: 有代码证据。
