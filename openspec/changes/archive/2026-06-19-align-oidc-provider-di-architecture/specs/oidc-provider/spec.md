## ADDED Requirements

### Requirement: Provider 后端使用 app-local composition root
`apps/oidc-provider` SHALL 使用 app-local composition root 创建 provider runtime、Node HTTP server、workers 和 lifecycle resources，并 SHALL 保持 entrypoint thin。

#### Scenario: Entry delegates production wiring
- **WHEN** 维护者查看 `apps/oidc-provider/src/index.ts`
- **THEN** entrypoint SHALL parse env, create the OIDC provider composition, call `server.listen`, and bind shutdown signals
- **AND** entrypoint SHALL NOT directly construct repositories, services, stores, `oidc-provider` hooks, or Redis-backed workers

#### Scenario: Composition returns lifecycle resources
- **WHEN** composition creates production OIDC provider resources
- **THEN** it SHALL return the materialized HTTP server, provider runtime, workers or subscribers, and a shutdown function
- **AND** shutdown SHALL close the HTTP server, Redis resources, DB resources, and workers owned by the composition

### Requirement: Provider repositories are DbClient-bound and DB-only
OIDC provider repositories SHALL be created through factories that bind a `DbClient`; repository implementations SHALL access PostgreSQL only through the injected client.

#### Scenario: Repository factory binds DbClient
- **WHEN** composition creates OIDC account, authorization, or client repositories
- **THEN** it SHALL call `createXRepository(dbClient)` or an equivalent factory
- **AND** returned repository methods SHALL NOT require callers to pass `tx`

#### Scenario: Repository does not import DB singleton
- **WHEN** 维护者查看 `apps/oidc-provider/src/repositories`
- **THEN** repository implementations SHALL NOT value import the `@iam/db` singleton
- **AND** repository implementations MAY import DB schema, query helpers, DTO schemas, and `DbClient` types needed for queries

### Requirement: Provider runtime modules depend on consumer-owned Ports
OIDC provider protocol and business modules SHALL depend on consumer-owned Ports that describe the minimal behavior they consume.

#### Scenario: Claims service uses claims-owned ports
- **WHEN** claims service needs accounts, authorization claims, client runtime metadata, session validation, or token revocation
- **THEN** claims service SHALL define or import claims-owned Port shapes for those behaviors
- **AND** claims service SHALL NOT depend on concrete repository classes, Redis singleton, or production runtime modules

#### Scenario: Interaction handler uses interaction-owned ports
- **WHEN** interaction handling needs client runtime lookup, global session resolution, provider session binding, or return handle operations
- **THEN** interaction module SHALL depend on interaction-owned Port shapes
- **AND** tests SHALL be able to inject fakes without mocking app-local production modules

### Requirement: Redis protocol state uses semantic stores
OIDC provider business and protocol modules SHALL access Redis protocol state through semantic stores or Ports, except inside Redis-backed infrastructure implementations.

#### Scenario: Business module avoids concrete Redis
- **WHEN** claims, interaction, global session, client auth rate limiting, or provider middleware needs Redis-backed behavior
- **THEN** the module SHALL depend on semantic stores or Ports such as session store, provider session binding store, return handle store, token registry, token revocation port, client runtime cache, or client auth failure store
- **AND** the module SHALL NOT directly depend on concrete `ioredis.Redis`

#### Scenario: Redis adapter may use concrete Redis
- **WHEN** Redis-backed stores or `oidc-provider` Redis Adapter implementations persist protocol objects
- **THEN** those infrastructure modules MAY depend on concrete `ioredis.Redis`
- **AND** their collaborators such as client version lookup, provider session binding, and token registry SHALL be expressed as narrow Ports rather than concrete repository classes

### Requirement: Provider wiring centralizes oidc-provider extension points
OIDC provider SHALL centralize `oidc-provider` extension point wiring under provider wiring modules.

#### Scenario: Provider hooks are grouped
- **WHEN** production provider is created
- **THEN** composition SHALL call provider wiring modules for client authentication, redirect URI checks, protocol model payload extensions, Koa middleware, and provider event handlers
- **AND** HTTP server and business services SHALL NOT directly patch `oidc-provider` prototypes or protocol models

#### Scenario: Configuration remains dependency-driven
- **WHEN** provider configuration is created
- **THEN** configuration SHALL receive adapter, claims, signing keys, interaction policy, and minimal config slices as dependencies
- **AND** configuration SHALL NOT construct production repositories, Redis clients, loggers, or signing key loaders internally

### Requirement: Provider DI architecture is guarded by tests
`apps/oidc-provider` SHALL include architecture tests that enforce its DI boundaries.

#### Scenario: Forbidden singleton regression is detected
- **WHEN** protocol/business modules statically import DB singleton, app-local Redis singleton, app-local logger singleton, or concrete production repository/service modules
- **THEN** OIDC provider architecture tests SHALL fail
- **AND** failure output SHALL identify the offending file and import specifier

#### Scenario: Public protocol behavior remains unchanged
- **WHEN** DI migration completes
- **THEN** existing OIDC protocol behavior tests SHALL continue to cover Discovery, JWKS, authorize, token, UserInfo, CORS, logout, Redis adapter, interaction, claims, signing keys, and HTTP logging behavior
- **AND** migration SHALL NOT intentionally change public endpoint semantics
