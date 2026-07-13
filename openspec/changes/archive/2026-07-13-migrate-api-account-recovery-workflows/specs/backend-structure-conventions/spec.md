## ADDED Requirements

### Requirement: API Account Recovery Modules Use Explicit Locations
API Account Recovery SHALL place caller-goal workflow under `use-cases/account-recovery`、shared bound-mobile resolution under
`services/account-recovery` and protocol-only presentation/validation under `routes/open`.

#### Scenario: Account Recovery use-case layout is operation-specific
- **WHEN** password reset code request、code verification and password reset are implemented
- **THEN** their main modules SHALL be
  `request-password-reset-code.use-case.ts`、`verify-password-reset-code.use-case.ts` and `reset-password.use-case.ts`
- **AND** each use-case SHALL have co-located `*.port.ts` and `*.type.ts` files
- **AND** a single omnibus Account Recovery use-case or replacement `OpenService` MUST NOT own all operations

#### Scenario: Bound-mobile resolution is a minimal service
- **WHEN** multiple Account Recovery use-cases need the active user's bound mobile
- **THEN** `services/account-recovery/account-recovery.service.ts` SHALL expose only the reusable resolution behavior
- **AND** it MUST NOT own SMS、verification reservation、password write or audit workflow

#### Scenario: Pure open helpers stay in route boundary
- **WHEN** open route masks a mobile for presentation or validates that a non-recovery phone number exists
- **THEN** the function SHALL remain under `routes/open` with a presenter、validation or pure helper role
- **AND** `routes/open/open.service.ts` and `routes/open/open.port.ts` MUST NOT remain

#### Scenario: Composition exposes account recovery through useCases
- **WHEN** API production composition materializes Account Recovery
- **THEN** the shared resolver SHALL be created in services composition
- **AND** the three operation facades SHALL be created in use-cases composition
- **AND** route composition SHALL receive them through the existing separate `useCases` field rather than `services`

### Requirement: Account Recovery Migration Preserves Open Contracts
Moving Account Recovery out of open route and UserService SHALL preserve observable `/open` contracts、verification state、audit and
password transaction behavior.

#### Scenario: REST and OpenAPI contract remains equivalent
- **WHEN** the Account Recovery migration is complete
- **THEN** `/open/code/send`、`/open/code/verify` and `/open/password/reset` paths、methods、request schemas、success envelopes and
  error mappings MUST remain unchanged
- **AND** the three `VerificationCodeUsage` values MUST remain accepted exactly as before

#### Scenario: Human Verification and user-info masking remain equivalent
- **WHEN** open user-info or code-send requests are handled after migration
- **THEN** existing Human Verification action、context、failure timing and risk recording MUST remain unchanged
- **AND** user-info mobile masking for null、short and normal mobile values MUST remain unchanged

#### Scenario: SMS verification and password side effects remain equivalent
- **WHEN** an Account Recovery request succeeds or fails
- **THEN** SMS provider calls、verification Redis key/TTL、non-consuming verify、reservation confirm/release、password hash/write and
  audit action/payload/order MUST match the migration baseline
- **AND** database schema、Redis keyspace、Session Kernel and deployment topology MUST remain unchanged
