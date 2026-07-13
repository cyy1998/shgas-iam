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

### Requirement: Route Adapters Access Persistence Through Service Facades
后端 production route handler 与 adapter SHALL 通过注入的 service 或 use-case facade 访问持久化与 transaction 能力。`routes/**` 下的 production module MUST NOT 直接依赖 app-local repository 或 `UnitOfWorkPort` 的 type/value export。

#### Scenario: Admin query uses service facade
- **WHEN** admin REST/tRPC adapter 实现 position search operation
- **THEN** adapter SHALL 调用注入的 position service facade
- **AND** adapter MUST NOT 注入或 import position repository
- **AND** adapter MAY 保留输入解析、VO mapping 与 response pagination

#### Scenario: API transaction is hidden behind use-case
- **WHEN** API internal contact registration 需要在 transaction 中读写 user、employment、organization、position 和 profile dirty state
- **THEN** route handler SHALL 调用注入的 contact registration use-case
- **AND** handler MUST NOT 声明 repository transaction ports 或调用 `uow.transaction(...)`

#### Scenario: Pure protocol dependencies remain in route
- **WHEN** route 需要 request schema、DTO、domain error、HTTP status、response helper、request/audit context helper、logger 或最小 runtime config 完成协议适配
- **THEN** route MAY 静态 import 纯定义或接收最小 protocol dependency
- **AND** 本要求 MUST NOT 强制为无业务编排的 handler 新增转发 service

### Requirement: Application Workflow And Domain-Aligned Service Boundaries Are Explicit
后端 SHALL 区分跨领域 Application Use Case、领域对齐 Application Service 与 pure domain logic。跨 repository transaction 和 transaction 结果驱动的业务副作用 SHALL 由 Application Use Case 或明确的单领域 Application Service 拥有，而不是由 route 或 pure domain logic 拥有。

#### Scenario: Cross-domain workflow uses application use-case
- **WHEN** 一个 workflow 同时协调 user、employment、organization、position、profile dirty、audit 和 notification
- **THEN** production composition SHALL 创建独立 Application Use Case factory
- **AND** route SHALL 依赖该 use-case facade
- **AND** workflow MUST NOT 被并入通用 `UserService` 或 `RoleService`

#### Scenario: Existing domain-aligned services stay app local
- **WHEN** `UserService`、`RoleService` 或同类 app-local service 依赖 repository、UnitOfWork、audit 或 read model port
- **THEN** 它们 SHALL 被视为领域对齐 Application Service
- **AND** 本变更 MUST NOT 把它们描述为 pure DDD Domain Service
- **AND** `services/**` MUST NOT import `use-cases/**`

#### Scenario: Pure domain logic stays runtime independent
- **WHEN** business rule 位于 `packages/domain`
- **THEN** 该规则 MUST NOT depend on repository、UnitOfWork、audit、network、Hono 或 app composition
- **AND** Application Use Case 与领域对齐 Application Service MAY 静态 import 该纯规则

#### Scenario: Composition owns layer wiring
- **WHEN** Application Use Case 需要领域对齐 service facade、consumer-owned port 或 UnitOfWork
- **THEN** app composition SHALL 创建并注入这些依赖
- **AND** composition root SHALL keep Application Use Case instances in a separate `useCases` field rather than merging them into `services`
- **AND** app-local service 或 `packages/domain` MUST NOT 反向 import Application Use Case

### Requirement: Use-Case Owns Transaction-Result Side Effects
当业务副作用依赖 transaction 内部结果时，同一 service/use-case SHALL 拥有 transaction 和 transaction 成功后的副作用编排。该 service/use-case MUST 接收协议无关的最小 request context，而不是 Hono `Context`。

#### Scenario: Contact registration preserves transaction workflow
- **WHEN** internal contact registration 创建新联系人或为已有联系人补建任职
- **THEN** contact registration use-case SHALL 在 UnitOfWork callback 中完成 organization/position 校验、user/employment 写入和 profile dirty marking
- **AND** route handler SHALL NOT 访问这些 tx-bound ports

#### Scenario: Contact registration runs post-transaction effects
- **WHEN** contact registration transaction 成功
- **THEN** use-case SHALL 使用 transaction 返回的 target user 与 existing-contact 结果记录原有 audit event
- **AND** production 环境 SHALL 继续发送原有欢迎短信
- **AND** non-production 环境 MUST NOT 发送欢迎短信
- **AND** audit 与短信失败 SHALL 按迁移前行为继续向调用方传播

