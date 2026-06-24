## ADDED Requirements

### Requirement: REST validation failures use standardized envelope
The system SHALL serialize Hono/OpenAPI request validation failures using the standard REST response envelope.

#### Scenario: Request validation fails
- **WHEN** the Hono/OpenAPI validation hook receives an unsuccessful validation result
- **THEN** the REST response HTTP status SHALL be `422`
- **AND** the response body SHALL use `{ code, data, message }`
- **AND** `code` SHALL be `ApiErrorCode.ValidationFailed`
- **AND** `message` SHALL be `请求参数不合法`
- **AND** `data.issues` SHALL equal the original validation issues from the validation result
- **AND** `data.requestId` SHALL be included when a requestId is available
- **AND** the response body SHALL NOT include top-level `success` or `error` fields

#### Scenario: Validation failure is returned without a dedicated error log
- **WHEN** a REST request fails schema validation
- **THEN** the system SHALL rely on the normal request completed log for the `422` request
- **AND** the validation hook SHALL NOT emit a dedicated error or warning log for that validation failure

### Requirement: REST HTTPException adaptation includes request correlation
The REST error handling layer SHALL adapt Hono `HTTPException` responses through the standard envelope while preserving existing transport status and message behavior.

#### Scenario: HTTPException is handled
- **WHEN** centralized REST error handling receives a Hono `HTTPException`
- **THEN** the response HTTP status SHALL equal the exception status
- **AND** the response envelope `code` SHALL be `ApiErrorCode.InternalError`
- **AND** the response envelope `message` SHALL equal the exception message
- **AND** the response envelope `data.requestId` SHALL be included when a requestId is available

### Requirement: REST OpenAPI routes document common error envelopes
REST OpenAPI route definitions SHALL document the common standardized JSON error envelopes for Hono routes.

#### Scenario: REST route declares common error responses
- **WHEN** a REST/Hono route definition is exposed through OpenAPI
- **THEN** the route responses SHALL include common error responses for `400`, `401`, `403`, `404`, `409`, `422`, and `500`
- **AND** the `400`, `401`, `403`, `404`, and `409` response schemas SHALL use the standard error envelope with `data: null`
- **AND** the `422` response schema SHALL use the validation failure envelope with `data.requestId` optional and `data.issues` documented
- **AND** the `500` response schema SHALL use the internal error envelope with `data.requestId` optional

#### Scenario: Non-envelope success routes still document standard errors
- **WHEN** a REST/Hono route has a redirect success response or a protocol-specific success response such as CAP challenge/redeem
- **THEN** the route SHALL still document the common standardized JSON error responses
- **AND** the route SHALL NOT change its success response schema for this error documentation requirement

#### Scenario: tRPC routes are outside REST OpenAPI error response scope
- **WHEN** tRPC procedures are exposed through `/rpc`
- **THEN** this REST OpenAPI common error response requirement SHALL NOT require changing the tRPC runtime error shape
- **AND** this requirement SHALL NOT require documenting tRPC errors as REST envelopes

## MODIFIED Requirements

### Requirement: API error handling recognizes structured runtime errors
The API error handling layer SHALL serialize both `CustomError` and domain business errors that satisfy the shared API runtime error structure.

#### Scenario: REST handler receives domain business error
- **WHEN** a Hono route or service throws a domain business error with `code`, `message`, and `httpStatus`
- **THEN** the REST error handler SHALL return the existing API response envelope
- **AND** the envelope `code` SHALL equal the domain error business code
- **AND** the envelope `message` SHALL equal the domain error message
- **AND** the envelope `data` SHALL remain `null`
- **AND** the HTTP response status SHALL equal the domain error `httpStatus`

#### Scenario: tRPC mapper receives domain business error
- **WHEN** a tRPC procedure catches a domain business error with `code`, `message`, and `httpStatus`
- **THEN** the mapper SHALL convert it to the same tRPC error category currently used for equivalent `CustomError` statuses
- **AND** the tRPC formatter SHALL expose the same `serviceCode`, `serviceMessage`, and `httpStatus` fields consumed by the admin frontend

#### Scenario: Non API error is thrown
- **WHEN** code throws an unknown `Error` or plain object that does not satisfy the API runtime error structure
- **THEN** the REST error handler SHALL return `ApiErrorCode.InternalError`
- **AND** the REST error handler SHALL return HTTP status `500`
- **AND** the response envelope `data.requestId` SHALL be included when a requestId is available
- **AND** the response envelope `message` SHALL instruct the caller to provide requestId when requestId is available
- **AND** the handler SHALL NOT expose internal error names, messages, source locations, or stack traces to clients

### Requirement: Structured logging for unexpected API errors
The system SHALL record unexpected API errors through the configured pino logging pipeline instead of direct console error output.

#### Scenario: Unexpected API error is logged
- **WHEN** centralized API error handling receives an error that is not an API runtime error and is not an `HTTPException`
- **THEN** the system SHALL log the error with a pino-compatible logger
- **AND** the log entry SHALL include the original error object
- **AND** the log entry SHALL include the best-effort source location derived from the error stack
- **AND** the log entry SHALL include `requestId`, `traceId`, `method`, `path`, and `route` when available from the Hono request context
- **AND** the log entry SHALL include stable summary fields `errorName` and `errorMessage`
- **AND** the HTTP response SHALL continue to use the standardized internal-error envelope

#### Scenario: Request logger is available
- **WHEN** `hono-pino` has attached a request logger to the Hono `Context`
- **THEN** centralized API error handling SHALL use that request logger for the unexpected error log
- **AND** request-level logger bindings SHALL remain available to the log pipeline

#### Scenario: Request logger is unavailable
- **WHEN** centralized API error handling cannot read a request logger from the Hono `Context`
- **THEN** the system SHALL use the app-level logger supplied to `createApp` as a fallback
- **AND** the system SHALL NOT fall back to direct `console.error` output for the unexpected API error
