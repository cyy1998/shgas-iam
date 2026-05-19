# organization-management Specification

## Purpose
描述当前管理端 API 已实现的组织主数据管理行为，包括组织树、闭包表、搜索、详情、更新、状态变更与软删除约束。该 baseline 只记录当前代码证据清楚的行为，不包含尚未审查的 public/internal 组织接口目标态。

## Requirements
### Requirement: 管理端暴露组织管理操作
系统 SHALL 通过管理端 REST 和 tRPC 暴露组织搜索、子节点查询、详情、创建、更新、状态变更与删除操作。

#### Scenario: REST 组织接口可用
- **WHEN** 调用管理端 `/admin/organizations` 下的搜索、子节点、详情、创建、更新、状态变更或删除路由
- **THEN** 系统 SHALL 将请求校验后的输入转交给对应 organization operation

#### Scenario: tRPC 组织接口可用
- **WHEN** 管理后台通过 `admin.organization` tRPC router 调用组织操作
- **THEN** 系统 SHALL 复用与 REST 路由一致的 organization operation

### Requirement: 创建组织维护树结构
系统 SHALL 在创建组织时保证 active 且未软删除的组织编码不重复，并为新组织写入树路径、层级、父节点和闭包表关系。

#### Scenario: 创建根组织
- **WHEN** 创建组织请求不包含 `parentCode`
- **THEN** 系统 SHALL 插入组织记录
- **AND** 系统 SHALL 将 `parentId` 设置为 `-1`
- **AND** 系统 SHALL 将组织层级设置为 `OrganizationLevel.One`
- **AND** 系统 SHALL 写入自身到自身、深度为 0 的闭包表关系

#### Scenario: 创建子组织
- **WHEN** 创建组织请求包含可查询到的 active parent organization
- **THEN** 系统 SHALL 插入组织记录
- **AND** 系统 SHALL 将新组织 `parentId` 设置为父组织 ID
- **AND** 系统 SHALL 将新组织层级设置为父组织下一层级
- **AND** 系统 SHALL 复制父组织祖先关系并为新组织写入闭包表关系

#### Scenario: 创建重复组织编码
- **WHEN** 创建组织请求的 `orgCode` 已匹配 active 且未软删除的组织
- **THEN** 系统 SHALL 拒绝创建并报告待创建组织已存在

#### Scenario: 超出最大层级
- **WHEN** 父组织层级为 `OrganizationLevel.Five`
- **THEN** 系统 SHALL 拒绝继续计算子组织层级

### Requirement: 查询组织树与组织列表
系统 SHALL 只从未软删除的组织中返回子节点、搜索结果和详情，并补充当前代码计算出的派生字段。

#### Scenario: 查询根级或指定父组织的直接子节点
- **WHEN** 管理端查询组织子节点且未传 `parentOrgCode`
- **THEN** 系统 SHALL 查询 `parentId=-1` 的未软删除组织
- **AND** 响应 SHALL 按 `orderNum` 和 `id` 排序并分页

#### Scenario: 查询未知父组织的子节点
- **WHEN** 管理端查询组织子节点且 `parentOrgCode` 无法匹配未软删除组织
- **THEN** 系统 SHALL 返回空结果和 `total=0`

#### Scenario: 子节点派生 isLeaf
- **WHEN** 子节点查询返回组织行
- **THEN** 系统 SHALL 统计每个返回行的未软删除直接子组织数量
- **AND** 系统 SHALL 将没有直接子组织的行标记为 `isLeaf=true`

#### Scenario: 搜索组织
- **WHEN** 管理端按 text、orgType、status、parentOrgCode 或 ancestorOrgCode 搜索组织
- **THEN** 系统 SHALL 使用组织编码/名称模糊匹配以及精确条件过滤未软删除组织
- **AND** ancestorOrgCode SHALL 通过闭包表匹配任意深度后代且不包含自身

#### Scenario: 查询组织详情
- **WHEN** 管理端按 orgCode 查询到未软删除组织
- **THEN** 系统 SHALL 返回组织 DTO、状态文本、未软删除直接子组织数量和相关未软删除 employment 数量

### Requirement: 更新组织与状态
系统 SHALL 在更新组织或组织状态前确认目标组织未软删除，并在变更 orgCode 时防止与 active 组织编码冲突。