#### Scenario: Use-case stays protocol agnostic
- **WHEN** route 调用 contact registration use-case
- **THEN** route SHALL 只传已校验 input、normalized internal actor 和最小 audit request context
- **AND** use-case MUST NOT import 或接收 Hono `Context`

### Requirement: Architecture Guards Enforce Route Persistence Boundary
API 与 admin-api architecture tests SHALL 扫描 route production module 的 type/value imports，并在 route 直接依赖 app-local repository 或 `@iam/api-core/uow` 时失败。

#### Scenario: Type-only repository import fails
- **WHEN** `*.handlers.ts` 或 `*.adapter.ts` 使用 type-only import 引入 app-local `*.repository`
- **THEN** 对应 backend architecture test SHALL fail
- **AND** failure output SHALL 包含违规文件路径与 import specifier

#### Scenario: UnitOfWork import fails
- **WHEN** route production module import `@iam/api-core/uow` 或在 route 中声明 UnitOfWork dependency
- **THEN** 对应 backend architecture test SHALL fail

#### Scenario: Composition and service remain valid owners
- **WHEN** composition module 创建 repository/service/use-case，或 service/use-case 声明 repository/UnitOfWork port
- **THEN** route persistence boundary guard SHALL NOT 将该 import 视为 route violation

### Requirement: Account Recovery Workflows Use Caller-Goal Use-Cases
API backend SHALL expose password reset code request、password reset code verification 和 password reset as separate
Application Use Case facades. Each facade SHALL own its workflow side effects and SHALL receive only protocol-independent input
and minimal request context.

#### Scenario: Password reset code request owns SMS and audit
- **WHEN** `/open/code/send` receives `VerificationCodeUsage.ResetPassword` after Human Verification succeeds
- **THEN** route SHALL call `request-password-reset-code` with validated username、optional phoneNumber and request context
- **AND** the use-case SHALL resolve the active user's bound mobile before sending the existing ResetPassword SMS code
- **AND** it SHALL record the existing masked success audit only after SMS send succeeds
- **AND** lookup、SMS or audit failure SHALL propagate in the existing order

#### Scenario: Password reset code verification does not consume the code
- **WHEN** `/open/code/verify` receives `VerificationCodeUsage.ResetPassword`
- **THEN** route SHALL call `verify-password-reset-code`
- **AND** the use-case SHALL resolve the bound mobile and check the existing verification code without consuming it
- **AND** it SHALL record the existing success or failure audit according to the boolean verification result

#### Scenario: Password reset owns reservation and transaction
- **WHEN** `/open/password/reset` receives a valid Account Recovery request
- **THEN** route SHALL call `reset-password` with validated primitives and request context
- **AND** the use-case SHALL validate the active user/mobile、reserve the ResetPassword code、hash the new password and write
  password plus success audit in one UnitOfWork
- **AND** it SHALL confirm the reservation after transaction success
- **AND** it SHALL release the reservation when the transaction has not succeeded
- **AND** password reset MUST NOT mark user-profile dirty

#### Scenario: Password reset failure audit remains ordered
- **WHEN** the active user mobile does not match or the ResetPassword code cannot be reserved
- **THEN** `reset-password` SHALL record the existing `auth.password.reset` failure audit before throwing the existing error
- **AND** it MUST NOT write the new password or success audit

### Requirement: Open Route Dispatch Preserves Non-Recovery Usages
Open route SHALL dispatch the resetPassword usage to Account Recovery use-cases while preserving the current login and bindPhone
verification paths. Route SHALL remain responsible for Human Verification、validated usage dispatch、request context extraction and
HTTP response adaptation.

#### Scenario: Three send-code usages dispatch correctly
- **WHEN** `/open/code/send` receives a validated `login`、`bindPhone` or `resetPassword` usage
- **THEN** `resetPassword` SHALL call `request-password-reset-code`
- **AND** `login` and `bindPhone` SHALL continue calling the existing non-recovery MobileService path
- **AND** Human Verification MUST complete before any branch sends SMS

#### Scenario: Three verify-code usages dispatch correctly
- **WHEN** `/open/code/verify` receives a validated `login`、`bindPhone` or `resetPassword` usage
- **THEN** `resetPassword` SHALL call `verify-password-reset-code`
- **AND** `login` and `bindPhone` SHALL continue checking the existing usage-specific Redis code without consuming it

