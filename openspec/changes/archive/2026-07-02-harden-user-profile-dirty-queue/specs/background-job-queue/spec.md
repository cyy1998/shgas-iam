## MODIFIED Requirements

### Requirement: Deterministic job identifiers
系统 SHALL 提供 BullMQ-compatible deterministic jobId 工具，支持按业务实体和业务版本去重的任务入队策略。

#### Scenario: User profile rebuild job id
- **WHEN** producer 为 `userId=123` and `dirtyVersion=42` 构造 user-profile rebuild jobId
- **THEN** 系统 SHALL 生成包含 job name、userId 和 dirtyVersion 的确定性 jobId
- **AND** jobId MUST NOT contain `:` characters

#### Scenario: User profile scope expansion job id
- **WHEN** producer 为 `scopeType=organization-id`、`scopeId=9` 和时间桶 `2026-06-30T10:00` 构造 scope expansion jobId
- **THEN** 系统 SHALL 生成包含 job name、scope type、scope id 和 encoded bucket 的确定性 jobId
- **AND** jobId MUST NOT contain `:` characters

#### Scenario: Job id parts are encoded before joining
- **WHEN** deterministic jobId part contains reserved separator、`,` or `:` characters
- **THEN** 系统 SHALL encode that part before joining
- **AND** different part arrays MUST NOT collapse into the same jobId due to separator ambiguity

#### Scenario: New user profile dirty version receives new job id
- **WHEN** producer 为同一 userId 但不同 dirtyVersion 构造 user-profile rebuild jobId
- **THEN** 系统 SHALL return different jobIds
- **AND** a retained completed or failed BullMQ job for an older dirtyVersion MUST NOT suppress enqueue of the newer dirtyVersion

### Requirement: User profile job contracts
系统 SHALL 在 `@iam/contracts` 中提供 user-profile job contract，包括 queue name、job name、scope 类型、dirty reason、dirty status、dirtyVersion 和 Zod payload schema，供 producer 与 worker 共同校验。

#### Scenario: Producer validates rebuild payload
- **WHEN** producer enqueue `rebuild-user-profile` job
- **THEN** 系统 SHALL 使用共享 Zod schema 校验 payload 包含有效 `userId` and decimal-string `dirtyVersion`
- **AND** `dirtyVersion` SHALL be required

#### Scenario: Worker rejects invalid payload
- **WHEN** worker 收到不符合 user-profile job schema 的 payload
- **THEN** 系统 SHALL 将 payload 校验为失败，并阻止 processor 使用未校验数据继续执行
- **AND** invalid payload failure SHALL NOT mark any business dirty row as failed

#### Scenario: Admin API does not import API private modules
- **WHEN** `apps/admin-api` 后续作为 user-profile job producer
- **THEN** 系统 SHALL 允许它依赖 `@iam/contracts` 的 job contract、`@iam/jobs` 的 queue helper 和 `@iam/user-profile-read-model` 的 producer，而不依赖 `@api` 私有模块

#### Scenario: Rebuild batch producer validates every payload
- **WHEN** producer enqueue a batch of `rebuild-user-profile` jobs
- **THEN** 系统 SHALL validate every payload using the shared rebuild payload schema
- **AND** each job SHALL use deterministic `userId + dirtyVersion` jobId

## ADDED Requirements

### Requirement: User profile scope expansion is not a source-write fact
系统 SHALL prevent API/admin-api source-write paths from using `expand-user-profile-scope` as the only persisted fact for profile rebuild.

#### Scenario: Business writes enqueue user-level rebuilds from dirty rows
- **WHEN** `apps/api` or `apps/admin-api` source write paths need to wake user-profile worker after persisting dirty rows
- **THEN** they SHALL enqueue versioned user-level rebuild jobs derived from persisted dirty rows
- **AND** they SHALL NOT only enqueue `expand-user-profile-scope` as the dirty source of truth

#### Scenario: Scope expansion remains available for worker or ops usage
- **WHEN** worker-side code or future ops commands need to rebuild a scope manually
- **THEN** they MAY use `expand-user-profile-scope`
- **AND** the scope expansion processor SHALL persist user-level dirty rows before enqueueing rebuild jobs
