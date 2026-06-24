## ADDED Requirements

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

### Requirement: AfterCommit Is Best Effort And Observable
`afterCommit` callbacks SHALL run after successful transaction commit. 第一阶段所有 `afterCommit` callbacks SHALL be best-effort: failures SHALL be logged with structured fields and MUST NOT change the already committed primary operation result.

#### Scenario: AfterCommit succeeds
- **WHEN** a transaction commits and registered `afterCommit` callbacks complete successfully
- **THEN** the service SHALL return the primary operation result
- **AND** tests SHALL be able to observe that registered callbacks were awaited

#### Scenario: AfterCommit fails
- **WHEN** a transaction commits and an `afterCommit` callback throws
- **THEN** the service SHALL keep the primary operation result successful
- **AND** the system SHALL log the callback name and error through the injected logger

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
