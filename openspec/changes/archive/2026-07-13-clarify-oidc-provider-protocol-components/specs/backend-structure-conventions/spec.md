## ADDED Requirements

### Requirement: OIDC Claims Uses Protocol Adapter Naming

The OIDC claims hook SHALL remain under the provider boundary and use Adapter naming that reflects its direct `oidc-provider` protocol role.

#### Scenario: Claims Adapter naming is explicit
- **WHEN** the OIDC claims hook is materialized or imported
- **THEN** its module SHALL remain `apps/oidc-provider/src/provider/claims.ts`
- **AND** its factory、return type and deps type SHALL be named `createOidcClaimsAdapter`、`OidcClaimsAdapter` and `CreateOidcClaimsAdapterDeps`
- **AND** `createOidcClaimsService` and `OidcClaimsService` MUST NOT remain as production aliases

#### Scenario: Claims protocol types stay at provider boundary
- **WHEN** claims code receives `AccessToken`、`AuthorizationCode` or other `oidc-provider` model types
- **THEN** those protocol types SHALL remain contained by the provider adapter/configuration boundary
- **AND** the adapter MUST NOT be relocated to an application service folder

### Requirement: OIDC Component Migration Preserves Protocol And Runtime Contracts

Renaming the Claims Adapter and reclassifying composition SHALL preserve observable OIDC/OAuth、claims、token、session、storage and issuer behavior.

#### Scenario: Claims snapshot and token extra remain equivalent
- **WHEN** an authorization code or access token builds or resolves account claims after migration
- **THEN** scope-filtered UserInfo snapshot、ID Token claim filtering、`auth_time` and token extra fields/timing MUST match the baseline
- **AND** authorization claims MUST remain available only for the approved scope/use

#### Scenario: Binding configuration and credential validation remain equivalent
- **WHEN** provider session binding、global session、client config version or credential metadata is missing or inconsistent
- **THEN** claims resolution MUST reject the token at the same validation point as the baseline
- **AND** a resolved but invalid credential MUST be revoked using the same credential id while an unresolved credential MUST NOT add a revocation side effect

#### Scenario: Provider protocol surface remains equivalent
- **WHEN** the refactored composition creates the provider runtime
- **THEN** discovery metadata、supported response/grant/auth methods、PKCE、redirect/CORS rules、protocol payload extensions and public issuer endpoints MUST remain unchanged

#### Scenario: Session storage and deployment remain unchanged
- **WHEN** provider/security/session components are rewired
- **THEN** token/session lifetime、Session Kernel validation、Redis/provider storage keys and TTL MUST remain unchanged
- **AND** database schema、workspace dependencies and deployment topology MUST remain unchanged
