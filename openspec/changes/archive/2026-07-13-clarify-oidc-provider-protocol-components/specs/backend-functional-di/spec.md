## ADDED Requirements

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
