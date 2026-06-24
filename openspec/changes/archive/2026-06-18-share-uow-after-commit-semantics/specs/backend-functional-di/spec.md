## ADDED Requirements

### Requirement: Shared UnitOfWork Infrastructure
后端 app SHALL 使用共享 UnitOfWork 基础设施表达 DB transaction、tx-bound ports 映射和 after-commit 副作用注册。共享 UoW MUST remain app-agnostic and MUST NOT depend on app-local repository, runtime, logger singleton, Redis singleton, or `@iam/db` concrete types.

#### Scenario: App composition wires shared UoW
- **WHEN** `api` 或 `admin-api` composition root 创建 production UnitOfWork
- **THEN** composition SHALL pass the app-local transaction executor and tx port factory to shared UoW infrastructure
- **AND** shared UoW SHALL create transaction context from app-local tx-bound ports without importing app-local modules

#### Scenario: Mapped UnitOfWork preserves afterCommit
- **WHEN** composition maps app-wide tx ports to a service-owned transaction port shape
- **THEN** mapped UnitOfWork SHALL expose only the mapped tx-bound business ports plus `afterCommit`
- **AND** mapped UnitOfWork MUST NOT drop or replace the `afterCommit` registration API

#### Scenario: Service transaction ports stay consumer-owned
- **WHEN** a service declares its UnitOfWork dependency
- **THEN** the service SHALL declare its own transaction port shape
- **AND** the service MAY use a shared `UnitOfWorkPort<TxPorts>` or equivalent type alias to include `afterCommit`

### Requirement: AfterCommit Supports Required And Best-Effort Effects
`afterCommit` callbacks SHALL run only after a successful DB transaction commit and SHALL support explicit `required` and `bestEffort` modes. Required after-commit failures SHALL affect the request result after commit, while best-effort failures SHALL be logged and ignored for the primary operation result.

#### Scenario: Transaction commit runs queued effects
- **WHEN** a transaction callback completes successfully and the DB transaction commits
- **THEN** UoW SHALL execute registered after-commit tasks after commit
- **AND** UoW SHALL await tasks in registration order
- **AND** UoW SHALL preserve required and best-effort task ordering when they are mixed

#### Scenario: Transaction failure discards queued effects
- **WHEN** a transaction callback throws or the DB transaction fails before commit
- **THEN** UoW SHALL NOT execute registered after-commit tasks
- **AND** UoW SHALL let the original transaction failure propagate

#### Scenario: Required effect failure is reported
- **WHEN** a required after-commit task throws after the DB transaction has committed
- **THEN** UoW SHALL log the failure through the injected after-commit logger
- **AND** UoW SHALL continue attempting remaining registered after-commit tasks
- **AND** UoW SHALL throw a structured API runtime error after all tasks have been attempted
- **AND** the error response SHALL use `ApiErrorCode.InternalError` without exposing internal integration details

#### Scenario: Best-effort effect failure is logged only
- **WHEN** a best-effort after-commit task throws after the DB transaction has committed
- **THEN** UoW SHALL log the failure through the injected after-commit logger
- **AND** UoW SHALL continue attempting remaining registered after-commit tasks
- **AND** UoW SHALL keep the primary operation result successful unless a required task failed

#### Scenario: AfterCommit task registration is synchronous
- **WHEN** service code calls `tx.afterCommit.required(name, task)` or `tx.afterCommit.bestEffort(name, task)`
- **THEN** the registration function SHALL return `void`
- **AND** the task MAY be synchronous or asynchronous
- **AND** the task name SHALL be included in structured after-commit logs

#### Scenario: Nested UoW is not supported
- **WHEN** a business workflow already owns an active UnitOfWork transaction
- **THEN** service code MUST NOT start another independent `uow.transaction(...)` for the same workflow
- **AND** shared UoW SHALL document that nested transaction ownership is unsupported for after-commit semantics

### Requirement: AfterCommit Test Fakes Match Runtime Semantics
Backend unit tests SHALL use shared UnitOfWork test fakes that preserve transaction callback and after-commit behavior closely enough to verify service logic without real DB, Redis, OIDC provider, or network dependencies.

#### Scenario: Immediate fake executes effects after callback success
- **WHEN** a service test uses an immediate UnitOfWork fake and the transaction callback succeeds
- **THEN** the fake SHALL execute registered after-commit tasks after the callback returns
- **AND** tests SHALL be able to assert that required and best-effort tasks were attempted

#### Scenario: Immediate fake preserves failure modes
- **WHEN** a required after-commit task throws in a service test
- **THEN** the fake SHALL throw after attempting remaining tasks
- **AND** when a best-effort after-commit task throws, the fake SHALL record or log the failure without failing the service result

## REMOVED Requirements

### Requirement: AfterCommit Is Best Effort And Observable
**Reason**: The previous requirement made all `afterCommit` callbacks best-effort, which no longer matches cache synchronization and token revocation semantics that must affect the request result after a successful DB commit.

**Migration**: Replace the legacy all-best-effort contract with `AfterCommit Supports Required And Best-Effort Effects`. Existing best-effort effects SHALL use `tx.afterCommit.bestEffort(...)`; effects that must affect the request result after commit SHALL use `tx.afterCommit.required(...)`.
