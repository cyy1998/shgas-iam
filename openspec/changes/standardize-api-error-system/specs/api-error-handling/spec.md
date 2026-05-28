## ADDED Requirements

### Requirement: Centralized API error classes
The system SHALL define reusable backend API runtime errors in `packages/api-core/src/errors/` and export them from the errors package entrypoint.

#### Scenario: Reusable backend business error is needed
- **WHEN** an error represents a stable backend API business condition used by multiple routes, services, apps, or tests
- **THEN** the error SHALL be represented by a named error class exported from `@iam/api-core/errors`

#### Scenario: App-local error is reusable
- **WHEN** an app-local error such as human verification required is part of the shared API response contract
- **THEN** the error SHALL be migrated or re-exported through `packages/api-core/src/errors/`

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

### Requirement: Compatibility during error code migration
The system SHALL preserve compatibility for existing clients while migrating from numeric service codes to string business error codes.

#### Scenario: Existing frontend branch checks a legacy numeric code
- **WHEN** a frontend flow still depends on an existing numeric service code
- **THEN** the API response or request layer SHALL provide a compatibility path until that flow is migrated

#### Scenario: New code consumes standardized error code
- **WHEN** new backend or frontend code branches on an API error
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
The system SHALL prefer named error classes over generic `CustomError` for stable business failures.

#### Scenario: Stable business failure is identified
- **WHEN** an implementation replaces a repeated or externally meaningful `new CustomError(...)` call
- **THEN** it SHALL use a named error class with explicit business code, message, and HTTP status

#### Scenario: Unclassified generic failure remains
- **WHEN** a generic failure is intentionally left as `CustomError`
- **THEN** the implementation SHALL keep it limited to low-value, boundary, or temporary cases and avoid using it for frontend branch behavior
