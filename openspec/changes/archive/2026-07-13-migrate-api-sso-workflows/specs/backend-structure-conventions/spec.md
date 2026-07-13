## ADDED Requirements

### Requirement: API SSO Modules Use Operation-Specific Locations

API SSO SHALL place caller-goal workflow under `use-cases/sso`、reusable redirect validation under `services/sso`、and protocol-only
behavior under `routes/sso`.

#### Scenario: SSO use-case layout is operation-specific
- **WHEN** authorize、callback、code exchange、OA login、WeChat login and logout workflows are materialized
- **THEN** their main modules SHALL use operation-specific folders and `*.use-case.ts` files under `use-cases/sso`
- **AND** each use-case SHALL have co-located `*.port.ts` and `*.type.ts` files
- **AND** a single omnibus use-case or replacement `SsoService` MUST NOT own multiple operations

#### Scenario: SSO support layout expresses role
- **WHEN** authorize and callback share redirect allowlist validation
- **THEN** the collaborator SHALL use `services/sso/redirect-url.validator.ts` or an equivalently explicit Validator role
- **AND** WeChat-only cache/retry workflow SHALL remain owned by the WeChat login use-case
- **AND** `routes/sso` MUST NOT retain stateful workflow modules

#### Scenario: Composition exposes SSO through useCases
- **WHEN** API production composition materializes SSO operations
- **THEN** redirect validation SHALL be created in services composition
- **AND** all six operation facades SHALL be created under `useCases.sso`
- **AND** route composition SHALL receive them through the separate `useCases` field rather than `services.sso`

### Requirement: SSO Migration Preserves Protocol And Runtime Contracts

Moving SSO workflow out of route SHALL preserve observable REST/OpenAPI、cookie、redirect、client、Session Kernel、ORCAS、OA、WeChat、
Redis and audit behavior.

#### Scenario: Route protocol contract remains equivalent
- **WHEN** the SSO migration is complete
- **THEN** endpoint paths、methods、schemas、success envelopes、error mappings and endpoint configuration MUST remain unchanged
- **AND** cookie names/attributes、query/header/cookie token precedence、redirect targets、parameters and encoding MUST match the baseline

#### Scenario: Callback and code exchange remain equivalent
- **WHEN** Gateway callback or Independent code exchange succeeds or fails
- **THEN** client/secret/redirect validation、auth-code one-time consumption、ORCAS identity、local-session mode/result and error propagation
  MUST match the baseline
- **AND** revoked PrincipalSession、payload write failure and ORCAS failure MUST preserve existing no-token semantics

#### Scenario: OA and WeChat login remain equivalent
- **WHEN** OA or WeChat login succeeds、retries or fails
- **THEN** OA timestamp/hash/user-type and WeChat key/sentinel/retry/delay/TTL/cache payload behavior MUST match the baseline
- **AND** PrincipalSession AMR、success audit payload/order/count and active-user checks MUST remain unchanged

#### Scenario: Session and infrastructure remain unchanged
- **WHEN** SSO operations move to use-cases
- **THEN** Custom SSO Session Kernel lifetime、authority keys、cleanup/notification behavior and legacy bearer observability MUST remain unchanged
- **AND** database schema、Redis keyspace、workspace dependencies、integration contracts and deployment topology MUST remain unchanged