#### Scenario: Route-local presentation and validation stay pure
- **WHEN** open route masks a user-info mobile or requires a phone number for a non-recovery usage
- **THEN** it SHALL use a pure route-local presenter or validation helper
- **AND** the helper MUST NOT be materialized as an Application Service

### Requirement: Account Recovery Ports And Guards Enforce Ownership
New Account Recovery `*.port.ts` modules SHALL directly declare consumed methods and neutral data shapes. Architecture tests SHALL
prevent migrated route service factories and provider-owned port shapes from returning.

#### Scenario: New port owns its method and data shape
- **WHEN** an Account Recovery service or use-case needs user lookup、mobile verification、password hashing、audit or UnitOfWork behavior
- **THEN** its port SHALL declare only the methods it calls
- **AND** it MUST NOT use `Pick<...Repository>`、`Pick<...Service>` or import a data shape from `*.repository.ts`
- **AND** composition SHALL adapt the existing production implementation structurally

#### Scenario: OpenService regression fails architecture guard
- **WHEN** migrated `routes/open` production code restores `open.service.ts`、`open.port.ts` or exports a `create*Service` factory
- **THEN** API architecture tests SHALL fail with the offending file or exported role

### Requirement: Authentication Login Workflows Use Caller-Goal Use-Cases
API backend SHALL expose password login and mobile login as separate Application Use Case facades. Each facade SHALL own its
workflow side effects and SHALL receive only protocol-independent input and minimal request context.

#### Scenario: Password login owns verification failure state and session
- **WHEN** `/auth/login/password` receives a successfully parsed encrypted credential
- **THEN** route SHALL call `login-with-password` with username、password、optional Cap token and request context
- **AND** the use-case SHALL preserve Human Verification、active-user lookup、blacklist、password or magic-code validation、failure
  risk/audit/count、failure cleanup、PrincipalSession creation and success audit order
- **AND** successful PrincipalSession creation SHALL use password AMR and return the existing token/mobile result

#### Scenario: Mobile login owns code consumption failure state and session
- **WHEN** `/auth/login/mobile` receives validated phone number、code and optional Cap token
- **THEN** route SHALL call `login-with-mobile` with primitives and request context
- **AND** the use-case SHALL preserve Human Verification、active-user lookup、blacklist、magic-code or atomic verification-code consume、
  failure risk/audit/count、failure cleanup、PrincipalSession creation and success audit order
- **AND** successful PrincipalSession creation SHALL use SMS AMR and return the existing token/mobile result

#### Scenario: Local authz uses a minimal session facade
- **WHEN** `/authz` has validated protocol headers、client and local-session token
- **THEN** route SHALL call a minimal local-session authorizer facade
- **AND** it MUST NOT route authorization through an omnibus Authentication service
- **AND** cookie/header precedence、user-info response header and existing error propagation SHALL remain route-owned

### Requirement: Authentication Support Modules Use Explicit Roles
Redis-backed login failure state SHALL be a domain-aligned Authentication service, while encrypted credential handling SHALL be a
security Parser. Neither support module SHALL remain as a stateful route helper.

#### Scenario: Login failure service preserves shared state
- **WHEN** password or mobile login records、reads or clears user failure and blacklist state
- **THEN** both use-cases SHALL consume the same injected login failure service contract
- **AND** the service SHALL preserve the existing Redis keys、30-minute window、five-attempt threshold、blacklist TTL、reason and
  formatted messages

#### Scenario: Login credential parser preserves security checks
- **WHEN** password login receives an encrypted credential block
- **THEN** route SHALL call an injected `LoginCredentialParser` before the password login use-case
- **AND** the parser SHALL preserve SM2/SM4 decryption、payload validation、timestamp window、nonce key/TTL and replay rejection
- **AND** parser failures MUST prevent password validation and PrincipalSession creation

### Requirement: Authentication Ports And Guards Enforce Ownership
New Authentication `*.port.ts` modules SHALL directly declare consumed methods and neutral data shapes. Architecture tests SHALL
prevent migrated route application factories、stateful helpers and provider-owned port shapes from returning.

#### Scenario: Login port owns its methods and data shapes
- **WHEN** a login use-case needs user、password、mobile code、Human Verification、failure state、session or audit behavior
- **THEN** its port SHALL declare only the methods it calls
- **AND** it MUST NOT use `Pick<...Repository>`、`Pick<...Service>` or import data shapes from `*.repository.ts`
- **AND** composition SHALL adapt existing production implementations structurally

