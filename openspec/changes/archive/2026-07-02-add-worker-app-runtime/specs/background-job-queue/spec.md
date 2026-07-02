## ADDED Requirements

### Requirement: BullMQ dashboard queue registration
系统 SHALL 支持将已知 BullMQ queues 注册到内部 dashboard，而不依赖 Redis key 自动扫描。

#### Scenario: Dashboard receives explicit queue registrations
- **WHEN** worker dashboard starts
- **THEN** dashboard SHALL receive queue registrations from known worker modules
- **AND** each registration SHALL include queue name and BullMQ Queue instance or equivalent adapter input

#### Scenario: Dashboard read-only mode is configurable per queue
- **WHEN** worker dashboard registers a queue and read-only mode is enabled
- **THEN** queue adapter SHALL be configured in read-only mode
- **AND** queue mutation actions SHALL NOT be available through dashboard UI

## MODIFIED Requirements

### Requirement: Deterministic job identifiers
系统 SHALL 提供 BullMQ-compatible deterministic jobId 工具，支持按业务实体去重的任务入队策略。

#### Scenario: User profile rebuild job id
- **WHEN** producer 为 `userId=123` 构造 user-profile rebuild jobId
- **THEN** 系统 SHALL 生成包含 job name 和 userId 的确定性 jobId
- **AND** jobId MUST NOT contain `:` characters

#### Scenario: User profile scope expansion job id
- **WHEN** producer 为 `scopeType=organization-id`、`scopeId=9` 和时间桶 `2026-06-30T10:00` 构造 scope expansion jobId
- **THEN** 系统 SHALL 生成包含 job name、scope type、scope id 和 encoded bucket 的确定性 jobId
- **AND** jobId MUST NOT contain `:` characters

#### Scenario: Job id parts are encoded before joining
- **WHEN** deterministic jobId part contains reserved separator、`,` or `:` characters
- **THEN** 系统 SHALL encode that part before joining
- **AND** different part arrays MUST NOT collapse into the same jobId due to separator ambiguity
