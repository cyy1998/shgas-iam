## ADDED Requirements

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
