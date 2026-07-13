## ADDED Requirements

### Requirement: API Authentication Modules Use Explicit Application Locations
API auth、open 和 SSO modules SHALL place caller-goal workflow under `use-cases/**`, reusable domain-aligned state/facade under `services/**`, and protocol-only behavior under `routes/**`. Production composition MUST expose use-case instances through a separate `useCases` field.

#### Scenario: Account recovery layout is explicit
- **WHEN** account recovery request、verification 和 reset workflows are materialized
- **THEN** their main modules SHALL use `use-cases/account-recovery/<verb-noun>/<verb-noun>.use-case.ts` or an equivalently explicit scope
- **AND** shared bound-mobile resolution MAY use a minimal `services/account-recovery` facade
- **AND** presentation masking and pure input validation SHALL remain route-local helpers

#### Scenario: Authentication layout separates workflow and support
- **WHEN** password/mobile login and login failure state are materialized
- **THEN** login workflows SHALL use `use-cases/authentication/<verb-noun>`
- **AND** Redis-backed failure state and credential parser SHALL use explicit support roles under `services/authentication`
- **AND** `routes/auth` MUST NOT contain `auth.service.ts` or stateful `*.helper.ts`

#### Scenario: SSO layout separates operations
- **WHEN** authorize、callback、code exchange、OA login、WeChat login and logout are materialized
- **THEN** operation-specific use-cases SHALL use `use-cases/sso/<verb-noun>`
- **AND** `routes/sso` SHALL contain only route/index/type/schema/handler and pure protocol helper modules
- **AND** `routes/sso/sso.service.ts` MUST NOT remain

### Requirement: Admin Use-Case Composition Is Separate From Domain Services
`apps/admin-api` SHALL create cross-domain Application Use Cases under `composition/use-cases` and pass them to route composition separately from `services`.

#### Scenario: Resign user wiring uses useCases field
- **WHEN** Admin employment adapter exposes the existing resign-user REST/tRPC operation
- **THEN** adapter SHALL receive `useCases.resignUser` or an equivalent use-case facade
- **AND** the use-case instance MUST NOT be added to the `services` aggregate

#### Scenario: Existing domain services stay domain aligned
- **WHEN** Admin user、employment、role、position、organization or client service owns domain-aligned command/query behavior
- **THEN** it SHALL remain under `services/<domain>`
- **AND** this migration MUST NOT split methods solely because a transaction uses audit、dirty marker or a related-domain lookup

### Requirement: OIDC Provider Components Use Protocol Role Names
`apps/oidc-provider` SHALL use file/factory/type names that distinguish provider adapter、interaction handler/policy、session resolver and security components from domain-aligned Application Services.

#### Scenario: Claims factory uses adapter suffix
- **WHEN** production composition creates the OIDC claims hook
- **THEN** factory/type SHALL use `createOidcClaimsAdapter` and `OidcClaimsAdapter` or equivalent adapter terminology
- **AND** the module MAY remain `provider/claims.ts`

#### Scenario: Composition does not flatten heterogeneous roles
- **WHEN** composition wires claims、interaction、session and client security components
- **THEN** directory/field names SHALL retain provider、interaction、session and security ownership
- **AND** `services` MUST NOT be the only classification for all components

#### Scenario: Provider protocol types stay outside domain
- **WHEN** a module imports `oidc-provider` token、account or interaction types
- **THEN** the module SHALL remain in provider/interaction adapter boundaries
- **AND** `packages/domain` MUST NOT depend on those types

### Requirement: Application Boundary Migration Preserves External Contracts
The six child migrations SHALL preserve existing authentication、Account Recovery、SSO、Admin REST/tRPC and OIDC provider observable behavior.

#### Scenario: Open and authentication contracts remain equivalent
- **WHEN** account recovery and login workflows move out of routes
- **THEN** REST paths、methods、request/response schemas、error types、mobile masking、human verification、magic code、failure thresholds、audit actions and Redis TTL/key semantics MUST remain unchanged

#### Scenario: SSO contracts remain equivalent
- **WHEN** SSO service operations become use-cases
- **THEN** cookie names/attributes、query/header token precedence、redirect parameters、client validation、OA signature/timestamp、WeChat retry/cache、ORCAS result and audit semantics MUST remain unchanged

#### Scenario: Admin resignation contract remains equivalent
- **WHEN** `resignUser` moves from EmploymentService to a use-case
- **THEN** existing REST path、tRPC key、success result、transaction atomicity、audit payload and profile dirty reasons MUST remain unchanged

#### Scenario: OIDC provider contract remains equivalent
- **WHEN** OIDC claims service is reclassified as an adapter and composition roles are reorganized
- **THEN** discovery metadata、supported flow、claims shape、snapshot timing、token extra、session binding validation and revocation semantics MUST remain unchanged

#### Scenario: No data or deployment migration is required
- **WHEN** all child changes are integrated
- **THEN** database schema、Redis keyspace、workspace dependencies and deployment topology SHALL remain unchanged
