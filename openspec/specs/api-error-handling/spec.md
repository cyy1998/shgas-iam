# api-error-handling Specification

## Purpose
TBD - created by archiving change standardize-api-error-system. Update Purpose after archive.
## Requirements
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

### Requirement: Unified CustomError inheritance
Authorization errors SHALL inherit from `CustomError` while preserving HTTP status semantics.

#### Scenario: Unauthorized error is thrown
- **WHEN** code throws an unauthorized API error
- **THEN** the error SHALL be an instance of `CustomError`
- **AND** the error SHALL carry a business error code distinct from its HTTP status
- **AND** the HTTP response status SHALL remain unauthorized

#### Scenario: Maintenance authorization error is thrown
- **WHEN** code throws a maintenance-related authorization error
- **THEN** the error SHALL be handled through the same `CustomError` path as other API errors
- **AND** the error SHALL preserve a maintenance-specific business error code

### Requirement: Business error code and HTTP status separation
The system SHALL represent business error reasons with stable string error codes and transport status with separate HTTP status values.

#### Scenario: Domain conflict error is returned
- **WHEN** a domain conflict such as duplicate organization code is returned to a client
- **THEN** the API envelope SHALL contain a string business error code
- **AND** the HTTP status SHALL be determined independently from that business code

#### Scenario: tRPC maps a business error
- **WHEN** tRPC receives a `CustomError`
- **THEN** it SHALL map transport status from the error HTTP status
- **AND** it SHALL expose the business error code without numeric HTTP-status comparisons

### Requirement: No legacy numeric service code compatibility
The system SHALL not expose legacy numeric service error codes after migrating to string business error codes.

#### Scenario: Error response is returned
- **WHEN** a backend API error is serialized
- **THEN** the API response SHALL expose the string business error code in `code`
- **AND** the response SHALL NOT include `legacyCode` or another legacy numeric business-code field

#### Scenario: Frontend code consumes standardized error code
- **WHEN** frontend code branches on an API error
- **THEN** it SHALL use the string business error code instead of relying on HTTP status numbers as business codes

### Requirement: Login credential parsing error boundary
The system SHALL keep `LoginCredentialError` in `packages/contracts` as a low-level parsing error and convert it to an API error at the backend boundary.

#### Scenario: Login credential decryption fails
- **WHEN** `decryptLoginCredential` throws `LoginCredentialError`
- **THEN** the API login credential service SHALL throw `InvalidLoginCredentialError`
- **AND** the client SHALL receive the standardized login credential business error code

#### Scenario: Contracts package validates credential format
- **WHEN** code inside `packages/contracts` detects invalid login credential structure, signature, or payload
- **THEN** it SHALL throw `LoginCredentialError` without depending on `@iam/api-core`

### Requirement: Named errors preferred over generic CustomError
The system SHALL prefer named error classes over generic `CustomError` for stable business failures, with stable business error classes exported from `@iam/domain/<domain>`.

#### Scenario: Stable business failure is identified
- **WHEN** an implementation replaces a repeated or externally meaningful `new CustomError(...)` call
- **THEN** it SHALL use a named error class with explicit business code, message, and HTTP status
- **AND** stable cross-app business failures SHALL use named errors from the corresponding `@iam/domain/<domain>` module

#### Scenario: Unclassified generic failure remains
- **WHEN** a generic failure is intentionally left as `CustomError`
- **THEN** the implementation SHALL keep it limited to low-value, boundary, or temporary cases and avoid using it for frontend branch behavior

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

### Requirement: Structured logging for unexpected API errors
The system SHALL record unexpected API errors through the configured pino logging pipeline instead of direct console error output.

#### Scenario: Unexpected API error is logged
- **WHEN** centralized API error handling receives an error that is not an API runtime error and is not an `HTTPException`
- **THEN** the system SHALL log the error with a pino-compatible logger
- **AND** the log entry SHALL include the original error object
- **AND** the log entry SHALL include the best-effort source location derived from the error stack
- **AND** the HTTP response SHALL continue to use the standardized internal-error envelope

#### Scenario: Request logger is available
- **WHEN** `hono-pino` has attached a request logger to the Hono `Context`
- **THEN** centralized API error handling SHALL use that request logger for the unexpected error log
- **AND** request-level logger bindings SHALL remain available to the log pipeline

#### Scenario: Request logger is unavailable
- **WHEN** centralized API error handling cannot read a request logger from the Hono `Context`
- **THEN** the system SHALL use the app-level logger supplied to `createApp` as a fallback
- **AND** the system SHALL NOT fall back to direct `console.error` output for the unexpected API error