#### Scenario: Auth route application regression fails architecture guard
- **WHEN** migrated `routes/auth` production code restores `auth.service.ts`、`auth.port.ts`、stateful login helper or exports a
  `create*Service` factory
- **THEN** API architecture tests SHALL fail with the offending file or exported role

### Requirement: SSO Workflows Use Operation-Specific Application Use-Cases

API backend SHALL expose authorize、callback、code exchange、OA login、WeChat login and logout as separate Application Use Case
facades. Each facade SHALL own its workflow coordination and SHALL receive only protocol-independent input and minimal request context.

#### Scenario: Authorize owns client and session authorization
- **WHEN** `/sso/authorize` has resolved the principal token and token source
- **THEN** route SHALL call the authorize use-case with client code、redirect URL、token、token source and request context
- **AND** the use-case SHALL preserve client lookup、redirect allowlist validation and Custom SSO Session authorization order
- **AND** the route SHALL continue to choose login or callback redirect from the use-case result

#### Scenario: Callback owns Gateway local-session creation
- **WHEN** `/sso/callback` receives code、client and redirect URL
- **THEN** route SHALL call the callback use-case with primitives and request context
- **AND** the use-case SHALL preserve client/redirect validation、one-time auth-code consume、required ORCAS login and Gateway
  local-session creation order
- **AND** ORCAS failure MUST prevent returning a Gateway local token

#### Scenario: Code exchange owns Independent local-session creation
- **WHEN** `/sso/token` receives code、client and client secret
- **THEN** route SHALL call the code-exchange use-case
- **AND** the use-case SHALL preserve client-secret validation、one-time auth-code consume and Independent local-session creation order
- **AND** it SHALL return the existing sid、ttl and userInfo result

#### Scenario: Third-party logins own identity and PrincipalSession workflow
- **WHEN** OA or WeChat login receives validated protocol primitives
- **THEN** route SHALL call the matching OA-login or WeChat-login use-case
- **AND** OA login SHALL preserve timestamp/signature、Formal active-user、password-independent PrincipalSession and audit semantics
- **AND** WeChat login SHALL preserve exchange、cache/retry、active-user、PrincipalSession and audit semantics

#### Scenario: Logout owns session invalidation
- **WHEN** `/sso/logout` or OA pre-login cleanup resolves a session token
- **THEN** route SHALL call the logout use-case
- **AND** the use-case SHALL delegate to the existing Custom SSO Session logout behavior
- **AND** cookie deletion and redirect SHALL remain route-owned

### Requirement: SSO Collaborators Ports And Guards Enforce Ownership

Shared SSO workflow collaborators SHALL use explicit roles, new SSO `*.port.ts` modules SHALL directly declare consumed methods and
neutral data shapes, and architecture tests SHALL prevent migrated route application workflow from returning.

#### Scenario: Redirect validator preserves allowlist behavior
- **WHEN** authorize or callback validates a client redirect URL
- **THEN** both use-cases SHALL consume the same injected redirect validator contract
- **AND** the validator SHALL preserve http/https syntax、wildcard/path matching、invalid historical pattern skipping and warning context
- **AND** it MUST NOT own client lookup or HTTP redirect construction

#### Scenario: SSO port owns its methods and data shapes
- **WHEN** an SSO use-case needs client、user、session、integration、Redis、delay or audit behavior
- **THEN** its port SHALL declare only the methods it calls
- **AND** it MUST NOT use `Pick<...Repository>`、`Pick<...Service>` or import concrete route/service/adapter modules or repository-owned
  DTO types
- **AND** composition SHALL adapt existing production implementations structurally

#### Scenario: SSO route application regression fails architecture guard
- **WHEN** migrated `routes/sso` restores `sso.service.ts`、`sso.port.ts`、a `create*Service` factory or stateful workflow dependency
- **THEN** API architecture tests SHALL fail with the offending file、role or dependency

### Requirement: Admin User Resignation Uses A Caller-Goal Application Use-Case

Admin backend SHALL expose user resignation as a dedicated Application Use Case that owns the cross-domain User and Employment
transaction. The use-case SHALL receive protocol-independent input and normalized audit context.

