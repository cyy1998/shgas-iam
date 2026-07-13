## ADDED Requirements

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
