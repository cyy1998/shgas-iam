## ADDED Requirements

### Requirement: 管理端任职写操作标记 profile dirty
管理端任职生命周期写操作 SHALL 标记受影响用户 profile dirty，使用户详情和搜索文档中的 employments、roles、privileges、organization context 和 primary 标记最终收敛。

#### Scenario: 创建任职标记用户 dirty
- **WHEN** 管理端成功创建任职
- **THEN** 系统 SHALL 在同一事务内标记该任职所属用户 profile dirty
- **AND** dirty reason SHALL include `EmploymentUpdated`
- **AND** commit 后系统 SHALL best-effort enqueue 该用户的 rebuild job

#### Scenario: 更新任职标记用户 dirty
- **WHEN** 管理端成功更新任职 startTime、description、isPrimary 或其它 profile-relevant 字段
- **THEN** 系统 SHALL 在同一事务内标记该任职所属用户 profile dirty
- **AND** 如果该操作取消同一用户其它主岗标记，系统 SHALL 仍至少标记该用户一次 dirty

#### Scenario: 更新任职状态或删除任职标记用户 dirty
- **WHEN** 管理端成功禁用、启用或软删除任职
- **THEN** 系统 SHALL 在同一事务内标记该任职所属用户 profile dirty
- **AND** commit 后系统 SHALL best-effort enqueue 该用户的 rebuild job

#### Scenario: 转岗标记用户 dirty
- **WHEN** 管理端成功结束旧任职并创建新任职
- **THEN** 系统 SHALL 在同一事务内标记该用户 profile dirty
- **AND** dirty record SHALL cover both old employment removal and new employment addition

#### Scenario: 设置主岗标记用户 dirty
- **WHEN** 管理端成功设置某任职为主岗
- **THEN** 系统 SHALL 在同一事务内标记该用户 profile dirty
- **AND** profile 重建 SHALL eventually reflect the new primary employment state

#### Scenario: 用户离职标记用户 dirty
- **WHEN** 管理端成功结束用户 active employments 并禁用该用户
- **THEN** 系统 SHALL 在同一事务内标记该用户 profile dirty
- **AND** dirty reasons SHALL include `EmploymentUpdated` and `UserUpdated`