#### Scenario: Resignation owns the complete transaction
- **WHEN** an admin resigns an existing user
- **THEN** the `resign-user` use-case SHALL resolve the user inside one UnitOfWork
- **AND** it SHALL end all active employments before disabling the user
- **AND** it SHALL record the existing resignation audit and profile dirty facts in the same transaction
- **AND** it SHALL return the existing `true` success result

#### Scenario: Missing user stops the workflow
- **WHEN** the resignation username does not resolve to a user
- **THEN** the use-case SHALL throw the existing user-not-found error
- **AND** it MUST NOT end employments、disable a user、write audit or mark profile dirty

#### Scenario: Audit and dirty context remain ordered
- **WHEN** the resignation transaction reaches its side effects
- **THEN** the audit action、target and details SHALL match the existing `admin.employment.resign_user` payload
- **AND** profile dirty reasons SHALL remain ordered as `EmploymentUpdated` then `UserUpdated`
- **AND** the dirty marker SHALL receive the transaction afterCommit port and the normalized requestId/traceId

### Requirement: Admin Resignation Ports And Guards Enforce Ownership

The new resignation use-case SHALL declare consumer-owned transaction ports, and Admin architecture tests SHALL prevent the
cross-domain workflow from returning to `EmploymentService` or service composition.

#### Scenario: Resignation port owns consumed methods and shapes
- **WHEN** the use-case needs user lookup/update、employment end、audit or profile dirty behavior
- **THEN** its port SHALL directly declare only the consumed methods and neutral target/input shapes
- **AND** it MUST NOT use `Pick<...Repository>`、`Pick<...Service>` or import concrete repository、service、route or adapter modules
- **AND** composition SHALL structurally adapt the existing UnitOfWork transaction ports

#### Scenario: EmploymentService remains domain aligned
- **WHEN** resignation has migrated to the use-case
- **THEN** `EmploymentService` MUST NOT expose or implement `resignUser`
- **AND** create、update、status、delete、transfer and set-primary employment behavior SHALL remain in `EmploymentService`

#### Scenario: Resignation ownership regression fails architecture guard
- **WHEN** production code restores `resignUser` on `EmploymentService`、binds resignation through `services.employment` or places the
  use-case in service composition
- **THEN** Admin API architecture tests SHALL fail with the offending ownership or wiring

### Requirement: OIDC Protocol Components Use Explicit Functional Ownership

OIDC Provider production composition SHALL materialize protocol、security and session components under their actual ownership instead of exposing an heterogeneous Application Services aggregate.

#### Scenario: Provider composition owns protocol hooks
- **WHEN** production wiring creates OIDC claims and interaction policy hooks
- **THEN** provider composition SHALL materialize those hooks and inject them into the `oidc-provider` runtime
- **AND** the protocol modules MUST NOT statically import DB、Redis、logger or concrete production repositories

#### Scenario: Security composition owns client authentication components
- **WHEN** production wiring creates client auth rate limiting and client secret verification
- **THEN** those components SHALL be materialized by `composition/security`
- **AND** provider composition SHALL receive the materialized security components through explicit deps

#### Scenario: Session composition is consumed directly
- **WHEN** provider claims、interaction policy or interaction handler needs global/provider session behavior
- **THEN** provider composition SHALL consume the facade exposed by `composition/session` directly
- **AND** it MUST NOT re-export or inject that facade through `services.globalSessionResolver` or an equivalent secondary services classification

### Requirement: OIDC Component Architecture Guards Prevent Ownership Regression

OIDC Provider architecture tests SHALL fail when migrated claims naming、composition classification or protocol dependency boundaries regress.

#### Scenario: Claims service naming regression fails
- **WHEN** production source reintroduces `createOidcClaimsService`、`OidcClaimsService` or a services-classified claims hook
- **THEN** the OIDC architecture test SHALL fail with the offending symbol or path

#### Scenario: Mixed services composition regression fails
- **WHEN** production composition reintroduces `composition/services`、`createOidcProviderServices` or a session resolver alias under services
- **THEN** the OIDC architecture test SHALL fail

#### Scenario: Protocol adapter static infrastructure binding fails
- **WHEN** the Claims Adapter or another provider protocol module statically imports app-local DB、Redis、logger or concrete production repository values
- **THEN** the existing non-Hono DI architecture guard SHALL fail with the offending file and import

### Requirement: Existing Backend Production Ports Use Consumer Ownership
API、Admin API 与 OIDC Provider 的 production `*.port.ts` SHALL 直接声明消费模块调用的方法，并 SHALL 使用 consumer-owned 或中立数据 shape。Port contract MUST NOT 通过 concrete repository/service 的完整 type、method selection 或返回值推导获得。

