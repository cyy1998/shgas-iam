## ADDED Requirements

### Requirement: 管理端暴露角色管理操作
系统 SHALL 通过管理端 REST 和 tRPC 暴露角色搜索、详情、创建、更新、状态变更、删除和角色分配管理操作。

#### Scenario: REST 角色接口可用
- **WHEN** 调用 `/admin/roles` 下的角色搜索、详情、创建、更新、状态变更、删除或分配管理路由
- **THEN** 系统 SHALL 校验请求输入并调用对应 role operation

#### Scenario: tRPC 角色接口可用
- **WHEN** 管理后台通过 `admin.role` tRPC router 调用角色管理操作
- **THEN** 系统 SHALL 复用与 REST 路由一致的 role operation

### Requirement: 管理端搜索角色
系统 SHALL 在未软删除角色中按分页条件搜索角色，并返回所属应用摘要和分配数量。

#### Scenario: 模糊和精确条件搜索
- **WHEN** 管理端提交角色分页查询条件
- **THEN** 系统 SHALL 在 `roleCode` 和 `roleName` 中对 text 做模糊匹配
- **AND** 系统 SHALL 支持按所属 client 和 `RoleStatus` 精确筛选
- **AND** 系统 SHALL 只返回 `isDelete=false` 的角色

#### Scenario: 搜索结果包含分配数
- **WHEN** 角色搜索返回分页结果
- **THEN** 每条结果 SHALL 包含该角色当前 `role_assignment` 记录数量
- **AND** 分配数 SHALL 不统计已不存在的其它旧分配表

### Requirement: 管理端维护角色本体
系统 SHALL 允许管理员创建、更新、变更状态和软删除角色，并保持角色编码和所属应用不可变。

#### Scenario: 创建角色
- **WHEN** 管理端提交角色创建请求且 roleCode 未被任何角色占用
- **THEN** 系统 SHALL 创建角色记录
- **AND** 创建请求中的所属 client MUST 存在且未软删除
- **AND** 所属 client MAY 处于非启用状态

#### Scenario: 创建重复角色编码
- **WHEN** 管理端提交的 roleCode 已被已有角色占用
- **THEN** 系统 SHALL 拒绝创建并报告角色编码已存在

#### Scenario: 更新角色可变字段
- **WHEN** 管理端按 roleCode 更新角色
- **THEN** 系统 SHALL 仅允许更新 `roleName`、`description` 和 `status` 等可变字段
- **AND** 系统 SHALL NOT 修改已创建角色的 `roleCode` 或所属 client

#### Scenario: 查询角色详情
- **WHEN** 管理端按 roleCode 查询角色详情
- **THEN** 系统 SHALL 返回未软删除角色详情和所属 client 摘要
- **AND** 当角色不存在或已软删除时，系统 SHALL 返回未找到错误

#### Scenario: 删除仍有分配的角色
- **WHEN** 管理端删除仍存在 `role_assignment` 记录的角色
- **THEN** 系统 SHALL 拒绝删除并报告角色仍存在分配

#### Scenario: 删除无分配角色
- **WHEN** 管理端删除不存在 `role_assignment` 记录的角色
- **THEN** 系统 SHALL 将该角色标记为软删除
- **AND** 系统 SHALL NOT 因 `role_privilege` 记录阻止本次删除

### Requirement: 管理端管理角色分配
系统 SHALL 允许管理员从角色详情管理该角色分配到的组织、岗位和任职目标。

#### Scenario: 分页查询角色分配
- **WHEN** 管理端查询某个角色的分配列表
- **THEN** 系统 SHALL 返回分页结果
- **AND** 结果 SHALL 支持按 target type、文本和 `includeDescendants` 筛选
- **AND** 每条结果 SHALL 包含 target type、target id、当前对象摘要、`includeDescendants`、createTime 和 updateTime

#### Scenario: 创建组织角色分配
- **WHEN** 管理端为角色创建 organization 分配并提供 orgCode
- **THEN** 系统 SHALL 将 orgCode 解析为启用且未软删除的 organization id
- **AND** 系统 SHALL 创建 `targetType=organization` 的 `role_assignment`
- **AND** 未提供 `includeDescendants` 时 SHALL 默认写入 true

