## ADDED Requirements

### Requirement: Active employment relationship uniqueness is enforced by storage
系统 SHALL 使用 PostgreSQL 唯一保护确保同一用户、实际任职组织和岗位最多存在一条 Enable 且未软删除的 employment。

#### Scenario: 并发创建相同 active employment
- **WHEN** 两个管理端创建请求尝试为同一 userId、orgId 和 posId 创建 Enable 且未软删除的 employment
- **THEN** PostgreSQL SHALL 只允许其中一条 active employment 写入成功
- **AND** 失败请求 SHALL 被映射为 centralized employment already exists error

#### Scenario: 转岗创建的新 active employment 已存在
- **WHEN** 管理端转岗请求结束旧 employment 后尝试创建的新 userId、orgId 和 posId active employment 已存在
- **THEN** 系统 SHALL 拒绝转岗并报告相同任职关系已存在
- **AND** 事务 SHALL 回滚旧 employment 的结束状态更新

#### Scenario: 历史 employment 不阻止新的 active employment
- **WHEN** 同一 userId、orgId 和 posId 只存在 Disable 或已软删除的 employment
- **THEN** 系统 SHALL 允许创建新的 Enable 且未软删除 employment