#### Scenario: Repository dependency becomes a narrow port
- **WHEN** service 或 use-case 需要现有 repository 的 reader、writer 或 transaction behavior
- **THEN** 消费方 `*.port.ts` SHALL 直接声明其实际调用的方法签名
- **AND** port MUST NOT import `*.repository.ts` 或通过 `Pick<...Repository>` 定义方法集合

#### Scenario: Service collaborator becomes a narrow port
- **WHEN** use-case 或 domain-aligned service 只消费现有 service facade 的部分方法
- **THEN** 消费方 SHALL 声明职责明确的 outbound port
- **AND** dependency MUST NOT 通过 `Pick<...Service>` 或 concrete service return type 派生

#### Scenario: Existing provider satisfies the consumer contract
- **WHEN** repository、service 或 transaction object 被 composition 注入迁移后的 consumer port
- **THEN** TypeScript compile-time validation SHALL 证明 provider 与 port 结构兼容
- **AND** production wiring MUST NOT use an unchecked type assertion or behaviorless wrapper to hide incompatibility
- **AND** an explicit composition adapter MAY be used only when it performs a tested semantic shape mapping

### Requirement: Production Port Guards Prevent Derived Ownership Regression
三个 backend 的 architecture tests SHALL 扫描各自全部 production `*.port.ts`，并 SHALL 对 repository-owned import 与 concrete repository/service-derived `Pick` 报告文件级违规。

#### Scenario: Repository import fails globally
- **WHEN** 任一 production `*.port.ts` import `*.repository.ts`、`*.repository` 或 `repositories/**` 中由 provider ownership 定义的数据 type
- **THEN** 对应 app 的 architecture test SHALL fail
- **AND** diagnostic SHALL identify the port file and offending module specifier

#### Scenario: Concrete Pick fails globally
- **WHEN** 任一 production `*.port.ts` 使用 `Pick<...Repository>` 或 `Pick<...Service>` 定义 dependency shape
- **THEN** 对应 app 的 architecture test SHALL fail
- **AND** multiline generic syntax MUST NOT evade detection

#### Scenario: Neutral and port contracts remain allowed
- **WHEN** production port import domain/contracts、consumer-owned `*.type.ts` 或使用 `Pick<...Port>`、platform type narrowing
- **THEN** architecture test SHALL allow the dependency
- **AND** existing static enum、schema、error、constant 与 pure type imports SHALL remain uninjected

### Requirement: Legacy Route Application Modules Are Migrated By Responsibility
Hono backend SHALL remove production application service factories and stateful workflow modules from `routes/**` by classifying each behavior as Protocol Adapter、Application Use Case、Domain-aligned Application Service 或 pure helper。迁移 MUST NOT create a one-to-one replacement service solely to preserve a legacy route service name.

#### Scenario: Account recovery uses caller-goal use-cases
- **WHEN** `/open` endpoint 处理 password reset code request、code verification 或 password reset
- **THEN** account recovery workflow SHALL 由独立 Application Use Case facade 拥有
- **AND** route SHALL only dispatch validated usage、extract protocol context、call the facade and build the response
- **AND** `OpenService` MUST NOT remain as an omnibus or forwarding facade

#### Scenario: Authentication login workflows leave routes
- **WHEN** password 或 mobile login 协调 human verification、failure state、user lookup、session creation 和 audit
- **THEN** 每个登录目标 SHALL 由 Application Use Case 拥有
- **AND** Redis-backed login failure state SHALL 位于 authentication service boundary
- **AND** credential parser SHALL use a parser/security role name rather than a use-case or route service name

#### Scenario: SSO operations use separate application facades
- **WHEN** SSO authorize、callback、code exchange、OA login、WeChat login 或 logout 被 production composition 创建
- **THEN** composition SHALL wire operation-specific use-case facades
- **AND** route SHALL retain only cookie、header/query precedence、redirect 和 response adaptation
- **AND** a single `SsoService` MUST NOT own all operations

#### Scenario: Pure route helpers remain local
- **WHEN** route behavior only masks a response field、validates an already parsed primitive、maps a VO 或 joins a redirect URL
- **THEN** behavior MAY remain in `routes/**` as a presenter、mapper、validation helper or pure function
- **AND** behavior MUST NOT be named or composed as an Application Service

