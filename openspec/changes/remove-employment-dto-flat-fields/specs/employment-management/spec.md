## MODIFIED Requirements

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
