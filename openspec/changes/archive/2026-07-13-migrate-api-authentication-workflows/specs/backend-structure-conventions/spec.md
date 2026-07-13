## ADDED Requirements

### Requirement: API Authentication Modules Use Operation-Specific Locations
API Authentication SHALL place caller-goal login workflow under `use-cases/authentication`、Redis-backed failure state and encrypted
credential parsing under `services/authentication`、and protocol-only behavior under `routes/auth`.

#### Scenario: Login use-case layout is operation-specific
- **WHEN** password and mobile login workflows are materialized
- **THEN** their main modules SHALL be `login-with-password.use-case.ts` and `login-with-mobile.use-case.ts`
- **AND** each use-case SHALL have co-located `*.port.ts` and `*.type.ts` files
- **AND** a single omnibus login use-case or replacement `AuthService` MUST NOT own both operations

#### Scenario: Authentication support layout expresses role
- **WHEN** production composition materializes login failure state and encrypted credential parsing
- **THEN** Redis-backed state SHALL use `services/authentication/login-failure.service.ts`
- **AND** credential parsing SHALL use `services/authentication/login-credential.parser.ts` or an equivalently explicit Parser role
- **AND** `routes/auth` MUST NOT retain stateful `*.helper.ts` modules

#### Scenario: Composition exposes login through useCases
- **WHEN** API production composition materializes Authentication
- **THEN** support modules SHALL be created in services composition
- **AND** password/mobile operation facades SHALL be created in use-cases composition
- **AND** route composition SHALL receive login operations through the separate `useCases` field and local authz through a minimal
  session facade

### Requirement: Authentication Migration Preserves Login Contracts
Moving Authentication workflow and support modules out of auth route SHALL preserve observable REST/OpenAPI、credential、cookie、
Human Verification、failure state、Session Kernel and audit behavior.

#### Scenario: REST OpenAPI and cookie contract remains equivalent
- **WHEN** the Authentication migration is complete
- **THEN** password/mobile login and authz paths、methods、request schemas、success envelopes and error mappings MUST remain unchanged
- **AND** successful password/mobile login SHALL keep the existing `global_session` HttpOnly、SameSite=Lax、path and max-age behavior

#### Scenario: Password login side effects remain equivalent
- **WHEN** password login succeeds or fails after credential parsing
- **THEN** Human Verification、live user lookup、magic code、password check、failure risk/count/blacklist、Session Kernel AMR、audit
  action/payload/order and error propagation MUST match the migration baseline

#### Scenario: Mobile login side effects remain equivalent
- **WHEN** mobile login succeeds or fails
- **THEN** Human Verification、magic code、atomic code consumption/replay、unknown-user handling、shared failure
  count/blacklist、Session Kernel AMR、audit action/payload/order and error propagation MUST match the migration baseline

#### Scenario: Security state and infrastructure remain unchanged
- **WHEN** Authentication support modules move to explicit locations
- **THEN** login credential algorithms、timestamp/nonce policy、failure and blacklist Redis keys/TTL、Session Kernel lifetime and
  client authorization semantics MUST remain unchanged
- **AND** database schema、Redis keyspace、workspace dependencies and deployment topology MUST remain unchanged
