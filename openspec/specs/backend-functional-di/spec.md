# backend-functional-di Specification

## Purpose
Capture backend functional dependency injection rules for app-local composition roots, explicit Ports, UnitOfWork transactions, integration adapters, test fakes, and architecture guards.

## Requirements
### Requirement: Backend Modules Use Functional Factories
后端可替换业务模块 SHALL 导出函数工厂和类型，而不是导出已绑定生产 singleton。生产实例 SHALL 只在 app composition root 中创建。

#### Scenario: Service exports factory
- **WHEN** 维护者查看 `apps/api/src` 或 `apps/admin-api/src` 下的 service module
- **THEN** 该 module SHALL export `createXxxService(deps)` 或等价 factory
- **AND** 该 module MUST NOT export 已绑定生产 service singleton

#### Scenario: Route exports factory
- **WHEN** 维护者查看 backend route `*.index.ts`
- **THEN** route module SHALL export route factory
- **AND** route factory SHALL receive handlers/adapters or route deps as arguments before returning Hono router

#### Scenario: Middleware exports factory
- **WHEN** 维护者查看 backend tier-level `_middleware.ts`
- **THEN** middleware module SHALL export middleware factory
- **AND** middleware factory SHALL receive runtime or authentication deps before returning `defineMiddleware(...)`

### Requirement: Composition Root Owns Production Wiring
每个后端 app SHALL 提供分层 composition root，用于创建 runtime deps、repository、UnitOfWork、service、route 和 middleware 实例，并 SHALL 将 materialized routes 和 middlewares 传给 `createApp`。

#### Scenario: App entry delegates wiring
- **WHEN** 维护者查看 `apps/api/src/app.ts` 或 `apps/admin-api/src/app.ts`
- **THEN** app entry SHALL call app-local composition helper to create routes and middlewares
- **AND** app entry SHALL pass materialized routes and middlewares to `createApp`

#### Scenario: Api core remains app agnostic
- **WHEN** 维护者查看 `packages/api-core/src/core/create-app.ts`
- **THEN** `createApp` SHALL NOT depend on app-specific dependency injection types
- **AND** `createApp` SHALL continue to mount already materialized route and middleware modules

### Requirement: Service Dependencies Are Explicit Consumer-Owned Ports
service/use-case module SHALL define consumer-owned outbound Port interfaces for behavior it consumes from other modules. 枚举、DTO、Zod schema、error class、业务常量和纯 helper MUST remain static imports and MUST NOT be injected as runtime dependencies.

#### Scenario: Consumer owns port
- **WHEN** `auth.service.ts` needs user lookup or session creation behavior
- **THEN** auth module SHALL define the needed user/session Port shape in an auth-owned `*.port.ts`
- **AND** auth service SHALL depend on that Port rather than importing the concrete user/session service module

#### Scenario: Pure definitions remain static
- **WHEN** a service needs enum values, DTO schemas, domain errors or pure helper functions
- **THEN** the service SHALL import those definitions statically
- **AND** those definitions MUST NOT be included in the service deps object

### Requirement: Repository Factories Bind DbClient
repository implementation SHALL be created through factories that bind a root or transaction `DbClient`. Business service methods SHALL NOT pass `tx` arguments to repository calls.

#### Scenario: Root repository creation
- **WHEN** composition root creates root repositories
- **THEN** it SHALL call repository factories with the root `DbClient`
- **AND** the returned repository methods SHALL expose business operations without requiring a `tx` parameter

#### Scenario: Transaction repository creation
- **WHEN** `UnitOfWork` opens a transaction
- **THEN** it SHALL create tx-bound repositories with the transaction `DbClient`
- **AND** service code inside the transaction SHALL call those tx-bound repository methods without passing `tx`

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

### Requirement: UnitOfWork Provides Tx-Bound Ports
业务事务 SHALL be expressed through `UnitOfWork` callbacks that receive tx-bound ports. Transaction callbacks SHALL NOT directly perform non-transactional side effects such as Redis/cache/OIDC/SMS/fetch operations.

#### Scenario: Transaction uses tx-bound ports
- **WHEN** a root service performs a use case requiring atomic database changes
- **THEN** it SHALL call `uow.transaction(...)`
- **AND** the callback SHALL use tx-bound repository and audit writer ports provided by the UnitOfWork

