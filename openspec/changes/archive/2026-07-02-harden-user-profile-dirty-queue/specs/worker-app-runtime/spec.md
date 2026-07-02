## MODIFIED Requirements

### Requirement: Worker operational commands
系统 SHALL 在 `@iam/worker` 中提供 user-profile backfill 和 repair 运维命令。

#### Scenario: Backfill command enqueues rebuild jobs
- **WHEN** operator runs user-profile backfill command
- **THEN** command SHALL scan users in batches、mark dirty rows and enqueue versioned user-level rebuild jobs
- **AND** backfill SHALL create new dirty versions with reason `Backfill`
- **AND** command SHALL NOT synchronously rebuild profiles outside BullMQ worker processing

#### Scenario: Repair command re-enqueues repairable dirty rows
- **WHEN** operator runs user-profile repair command
- **THEN** command SHALL scan failed、stale pending 或 stale processing dirty rows and enqueue rebuild jobs for their current dirtyVersion
- **AND** repair SHALL NOT create new dirty versions
- **AND** command SHALL report enqueue count and affected user ids or batches

#### Scenario: Repair command uses stale window
- **WHEN** operator runs user-profile repair command without explicit `stale-before`
- **THEN** command SHALL calculate `staleBefore` from current time minus configured user-profile repair stale seconds
- **AND** pending or processing rows newer than that threshold SHALL NOT be repaired by default

#### Scenario: Operational commands do not start consumers
- **WHEN** operator runs user-profile backfill or repair command
- **THEN** command SHALL create the runtime dependencies needed to mark dirty rows and enqueue jobs
- **AND** command SHALL NOT start BullMQ consumers
- **AND** command SHALL NOT start worker HTTP server or BullMQ dashboard

## ADDED Requirements

### Requirement: User profile worker logs include dirtyVersion
系统 SHALL include dirtyVersion in user-profile worker and command logs for rebuild observability.

#### Scenario: Rebuild job log includes version
- **WHEN** worker logs completion, skip, stale completion or failure for `rebuild-user-profile`
- **THEN** log fields SHALL include `userId`、`dirtyVersion`、`jobId` and `jobName`

#### Scenario: Repair and backfill logs include batch outcome
- **WHEN** repair or backfill command enqueues rebuild jobs
- **THEN** command logs SHALL include enqueue count and enough batch context to identify affected users or batches
