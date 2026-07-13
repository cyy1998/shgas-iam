## ADDED Requirements

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