#### Scenario: Non-transactional side effects are outside transaction
- **WHEN** a use case needs to refresh Redis cache, invalidate OIDC runtime state, send SMS, or call external HTTP services after DB commit
- **THEN** the side effect SHALL be executed outside the transaction callback or registered with `afterCommit`
- **AND** the transaction callback MUST NOT directly call the non-transactional side-effect port

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

### Requirement: UnitOfWork Carries Optional Observability Context
共享 UnitOfWork 基础设施 SHALL 支持可选 observability context，使 afterCommit 副作用失败日志可以继承发起 transaction 的 requestId 和 traceId，同时保持 UnitOfWork app-agnostic。

#### Scenario: Transaction accepts observability options
- **WHEN** service code 调用 `uow.transaction(...)` 并提供 observability context
- **THEN** shared UnitOfWork SHALL 接收 `requestId` 和 `traceId` 中可用字段
- **AND** transaction callback 接收的 tx-bound ports 和 `afterCommit` registration API SHALL 保持不变
- **AND** 未提供 observability options 的既有调用 SHALL 继续可用

#### Scenario: afterCommit failure log includes observability context
- **WHEN** required 或 best-effort afterCommit task 在 transaction commit 后抛出异常
- **THEN** UnitOfWork SHALL 通过注入 logger 输出失败日志
- **AND** 日志 SHALL 包含 afterCommit task name、mode、err、requestId 和 traceId
- **AND** 缺少 observability context 时 requestId 和 traceId SHALL 记录为 null

#### Scenario: Observability context remains app agnostic
- **WHEN** `api` 或 `admin-api` composition root 创建 production UnitOfWork
- **THEN** shared UnitOfWork SHALL 只依赖最小 `requestId`/`traceId` 结构
- **AND** shared UnitOfWork MUST NOT import Hono、app-local audit context、app-local logger singleton、repository 或 concrete DbClient 类型

#### Scenario: UnitOfWork test fake preserves observability logging
- **WHEN** service tests 使用 shared immediate UnitOfWork fake 并传入 observability context
- **THEN** fake SHALL 在执行 afterCommit tasks 时保留 requestId 和 traceId
- **AND** afterCommit failure assertion SHALL 能验证这些字段

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

### Requirement: Integration Adapters Expose Business Ports
第三方 integration client SHALL be created by adapter factories in composition root and exposed to service code through business semantic Ports rather than concrete third-party APIs.

#### Scenario: Human verification adapter
- **WHEN** human verification service needs Cap challenge behavior
- **THEN** it SHALL depend on a human verification Port
- **AND** it MUST NOT import a production Cap singleton from app-local integration module

#### Scenario: SMS adapter
- **WHEN** mobile verification service sends a verification code
- **THEN** it SHALL depend on an SMS sender Port
- **AND** tests SHALL inject a fake sender without mocking the SMS integration module

### Requirement: Runtime Config And Test-Sensitive Utilities Are Injected
factory deps SHALL include only the minimal config slice and runtime Ports needed by that module. Password hash/compare, random password or UUID generation, nonce generation and clock reads SHALL be injectable when they affect tested behavior.

#### Scenario: Config slice injection
- **WHEN** auth service needs `MAGIC_CODE` or session TTL
- **THEN** auth service SHALL receive a config object containing only those values
- **AND** auth service MUST NOT import app env directly

#### Scenario: Password hasher injection
- **WHEN** user service hashes or compares passwords
- **THEN** user service SHALL call an injected password hasher Port
- **AND** unit tests SHALL fake that Port rather than mocking `bcrypt-ts`

### Requirement: Tests Use DI Fakes Instead Of App-Local Module Mocks
后端业务、handler、adapter 和 middleware tests SHALL construct the module under test with fake deps. Tests MUST NOT use `mock.module` to replace app-local service/repository/db/redis/logger modules after this migration.

#### Scenario: Service test injects fake ports
- **WHEN** a service unit test exercises a use case
- **THEN** the test SHALL create the service via its factory with fake Port implementations
- **AND** the test SHALL assert calls on fake methods instead of mocking imported app-local modules

#### Scenario: Handler test injects fake service facade
- **WHEN** a route handler test exercises HTTP adapter logic
- **THEN** the test SHALL create handlers or router with fake service facade deps
- **AND** the test SHALL NOT mock the service module imported by the handler

