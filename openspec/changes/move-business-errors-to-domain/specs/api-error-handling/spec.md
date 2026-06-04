## MODIFIED Requirements

### Requirement: Centralized API error classes
The system SHALL define reusable backend API infrastructure errors in `packages/api-core/src/errors/` and export them from the errors package entrypoint, while stable cross-app business errors SHALL be owned by `@iam/domain/<domain>`.

#### Scenario: Reusable backend business error is needed
- **WHEN** an error represents a stable backend API business condition used by multiple routes, services, apps, or tests
- **THEN** the error SHALL be represented by a named error class exported from the corresponding `@iam/domain/<domain>` module
- **AND** `@iam/api-core/errors` SHALL NOT export that migrated business error class after the migration is complete

#### Scenario: App-local error is reusable
- **WHEN** an app-local error such as human verification required is part of the shared API response contract
- **THEN** the implementation SHALL classify whether the error is stable domain semantics, API infrastructure behavior, or app-local behavior
- **AND** the error SHALL be defined in `@iam/domain`, `@iam/api-core`, or the owning app according to that classification

#### Scenario: API infrastructure error is needed
- **WHEN** an error represents authorization, maintenance mode, HTTP exception adaptation, or API response serialization behavior
- **THEN** the error SHALL remain represented by a named error class or adapter exported from `@iam/api-core/errors`

### Requirement: Named errors preferred over generic CustomError
The system SHALL prefer named error classes over generic `CustomError` for stable business failures, with stable business error classes exported from `@iam/domain/<domain>`.

#### Scenario: Stable business failure is identified
- **WHEN** an implementation replaces a repeated or externally meaningful `new CustomError(...)` call
- **THEN** it SHALL use a named error class with explicit business code, message, and HTTP status
- **AND** stable cross-app business failures SHALL use named errors from the corresponding `@iam/domain/<domain>` module

#### Scenario: Unclassified generic failure remains
- **WHEN** a generic failure is intentionally left as `CustomError`
- **THEN** the implementation SHALL keep it limited to low-value, boundary, or temporary cases and avoid using it for frontend branch behavior

## ADDED Requirements

### Requirement: API error handling recognizes structured runtime errors
The API error handling layer SHALL serialize both `CustomError` and domain business errors that satisfy the shared API runtime error structure.

#### Scenario: REST handler receives domain business error
- **WHEN** a Hono route or service throws a domain business error with `code`, `message`, and `httpStatus`
- **THEN** the REST error handler SHALL return the existing API response envelope
- **AND** the envelope `code` SHALL equal the domain error business code
- **AND** the envelope `message` SHALL equal the domain error message
- **AND** the HTTP response status SHALL equal the domain error `httpStatus`

#### Scenario: tRPC mapper receives domain business error
- **WHEN** a tRPC procedure catches a domain business error with `code`, `message`, and `httpStatus`
- **THEN** the mapper SHALL convert it to the same tRPC error category currently used for equivalent `CustomError` statuses
- **AND** the tRPC formatter SHALL expose the same `serviceCode`, `serviceMessage`, and `httpStatus` fields consumed by the admin frontend

#### Scenario: Non API error is thrown
- **WHEN** code throws an unknown `Error` or plain object that does not satisfy the API runtime error structure
- **THEN** the REST error handler SHALL continue to return `ApiErrorCode.InternalError`
- **AND** the handler SHALL NOT expose internal details to clients

### Requirement: Business error migration preserves API behavior
Migrating business error definitions from `@iam/api-core` to `@iam/domain` SHALL preserve externally observable REST and tRPC behavior.

#### Scenario: Business error import path changes
- **WHEN** a service changes an error import from `@iam/api-core/errors/...` to `@iam/domain/<domain>`
- **THEN** the thrown error SHALL produce the same `ApiErrorCode`
- **AND** the thrown error SHALL produce the same default message
- **AND** the thrown error SHALL produce the same HTTP status
- **AND** frontend code SHALL NOT need response-handling changes

#### Scenario: Migrated business error is no longer imported from api-core
- **WHEN** a business error class has been migrated to `@iam/domain/<domain>`
- **THEN** backend application code SHALL import it from `@iam/domain/<domain>`
- **AND** `@iam/api-core/errors` SHALL NOT provide a compatibility export for that migrated business error