### Requirement: Cross-Domain Administrative Workflow Uses Application Use-Case
Admin workflow that atomically changes more than one domain lifecycle SHALL be modeled as an Application Use Case even when its endpoint is grouped under one domain route.

#### Scenario: User resignation crosses user and employment
- **WHEN** admin resigns a user
- **THEN** a `resign-user` use-case SHALL own the transaction that ends active employments and disables the user
- **AND** the use-case SHALL own existing audit and profile dirty orchestration
- **AND** `EmploymentService` MUST NOT expose `resignUser`

#### Scenario: Employment lifecycle remains a domain service
- **WHEN** admin creates、updates、transfers、deletes or selects a primary employment
- **THEN** `EmploymentService` MAY continue to own that behavior
- **AND** querying organization or position within an employment invariant MUST NOT alone force a separate use-case

### Requirement: Protocol Components Are Not Classified As Domain-Aligned Services
Non-Hono backend components whose public contract is a protocol runtime hook SHALL use adapter、resolver、policy、handler 或 security role semantics. Such components MAY depend on consumer-owned ports but MUST NOT be presented as pure domain logic or a domain-aligned Application Service.

#### Scenario: OIDC claims hook is an adapter
- **WHEN** a component implements `oidc-provider` account lookup、token extra 或 claims callback types
- **THEN** the component SHALL be named and injected as `OidcClaimsAdapter` or an equivalently explicit protocol role
- **AND** it MAY remain under `provider/**`
- **AND** it MUST NOT be moved to `packages/domain`

#### Scenario: Claims snapshot behavior stays stable
- **WHEN** OIDC claims adapter creates or reads an OIDC Claims Snapshot
- **THEN** account、client、scope、authorization、session binding 和 config version validation SHALL preserve existing semantics
- **AND** invalid access-token credential revocation behavior MUST remain unchanged

#### Scenario: Composition groups protocol roles explicitly
- **WHEN** OIDC provider composition materializes claims adapter、interaction policy、session resolver、rate limiter 和 client secret verifier
- **THEN** composition SHALL preserve their distinct protocol/security roles
- **AND** a generic `services` aggregate MUST NOT imply that all components are domain-aligned Application Services

### Requirement: Consumer-Owned Ports Own Method And Data Shapes
New or migrated service/use-case `*.port.ts` modules SHALL directly declare the operations and data shapes consumed by that module. They MUST NOT derive the contract with `Pick<Repository>`、`Pick<ConcreteService>` or import repository-owned DTO types.

#### Scenario: Use-case declares a narrow outbound port
- **WHEN** an authentication、SSO、account recovery 或 resignation use-case needs behavior from an existing service/repository adapter
- **THEN** the use-case-owned port SHALL declare only the methods it calls
- **AND** composition SHALL adapt the production implementation structurally

#### Scenario: Port data type has neutral ownership
- **WHEN** multiple adapters need the same input or result shape
- **THEN** the shape SHALL live in a consumer-owned `*.type.ts`、domain module 或 shared contract
- **AND** production `*.port.ts` MUST NOT import that shape from `*.repository.ts`

#### Scenario: Existing repository-derived ports migrate last
- **WHEN** business workflow relocation changes a module that currently uses `Pick<Repository>`
- **THEN** the workflow child change SHALL avoid introducing new repository-derived ports
- **AND** the umbrella's final port-hardening child SHALL remove remaining repository-derived port ownership without changing persistence behavior

### Requirement: Architecture Guards Cover Application Module Classification
Backend architecture tests SHALL detect structural regressions after each migrated boundary while allowing legitimate protocol adapters and domain-aligned services.

#### Scenario: Route service factory fails
- **WHEN** migrated Hono `routes/**` production code exports `create*Service` or statically owns a stateful application dependency
- **THEN** the corresponding architecture test SHALL fail with the file and offending role/dependency

#### Scenario: Repository-derived port fails
- **WHEN** a migrated production `*.port.ts` imports `*.repository.ts` or defines a port through `Pick<...Repository>`/`Pick<...Service>`
- **THEN** the corresponding architecture test SHALL fail

#### Scenario: Legitimate protocol adapter passes
- **WHEN** OIDC provider adapter imports `oidc-provider` protocol types and depends only on injected ports
- **THEN** architecture tests SHALL allow the protocol type dependency
- **AND** they SHALL continue rejecting static DB、Redis singleton、logger singleton or concrete repository value imports outside approved boundaries