### Requirement: Architecture Tests Prevent Static Dependency Regression
The repository SHALL include backend architecture tests that fail when business modules statically import production app-local service/repository/db/redis/logger dependencies forbidden by the DI architecture.

#### Scenario: Forbidden imports fail
- **WHEN** a backend service module imports `@iam/db`, app-local Redis singleton, app-local logger singleton, or another concrete app-local service module outside approved composition/runtime/repository implementation paths
- **THEN** architecture tests SHALL fail with the offending file path and import specifier

#### Scenario: Composition imports production dependencies
- **WHEN** app-local composition or runtime modules import DB, Redis, logger, repository factories or integration adapter factories for production wiring
- **THEN** architecture tests SHALL allow those imports

### Requirement: Circular Service Dependencies Are Not Hidden By Lazy Getters
Service deps SHALL NOT use lazy getter functions to hide circular dependencies. Circular dependencies SHALL be resolved by extracting smaller Ports, tx operations or use-case facades.

#### Scenario: Cycle discovered during migration
- **WHEN** composition reveals that two services require each other
- **THEN** implementation SHALL split the shared behavior into a smaller Port or use-case
- **AND** implementation MUST NOT introduce `getXService: () => XService` solely to bypass the cycle

### Requirement: Non-Hono Backend Apps Use Functional Composition
非 Hono backend app SHALL 遵守 backend functional DI 纪律，但 MAY 使用与 Hono `createApp` 不同的 materialized output。

#### Scenario: OIDC provider owns app-local composition
- **WHEN** 维护者查看 `apps/oidc-provider/src`
- **THEN** app SHALL expose an app-local composition root for production wiring
- **AND** composition SHALL create runtime deps, DB-bound repositories, Redis-backed stores, services, provider wiring, HTTP server, workers, and lifecycle resources
- **AND** production instances SHALL NOT be created inside protocol/business modules

#### Scenario: Non-Hono output bypasses createApp
- **WHEN** `apps/oidc-provider` starts
- **THEN** app SHALL use its composition root to materialize a Node HTTP server and `oidc-provider` runtime
- **AND** app SHALL NOT be required to pass routes or middlewares to Hono `createApp`
- **AND** `packages/api-core` `createApp` SHALL remain app-agnostic and unaware of OIDC provider DI types

### Requirement: UnitOfWork Is Required Only For Transactional DB Workflows
Backend app modules with transactional DB writes SHALL wire shared UnitOfWork infrastructure. Backend app modules whose DB access is read-only for protocol/runtime lookup MAY omit UnitOfWork while still using DbClient-bound repository factories.

#### Scenario: Read-only provider lookup omits UnitOfWork
- **WHEN** `apps/oidc-provider` reads OIDC client runtime, client secret records, account records, or authorization claims
- **THEN** it MAY call root `DbClient`-bound repositories without a UnitOfWork
- **AND** repository implementations SHALL still be created by factories that bind `DbClient`
- **AND** protocol/business modules SHALL NOT import `@iam/db` directly

#### Scenario: Future transactional provider workflow uses UnitOfWork
- **WHEN** `apps/oidc-provider` adds a workflow that writes PostgreSQL state atomically, such as consent records, protocol audit, or persistent token metadata
- **THEN** it SHALL introduce app-local UnitOfWork composition using shared UnitOfWork infrastructure
- **AND** transaction callbacks SHALL receive tx-bound Ports instead of passing `tx` arguments to repository calls

### Requirement: Architecture Guards Cover Non-Hono Backend Apps
Backend architecture tests SHALL cover non-Hono backend apps and prevent static production dependency regressions in protocol/business modules.

#### Scenario: OIDC provider forbidden imports fail
- **WHEN** an OIDC provider protocol/business module imports `@iam/db`, app-local Redis singleton, app-local logger singleton, or concrete production repository/service modules outside approved composition, repository, or Redis-backed storage boundaries
- **THEN** architecture tests SHALL fail with the offending file path and import specifier

#### Scenario: OIDC provider approved infrastructure imports pass
- **WHEN** OIDC provider composition, repository implementation, Redis-backed store, or storage adapter imports production infrastructure required for wiring or persistence
- **THEN** architecture tests SHALL allow those imports only in the approved boundary directories
