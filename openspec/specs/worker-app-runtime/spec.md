## Purpose

定义独立 `apps/worker` 后台任务运行时、模块注册、health endpoint、BullMQ dashboard、运维命令和 Docker Compose 启动契约。
## Requirements
### Requirement: Worker app runtime
系统 SHALL 提供独立 `apps/worker` 后台任务运行时，用于启动和管理 BullMQ job consumers。

#### Scenario: Worker starts enabled modules
- **WHEN** `apps/worker` 启动且 `IAM_WORKER_ENABLED_MODULES` 包含 `user-profile` 或 `all`
- **THEN** worker SHALL 创建 user-profile job module 并启动对应 BullMQ Worker
- **AND** worker SHALL 使用 `IAM_WORKER_USER_PROFILE_CONCURRENCY` 配置 user-profile consumer 并发

#### Scenario: Worker supports dashboard-only mode
- **WHEN** `apps/worker` 启动且 `IAM_WORKER_ENABLED_MODULES=none`
- **THEN** worker SHALL NOT 启动任何 BullMQ consumer
- **AND** worker MAY 继续启动 health endpoint 和 BullMQ dashboard

#### Scenario: Worker shuts down gracefully
- **WHEN** worker 收到 `SIGTERM` 或 `SIGINT`
- **THEN** worker SHALL 关闭已启动的 BullMQ workers、queues、HTTP server 和 Redis connections
- **AND** worker SHALL log shutdown signal 和模块关闭结果

### Requirement: Worker module registry
系统 SHALL 使用 worker module registry 注册后台任务能力，而不是在 `apps/worker` 中硬编码每个任务的内部 wiring。

#### Scenario: User profile module registers consumers and queues
- **WHEN** user-profile module 被创建
- **THEN** module SHALL 提供 module key、dashboard queue registrations、consumer start handler 和 close handler
- **AND** module SHALL 封装 user-profile queue、processor、builder、repository 和 worker service wiring

#### Scenario: Worker filters enabled modules
- **WHEN** `IAM_WORKER_ENABLED_MODULES` 指定一个或多个 module keys
- **THEN** worker SHALL 只启动匹配 module 的 consumers
- **AND** 未知 module key SHALL cause startup failure

### Requirement: Worker health endpoint
系统 SHALL 在 `apps/worker` 中提供极简 HTTP health endpoint。

#### Scenario: Health endpoint reports ready worker
- **WHEN** worker runtime 已成功启动 HTTP server、runtime dependencies 和 enabled modules
- **THEN** `GET /healthz` SHALL 返回成功状态
- **AND** 响应 SHALL 表示已启用 modules 和 dashboard-only 状态

#### Scenario: Health endpoint reports startup or dependency failure
- **WHEN** worker runtime 无法连接必要 DB/Redis dependency 或 module startup 失败
- **THEN** health endpoint SHALL 返回非成功状态
- **AND** worker SHALL log 失败原因

### Requirement: Worker BullMQ dashboard
系统 SHALL 在 `apps/worker` HTTP server 中提供内部 BullMQ dashboard。

#### Scenario: Dashboard requires Basic Auth
- **WHEN** BullMQ dashboard enabled
- **THEN** dashboard routes SHALL require Basic Auth
- **AND** production-like env SHALL require non-empty username and password before dashboard can start

#### Scenario: Dashboard defaults to read-only mode
- **WHEN** BullMQ dashboard enabled and `IAM_WORKER_BULL_BOARD_READ_ONLY` is not explicitly false
- **THEN** dashboard SHALL register queues with read-only mode
- **AND** dashboard SHALL NOT expose retry、clean、remove 或其它修改队列状态的操作

#### Scenario: Dashboard write operations require explicit opt-in
- **WHEN** `IAM_WORKER_BULL_BOARD_READ_ONLY=false`
- **THEN** dashboard MAY expose queue mutation actions supported by Bull Board
- **AND** Basic Auth SHALL still be required

#### Scenario: Dashboard uses known queue registration
- **WHEN** dashboard starts with `IAM_WORKER_BULL_BOARD_QUEUES=all` or a comma-separated module list
- **THEN** dashboard SHALL register queues from known worker modules
- **AND** dashboard SHALL NOT auto-scan Redis keys to discover queues

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

### Requirement: Worker Docker services
系统 SHALL 在 Docker Compose 中提供独立 worker consumer 和 dashboard-only services。

#### Scenario: User profile worker service consumes jobs
- **WHEN** dev 或 prod compose 启动 `worker-user-profile`
- **THEN** service SHALL run `apps/worker` with `IAM_WORKER_ENABLED_MODULES=user-profile`
- **AND** service SHALL NOT publish BullMQ dashboard by default

#### Scenario: Dashboard service does not consume jobs
- **WHEN** dev 或 prod compose 启动 `worker-dashboard`
- **THEN** service SHALL run `apps/worker` with `IAM_WORKER_ENABLED_MODULES=none`
- **AND** service SHALL enable BullMQ dashboard for configured known queues

### Requirement: User profile worker logs include dirtyVersion
系统 SHALL include dirtyVersion in user-profile worker and command logs for rebuild observability.

#### Scenario: Rebuild job log includes version
- **WHEN** worker logs completion, skip, stale completion or failure for `rebuild-user-profile`
- **THEN** log fields SHALL include `userId`、`dirtyVersion`、`jobId` and `jobName`

#### Scenario: Repair and backfill logs include batch outcome
- **WHEN** repair or backfill command enqueues rebuild jobs
- **THEN** command logs SHALL include enqueue count and enough batch context to identify affected users or batches
