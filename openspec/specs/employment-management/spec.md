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
系统 SHALL 在未软删除雇佣中按管理端条件查询列表和详情，并聚合角色权限。

#### Scenario: 搜索雇佣
- **WHEN** 管理端提交雇佣分页查询条件
- **THEN** 系统 SHALL 只查询 `employment.isDelete=false` 的记录
- **AND** 系统 SHALL 支持按 statuses、isPrimary、usernames、companyOrgCodes、deptOrgCodes、posCodes 过滤
- **AND** 系统 SHALL 支持按 username 或 name 模糊匹配 text
- **AND** 系统 SHALL 按 `isPrimary desc` 和 `id desc` 排序并返回分页结果

#### Scenario: 查询雇佣详情
- **WHEN** 管理端按 id 查询到未软删除雇佣
- **THEN** 系统 SHALL 返回雇佣 DTO
- **AND** 系统 SHALL 聚合该雇佣通过岗位、组织和任职直接关联得到的 active roles 与 privileges

#### Scenario: 雇佣不存在
- **WHEN** 管理端按 id 查询不到未软删除雇佣
- **THEN** 系统 SHALL 拒绝请求并报告雇佣不存在

### Requirement: 创建雇佣
系统 SHALL 在事务内创建雇佣，并校验用户、部门、公司、岗位和重复任职关系。

#### Scenario: 创建时引用对象不存在
- **WHEN** 创建请求引用的 username 无法匹配未软删除用户，或 deptOrgCode/companyOrgCode 无法匹配启用组织，或 posCode 无法匹配未软删除岗位
- **THEN** 系统 SHALL 拒绝创建并报告用户、部门、公司或岗位不存在

#### Scenario: 相同任职关系已存在
- **WHEN** 同一用户、部门和岗位已存在 status 为 Enable 且未软删除的 employment
- **THEN** 系统 SHALL 拒绝创建并报告相同任职关系已存在

#### Scenario: 创建主岗
- **WHEN** 创建请求设置 `isPrimary=true`
- **THEN** 系统 SHALL 先将该用户其他未软删除主岗更新为非主岗
- **AND** 系统 SHALL 创建新的 Enable 雇佣记录

#### Scenario: 创建普通雇佣
- **WHEN** 创建请求未设置 `isPrimary`
- **THEN** 系统 SHALL 使用 `isPrimary=false` 创建新的 Enable 雇佣记录
- **AND** 响应 SHALL 返回新雇佣 id

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
系统 SHALL 在事务内通过转岗结束旧雇佣，并创建新的 Enable 雇佣记录。

#### Scenario: 转岗已结束雇佣
- **WHEN** 管理端对 status 为 Disable 的雇佣执行转岗
- **THEN** 系统 SHALL 拒绝请求并报告雇佣不可编辑

#### Scenario: 转岗引用对象不存在
- **WHEN** 转岗请求的新部门/新公司无法匹配启用组织，或新岗位无法匹配未软删除岗位
- **THEN** 系统 SHALL 拒绝转岗并报告对应对象不存在

#### Scenario: 转岗成功
- **WHEN** 转岗请求通过校验
- **THEN** 系统 SHALL 将旧雇佣状态设置为 Disable、写入当前 endTime、并将旧雇佣 isPrimary 置为 false
- **AND** 若 inheritPrimary 缺省或为 true，系统 SHALL 让新雇佣继承旧雇佣的主岗状态
- **AND** 系统 SHALL 创建新的 Enable 雇佣
- **AND** 响应 SHALL 返回 newEmploymentId

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

## Open Questions
- 创建雇佣时重复校验只查 status=Enable；如果存在 Pause 状态同一任职关系，是否允许重复创建需要人工确认。
- 创建雇佣和转岗引用用户/岗位时，当前代码主要按未软删除查询，不统一要求用户或岗位 status=Enable；是否应收紧需要确认。
- 更新雇佣状态没有禁止直接恢复已结束雇佣，只会清空 endTime；这是否是目标行为需要确认。
- 转岗创建新雇佣前没有显式复用“相同任职关系已存在”校验；可能依赖业务流程避免冲突。
- 用户离职不软删除雇佣，只更新状态和 endTime；是否应同时清理 session 或权限快照未在代码中体现。

## Evidence Review
- 管理端暴露雇佣管理操作: 证据 `apps/admin-api/src/routes/admin/employment/employment.routes.ts`, `employment.handlers.ts`, `employment.ops.ts`, `employment.trpc.ts`。状态: 有代码证据。
- 搜索和查询雇佣: 证据 `apps/admin-api/src/services/employment/employment.repository.ts`, `apps/admin-api/src/services/employment/employment.service.ts`, `packages/domain/src/employment/schema.ts`, `apps/admin-api/src/services/role/role.repository.ts`, `apps/admin-api/src/services/privilege/privilege.repository.ts`。状态: 有代码证据。
- 创建雇佣: 证据 `apps/admin-api/src/services/employment/employment.service.ts`, `apps/admin-api/src/services/employment/employment.repository.ts`, `packages/db/src/schema/core/employments.ts`。状态: 有代码证据。
- 更新雇佣与状态: 证据 `apps/admin-api/src/services/employment/employment.service.ts`, `apps/admin-api/src/services/employment/employment.repository.ts`, `packages/contracts/src/enums/employment.status.ts`。状态: 有代码证据。
- 删除雇佣: 证据 `apps/admin-api/src/services/employment/employment.service.ts`, `apps/admin-api/src/services/employment/employment.repository.ts`。状态: 有代码证据。
- 转岗结束旧雇佣并创建新雇佣: 证据 `apps/admin-api/src/services/employment/employment.service.ts`。状态: 有代码证据；重复新任职关系语义需确认。
- 设为主岗与用户离职: 证据 `apps/admin-api/src/services/employment/employment.service.ts`, `apps/admin-api/src/services/employment/employment.repository.ts`, `apps/admin-api/src/services/user/user.repository.ts`。状态: 有代码证据。
