## ADDED Requirements

### Requirement: Generic bad request error type
The system SHALL provide a named API runtime error for generic client request failures that do not require a domain-specific error code.

#### Scenario: Generic bad request error is thrown
- **WHEN** backend code throws the generic bad request error
- **THEN** REST error handling SHALL return HTTP `400`
- **AND** the response envelope `code` SHALL be `ApiErrorCode.BadRequest`
- **AND** the response envelope `message` SHALL equal the error message
- **AND** the response envelope `data` SHALL be `null`

#### Scenario: Generic bad request error is mapped through tRPC
- **WHEN** a tRPC procedure receives the generic bad request error as an API runtime error
- **THEN** the tRPC error code SHALL be `BAD_REQUEST`
- **AND** formatter data SHALL expose `serviceCode = ApiErrorCode.BadRequest`
- **AND** formatter data SHALL expose the error message and HTTP status `400`

### Requirement: Client request failures use named errors
The system SHALL represent expected client request failures with named API or domain error classes instead of bare `CustomError` defaults.

#### Scenario: Client input failure is not domain-specific
- **WHEN** backend code detects an expected client input or request precondition failure that is not stable domain semantics
- **THEN** the implementation SHALL throw the generic bad request error
- **AND** the client SHALL NOT receive `ApiErrorCode.InternalError`
- **AND** the HTTP response SHALL NOT be `500`

#### Scenario: Client input failure is domain-specific
- **WHEN** backend code detects a stable domain business failure with reusable semantics
- **THEN** the implementation SHALL throw a named domain error from the owning `@iam/domain/<domain>` module
- **AND** the error SHALL carry an explicit business code, message, and HTTP status

#### Scenario: Internal failure remains internal
- **WHEN** backend code detects a true internal runtime, persistence, session, or external dependency failure
- **THEN** the implementation SHALL NOT convert that failure to the generic bad request error
- **AND** centralized REST error handling SHALL continue to expose the standardized internal-error envelope
