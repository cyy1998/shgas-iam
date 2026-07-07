## ADDED Requirements

### Requirement: 角色管理页面通过选择器选择关联对象
系统 SHALL 在 `admin` 角色管理页面中使用可搜索选择控件选择角色所属应用和角色分配目标，避免管理员手填应用编码、组织编码、岗位编码或任职 ID。

#### Scenario: 创建角色时选择所属应用
- **WHEN** 管理员在角色管理页面新建角色
- **THEN** 页面 SHALL 提供可搜索的所属应用选择控件
- **AND** 选项 SHALL 展示应用名称和 `clientCode`
- **AND** 提交角色创建请求时 SHALL 使用所选应用的 `clientCode`
- **AND** 页面 SHALL NOT 要求管理员手填所属应用编码

#### Scenario: 角色列表按所属应用选择筛选
- **WHEN** 管理员在角色列表筛选所属应用
- **THEN** 页面 SHALL 提供可搜索的所属应用选择控件
- **AND** 选项 SHALL 展示应用名称和 `clientCode`
- **AND** 查询角色列表时 SHALL 使用所选应用的 `clientCode` 作为精确筛选条件

#### Scenario: 新增组织角色分配时选择组织
- **WHEN** 管理员新增角色分配并选择 organization 分配类型
- **THEN** 页面 SHALL 提供组织树或组织搜索选择控件
- **AND** 提交角色分配创建请求时 SHALL 使用所选组织的 `orgCode`
- **AND** 页面 SHALL 提供 `includeDescendants` 开关且默认值为 true
- **AND** 页面 SHALL NOT 要求管理员手填组织编码

#### Scenario: 新增岗位角色分配时选择岗位
- **WHEN** 管理员新增角色分配并选择 position 分配类型
- **THEN** 页面 SHALL 提供可搜索的岗位选择控件
- **AND** 选项 SHALL 展示岗位名称和 `posCode`
- **AND** 提交角色分配创建请求时 SHALL 使用所选岗位的 `posCode`
- **AND** 页面 SHALL NOT 要求管理员手填岗位编码

#### Scenario: 新增任职角色分配时选择任职
- **WHEN** 管理员新增角色分配并选择 employment 分配类型
- **THEN** 页面 SHALL 提供可搜索的任职选择控件
- **AND** 选项 SHALL 展示用户、任职组织、岗位和任职 ID 摘要
- **AND** 提交角色分配创建请求时 SHALL 使用所选任职的 `employmentId`
- **AND** 页面 SHALL NOT 要求管理员手填任职 ID

#### Scenario: 切换分配类型不会提交旧字段
- **WHEN** 管理员在新增角色分配表单中切换 `targetType`
- **THEN** 页面 SHALL 清理不属于当前分配类型的 `orgCode`、`posCode`、`employmentId` 和 `includeDescendants` 表单值
- **AND** position 或 employment 分配请求 SHALL NOT 携带 `includeDescendants=true`
