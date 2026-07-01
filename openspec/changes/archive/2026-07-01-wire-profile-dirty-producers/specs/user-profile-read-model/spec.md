## ADDED Requirements

### Requirement: Source writes produce profile dirty records
系统 SHALL 在会影响 API user profile 的源表写事务中持久化受影响用户的 `user_profile_dirty` 记录，并在事务提交后唤醒 user-profile worker。

#### Scenario: User-level write marks dirty in transaction
- **WHEN** 源表写操作已确定单个受影响 userId
- **THEN** 系统 SHALL 在同一业务事务内 upsert 该 userId 的 `user_profile_dirty` 记录
- **AND** dirty reason SHALL 使用与写操作匹配的 `UserProfileDirtyReason`
- **AND** 重复标记同一 userId SHALL 合并 reason codes

#### Scenario: Scope write persists expanded users before wake-up
- **WHEN** 源表写操作影响组织、岗位或其它多用户 scope
- **THEN** 系统 SHALL 在同一业务事务内解析受影响 userIds 并持久化这些用户的 dirty 记录
- **AND** 系统 SHALL NOT 仅依赖 BullMQ scope expansion job 作为受影响用户的唯一事实来源

#### Scenario: Worker wake-up happens after commit
- **WHEN** 业务事务成功提交
- **THEN** 系统 SHALL 通过 afterCommit best-effort enqueue user-profile rebuild 或 scope expansion job
- **AND** enqueue failure SHALL be logged
- **AND** enqueue failure SHALL NOT roll back the already committed business transaction

#### Scenario: Dirty rows are repairable after enqueue failure
- **WHEN** afterCommit enqueue 失败或 job 丢失导致 dirty row 长时间停留在 pending 状态
- **THEN** user-profile repair SHALL be able to scan stale pending dirty rows
- **AND** repair SHALL enqueue rebuild jobs for those pending rows

#### Scenario: Producer uses shared contracts
- **WHEN** `apps/api` 或 `apps/admin-api` enqueue user-profile job
- **THEN** producer SHALL validate payloads using shared `@iam/contracts` user-profile job schemas
- **AND** producer SHALL use deterministic job identifiers for duplicate wake-up suppression

#### Scenario: Admin API does not import API private producer
- **WHEN** `apps/admin-api` marks user-profile dirty or enqueues user-profile jobs
- **THEN** it SHALL NOT import `@api` private modules
- **AND** it SHALL depend only on shared contracts/jobs/db modules or app-local ports wired to shared helpers
