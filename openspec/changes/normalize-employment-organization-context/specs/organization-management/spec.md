## ADDED Requirements

### Requirement: 管理端提供组织树选择 contract
系统 SHALL 为 admin 前端提供可复用组织树选择 contract，用于树形懒加载、搜索回显和业务筛选输入。

#### Scenario: 返回组织选择节点
- **WHEN** 管理端请求组织选择节点
- **THEN** 系统 SHALL 返回组织节点 id、orgCode、orgName、orgType、status、level、parentId 和 isLeaf
- **AND** 系统 SHALL 返回该节点的 `fullPath`
- **AND** 系统 SHALL 返回可直接展示的 `pathText`
- **AND** 系统 SHALL 返回 `selectable` 表示该节点是否可被当前选择场景选中

#### Scenario: 组织选择节点支持懒加载
- **WHEN** 管理端按 parentOrgCode 请求组织选择子节点
- **THEN** 系统 SHALL 只返回该父节点的直接未软删除子组织
- **AND** 系统 SHALL 为每个节点提供 isLeaf 以支持前端懒加载

#### Scenario: 组织选择节点支持搜索回显
- **WHEN** 管理端按 text 或 orgCode 搜索组织选择节点
- **THEN** 系统 SHALL 返回匹配节点及其 fullPath
- **AND** 前端 SHALL 能使用 fullPath 展开或回显被选组织

## MODIFIED Requirements

### Requirement: 查询组织树与组织列表
系统 SHALL 只从未软删除的组织中返回子节点、搜索结果、组织选择节点和详情，并补充当前代码计算出的派生字段。

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

#### Scenario: 查询组织选择节点
- **WHEN** 管理端使用组织树选择 contract 查询组织节点
- **THEN** 系统 SHALL 返回适用于选择器的 OrganizationSelectorNode
- **AND** OrganizationSelectorNode SHALL 包含 fullPath、pathText 和 selectable
- **AND** 系统 SHALL 支持通过组织类型和状态限制 selectable

#### Scenario: 查询组织详情
- **WHEN** 管理端按 orgCode 查询到未软删除组织
- **THEN** 系统 SHALL 返回组织 DTO、状态文本、未软删除直接子组织数量和相关未软删除 employment 数量

### Requirement: 删除组织受子节点和任职约束
系统 SHALL 仅在组织不存在未软删除直接子组织且不存在相关未软删除 employment 时软删除组织。

#### Scenario: 删除不存在组织
- **WHEN** 管理端删除的 orgCode 无法匹配未软删除组织
- **THEN** 系统 SHALL 拒绝删除并报告组织不存在

#### Scenario: 存在子组织时拒绝删除
- **WHEN** 待删除组织存在未软删除直接子组织
- **THEN** 系统 SHALL 拒绝删除并报告组织存在子级

#### Scenario: 存在任职时拒绝删除
- **WHEN** 待删除组织作为实际任职组织，或作为实际任职组织的祖先关联到未软删除 employment
- **THEN** 系统 SHALL 拒绝删除并报告组织存在任职关系

#### Scenario: 满足删除约束时软删除
- **WHEN** 待删除组织存在、没有未软删除直接子组织、且没有相关未软删除 employment
- **THEN** 系统 SHALL 将该组织的 `isDelete` 更新为 `true`
