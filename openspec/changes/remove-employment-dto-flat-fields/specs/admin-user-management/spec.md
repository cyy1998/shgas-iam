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
- **AND** 用户详情 SHALL 在每条 employment 中使用结构化 `user`、`position` 和 `organization` 字段表达用户、岗位和组织上下文
- **AND** 用户详情 SHALL NOT 在每条 employment 顶层返回 username、name、mobile、wxId、posCode、posName、orgCode、orgName、orgType、compCode 和 compName deprecated 扁平字段

#### Scenario: 用户级角色权限只统计正常任职
- **WHEN** 管理端按 username 查询到用户且该用户存在多个状态的任职
- **THEN** 系统 SHALL 仅为 status 为 Enable 且未软删除的 employments 查询通过岗位、组织或任职直接关联得到的 active roles
- **AND** 系统 SHALL 仅通过这些正常任职关联的 role-privilege 关系查询 privileges
- **AND** 用户详情 SHALL 包含从正常任职聚合并去重后的 roles 和 privileges
- **AND** 用户详情 SHALL NOT 将 Pause 或 Disable 任职关联的 roles 或 privileges 计入用户级 roles 和 privileges
