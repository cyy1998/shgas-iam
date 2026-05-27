## MODIFIED Requirements

### Requirement: 管理端查询用户详情聚合权限
系统 SHALL 查询未软删除用户详情，展示该用户所有未软删除任职，并仅从当前正常任职聚合用户级角色和权限。

#### Scenario: 用户不存在
- **WHEN** 管理端按 username 查询不到未软删除用户
- **THEN** 系统 SHALL 拒绝请求并报告用户不存在

#### Scenario: 用户详情包含全部未软删除任职
- **WHEN** 管理端按 username 查询到用户
- **THEN** 系统 SHALL 查询该用户 status 为 Enable、Pause 或 Disable 且未软删除的 employments
- **AND** 用户详情 SHALL 在 employments 中返回这些任职的岗位、实际任职组织、完整组织链、公司节点、状态、起止时间、角色和权限信息
- **AND** 用户详情 SHALL 在每条 employment 中保留 deprecated 扁平字段用于兼容旧前端和第三方

#### Scenario: 用户级角色权限只统计正常任职
- **WHEN** 管理端按 username 查询到用户且该用户存在多个状态的任职
- **THEN** 系统 SHALL 仅为 status 为 Enable 且未软删除的 employments 查询通过岗位、组织或任职直接关联得到的 active roles
- **AND** 系统 SHALL 仅通过这些正常任职关联的 role-privilege 关系查询 privileges
- **AND** 用户详情 SHALL 包含从正常任职聚合并去重后的 roles 和 privileges
- **AND** 用户详情 SHALL NOT 将 Pause 或 Disable 任职关联的 roles 或 privileges 计入用户级 roles 和 privileges

### Requirement: 管理端用户查询聚合服务规则具备单元测试覆盖
系统 SHALL 为管理端用户分页搜索和详情聚合规则提供 Bun 单元测试覆盖，且测试不得依赖真实数据库、Redis 或网络。

#### Scenario: 管理端模糊搜索映射分页结果
- **WHEN** `searchUsersFuzzyForAdmin` 被调用
- **THEN** 单元测试 SHALL 验证 rows 通过 `UserDtoSchema` 映射
- **AND** 单元测试 SHALL 验证 total 为 0 时 pages 为 0
- **AND** 单元测试 SHALL 验证 total 大于 0 时 pages 为 `Math.ceil(total / pageSize)`
- **AND** 单元测试 SHALL 验证返回 pageNum、pageSize、total、pages 和 result

#### Scenario: 管理端用户详情聚合任职角色权限
- **WHEN** `getUserDetailByUsernameForAdmin` 被调用且目标用户不存在
- **THEN** 单元测试 SHALL 验证服务抛出“用户不存在”
- **AND** 单元测试 SHALL 验证用户存在时返回正常、暂停和结束状态的未软删除 employments
- **AND** 单元测试 SHALL 验证用户级 roles 和 privileges 只从正常任职聚合并去重
- **AND** 单元测试 SHALL 验证暂停或结束任职的 roles 和 privileges 不计入用户级 roles 和 privileges
- **AND** 单元测试 SHALL 验证 employment detail 中包含岗位、实际任职组织、完整组织链、公司节点、deprecated 扁平字段、状态、起止时间、角色和权限信息