#### Scenario: 创建岗位角色分配
- **WHEN** 管理端为角色创建 position 分配并提供 posCode
- **THEN** 系统 SHALL 将 posCode 解析为启用且未软删除的 position id
- **AND** 系统 SHALL 创建 `targetType=position` 且 `includeDescendants=false` 的 `role_assignment`

#### Scenario: 创建任职角色分配
- **WHEN** 管理端为角色创建 employment 分配并提供 employmentId
- **THEN** 系统 SHALL 校验该 employment 启用且未软删除
- **AND** 系统 SHALL 创建 `targetType=employment` 且 `includeDescendants=false` 的 `role_assignment`

#### Scenario: 非组织分配拒绝 includeDescendants true
- **WHEN** 管理端创建 position 或 employment 分配且输入包含 `includeDescendants=true`
- **THEN** 系统 SHALL 拒绝请求并报告该字段仅适用于组织分配

#### Scenario: 重复创建角色分配
- **WHEN** 管理端创建已存在的 `(roleId, targetType, targetId)` 分配
- **THEN** 系统 SHALL 拒绝请求并报告角色分配已存在

#### Scenario: 修改组织分配作用范围
- **WHEN** 管理端修改 organization 分配的 `includeDescendants`
- **THEN** 系统 SHALL 更新该分配记录
- **AND** 系统 SHALL 拒绝修改非 organization 分配的作用范围

#### Scenario: 删除角色分配
- **WHEN** 管理端删除某条角色分配
- **THEN** 系统 SHALL 物理删除该 `role_assignment` 记录
- **AND** 后续该角色分配列表 SHALL 不再返回该记录

### Requirement: 角色管理写操作产生审计和画像刷新
系统 SHALL 为角色本体和角色分配 mutation 写入管理端审计日志，并在角色分配变化时触发受影响用户画像重建。

#### Scenario: 角色本体 mutation 写入审计
- **WHEN** 管理员创建、更新、变更状态或删除角色成功
- **THEN** 系统 SHALL 写入对应 `admin.role.*` action 的审计记录
- **AND** 审计 target SHALL 为该角色

#### Scenario: 角色分配 mutation 写入审计
- **WHEN** 管理员创建、修改作用范围或删除角色分配成功
- **THEN** 系统 SHALL 写入对应 `admin.role.assignment.*` action 的审计记录
- **AND** 审计 target SHALL 为该角色
- **AND** 分配目标的安全摘要 SHALL 写入 details

#### Scenario: 角色分配 mutation 标记画像 dirty
- **WHEN** 管理员创建、修改作用范围或删除角色分配成功
- **THEN** 系统 SHALL 在同一业务事务内标记受影响 scope 的 user-profile dirty
- **AND** dirty reason SHALL 使用 `UserProfileDirtyReason.RoleUpdated`

### Requirement: 管理端页面管理角色
系统 SHALL 在 `admin` 应用中提供 `/roles` 角色管理页面，使管理员可以通过页面完成角色本体和角色分配维护。

#### Scenario: 角色管理菜单可见
- **WHEN** 管理员拥有 admin 访问权限并打开 admin 应用
- **THEN** 菜单 SHALL 包含“角色管理”入口
- **AND** 入口 SHALL 导航到 `/roles`

#### Scenario: 查看角色列表
- **WHEN** 管理员打开角色管理页面
- **THEN** 页面 SHALL 展示 roleCode、roleName、所属应用、status、assignmentCount 和 createTime 等列表信息
- **AND** 页面 SHALL 提供关键字搜索、所属应用筛选和状态筛选

#### Scenario: 维护角色本体
- **WHEN** 管理员在角色管理页面创建、编辑、变更状态或删除角色
- **THEN** 页面 SHALL 调用 admin role tRPC 对应接口
- **AND** 操作成功后 SHALL 刷新相关列表或详情并展示成功反馈

#### Scenario: 管理角色分配
- **WHEN** 管理员打开角色详情的分配对象 tab
- **THEN** 页面 SHALL 分页展示该角色的组织、岗位和任职分配
- **AND** 页面 SHALL 支持新增分配、删除分配和修改组织作用范围
- **AND** 页面 SHALL NOT 提供角色权限绑定管理入口
