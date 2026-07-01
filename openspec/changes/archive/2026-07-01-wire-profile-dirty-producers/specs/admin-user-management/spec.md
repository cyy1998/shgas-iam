## ADDED Requirements

### Requirement: 管理端用户写操作标记 profile dirty
管理端用户写操作 SHALL 在成功提交后触发对应用户的 API profile 重建。

#### Scenario: 创建用户标记 dirty
- **WHEN** 管理端成功创建用户
- **THEN** 系统 SHALL 在同一事务内标记新用户 profile dirty
- **AND** dirty reason SHALL include `UserUpdated`
- **AND** commit 后系统 SHALL best-effort enqueue 该用户的 rebuild job

#### Scenario: 更新用户资料标记 dirty
- **WHEN** 管理端成功更新用户 username、name、mobile、wxId、userType、status、orderNum 或删除状态
- **THEN** 系统 SHALL 在同一事务内标记该用户 profile dirty
- **AND** commit 后系统 SHALL best-effort enqueue 该用户的 rebuild job

#### Scenario: 禁用或删除用户同时保留 session revoke
- **WHEN** 管理端禁用或删除用户
- **THEN** 系统 SHALL 保持现有 Session Kernel 撤销行为
- **AND** 系统 SHALL 同时标记该用户 profile dirty
- **AND** profile dirty enqueue failure SHALL NOT 阻止 session revoke afterCommit task 注册

#### Scenario: 重置密码不标记 profile dirty
- **WHEN** 管理端仅重置用户密码且没有修改 profile 文档字段
- **THEN** 系统 SHALL NOT 因密码 hash 变化标记 profile dirty
- **AND** 系统 SHALL 保持现有 session revoke 行为