#### Scenario: 更新不存在的组织
- **WHEN** 管理端更新或变更状态的 orgCode 无法匹配未软删除组织
- **THEN** 系统 SHALL 拒绝请求并报告组织不存在

#### Scenario: 重命名为已存在组织编码
- **WHEN** 更新请求包含新的 `orgCode`，且该编码已匹配 active 且未软删除组织
- **THEN** 系统 SHALL 拒绝请求并报告组织编码已存在

#### Scenario: 更新组织状态
- **WHEN** 管理端状态变更请求通过输入校验并目标组织存在
- **THEN** 系统 SHALL 将请求中的 `OrganizationStatus` 写入该组织记录

### Requirement: 删除组织受子节点和任职约束
系统 SHALL 仅在组织不存在未软删除直接子组织且不存在相关未软删除 employment 时软删除组织。

#### Scenario: 删除不存在组织
- **WHEN** 管理端删除的 orgCode 无法匹配未软删除组织
- **THEN** 系统 SHALL 拒绝请求并报告组织不存在

#### Scenario: 存在子组织时拒绝删除
- **WHEN** 待删除组织存在未软删除直接子组织
- **THEN** 系统 SHALL 拒绝删除并报告组织存在子级

#### Scenario: 存在任职时拒绝删除
- **WHEN** 待删除组织作为部门或公司关联到未软删除 employment
- **THEN** 系统 SHALL 拒绝删除并报告组织存在任职关系

#### Scenario: 满足删除约束时软删除
- **WHEN** 待删除组织存在、没有未软删除直接子组织、且没有相关未软删除 employment
- **THEN** 系统 SHALL 将该组织的 `isDelete` 更新为 `true`

## Open Questions
- 创建组织时，如果请求包含 `parentCode` 但该父组织查不到，当前代码会按无父组织路径继续创建；这是代码行为但未写入 Requirement，需要人工确认是否为目标语义。
- 更新组织时如果变更父组织、层级或 path，代码没有同步重算闭包表；baseline 未声明“支持移动组织树”，需要人工确认是否禁止或尚未实现。
- 删除组织只检查直接子组织，不检查闭包表下所有后代；如果数据存在断层，需要人工确认是否可接受。
- public/internal 组织查询与供应商注册接口尚未纳入本 baseline，后续可单独建立 organization-directory 或 external-organization spec。
- 管理端 organization REST/tRPC 中间件权限边界未在本 spec 内声明；安全审计指出 admin/rpc 细粒度权限仍需确认。

## Evidence Review
- 管理端暴露组织管理操作: 证据 `apps/admin-api/src/routes/admin/organization/organization.routes.ts`, `apps/admin-api/src/routes/admin/organization/organization.handlers.ts`, `apps/admin-api/src/routes/admin/organization/organization.ops.ts`, `apps/admin-api/src/routes/admin/organization/organization.trpc.ts`。状态: 有代码证据；权限边界未纳入。
- 创建组织维护树结构: 证据 `apps/admin-api/src/services/organization/organization.service.ts`, `apps/admin-api/src/services/organization/organization.repository.ts`, `packages/db/src/schema/core/organizations.ts`, `packages/db/src/schema/core/organization-closures.ts`, `packages/contracts/src/enums/organization.level.ts`, `packages/contracts/src/enums/__tests__/organization.level.test.ts`。状态: 有代码和枚举测试证据；parentCode 缺失行为需要人工确认。
- 查询组织树与组织列表: 证据 `apps/admin-api/src/routes/admin/organization/organization.routes.ts`, `apps/admin-api/src/services/organization/organization.schema.ts`, `apps/admin-api/src/services/organization/organization.service.ts`, `apps/admin-api/src/services/organization/organization.repository.ts`。状态: 有代码证据；未见组织服务自动化测试。
- 更新组织与状态: 证据 `apps/admin-api/src/services/organization/organization.service.ts`, `apps/admin-api/src/services/organization/organization.repository.ts`, `packages/contracts/src/enums/organization.status.ts`。状态: 有代码证据；移动组织树未声明。
- 删除组织受子节点和任职约束: 证据 `apps/admin-api/src/services/organization/organization.service.ts`, `apps/admin-api/src/services/organization/organization.repository.ts`, `packages/db/src/schema/core/employments.ts`。状态: 有代码证据；只检查直接子节点属于需要确认的行为边界。
