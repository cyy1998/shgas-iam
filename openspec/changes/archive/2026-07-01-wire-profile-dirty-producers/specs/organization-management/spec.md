## ADDED Requirements

### Requirement: 管理端组织写操作标记 profile dirty
管理端组织写操作 SHALL 标记受影响用户 profile dirty，使 profile 中的 organization context、ancestor path 和搜索文档最终收敛。

#### Scenario: 更新组织属性标记 descendant users dirty
- **WHEN** 管理端成功更新组织编码、名称、类型、父级、排序、状态或其它 profile-relevant 字段
- **THEN** 系统 SHALL 在同一事务内解析该组织及 descendant 组织下 active employments 的用户
- **AND** 系统 SHALL 标记这些用户 profile dirty
- **AND** dirty reason SHALL include `OrganizationUpdated`

#### Scenario: 删除组织标记 affected users dirty when present
- **WHEN** 管理端成功软删除组织
- **THEN** 系统 SHALL 在同一事务内解析该组织及 descendant 组织下受影响用户
- **AND** 如果存在受影响用户，系统 SHALL 标记这些用户 profile dirty
- **AND** 如果删除约束保证没有受影响用户，系统 SHALL NOT 创建无目标 dirty 记录

#### Scenario: 创建空组织不要求 dirty
- **WHEN** 管理端创建尚无任职用户的新组织
- **THEN** 系统 SHALL NOT 要求为该组织创建 user profile dirty 记录
- **AND** 后续在该组织下创建任职 SHALL 由任职写路径标记用户 dirty

#### Scenario: 组织 scope wake-up is best-effort
- **WHEN** 组织写事务提交并已持久化受影响用户 dirty
- **THEN** 系统 SHALL best-effort enqueue organization scope expansion or rebuild wake-up
- **AND** enqueue failure SHALL NOT remove the persisted dirty rows
