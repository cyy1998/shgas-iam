## ADDED Requirements

### Requirement: 管理端岗位写操作标记 profile dirty
管理端岗位写操作 SHALL 标记受影响用户 profile dirty，使 profile 中的 position summary 和搜索文档最终收敛。

#### Scenario: 更新岗位属性标记 users dirty
- **WHEN** 管理端成功更新岗位编码、名称、状态、描述或其它 profile-relevant 字段
- **THEN** 系统 SHALL 在同一事务内解析该岗位 active employments 的用户
- **AND** 系统 SHALL 标记这些用户 profile dirty
- **AND** dirty reason SHALL include `PositionUpdated`

#### Scenario: 删除岗位标记 affected users dirty when present
- **WHEN** 管理端成功软删除岗位
- **THEN** 系统 SHALL 在同一事务内解析该岗位下受影响用户
- **AND** 如果存在受影响用户，系统 SHALL 标记这些用户 profile dirty
- **AND** 如果删除约束保证没有受影响用户，系统 SHALL NOT 创建无目标 dirty 记录

#### Scenario: 创建空岗位不要求 dirty
- **WHEN** 管理端创建尚无任职用户的新岗位
- **THEN** 系统 SHALL NOT 要求为该岗位创建 user profile dirty 记录
- **AND** 后续使用该岗位创建任职 SHALL 由任职写路径标记用户 dirty

#### Scenario: 岗位 scope wake-up is best-effort
- **WHEN** 岗位写事务提交并已持久化受影响用户 dirty
- **THEN** 系统 SHALL best-effort enqueue position scope expansion or rebuild wake-up
- **AND** enqueue failure SHALL NOT remove the persisted dirty rows
