## ADDED Requirements

### Requirement: Handled API errors emit structured error logs
The API error handling layer SHALL emit structured `api.error.handled` logs for known API runtime errors without changing the client-facing response contract.

#### Scenario: REST handler receives API runtime error
- **WHEN** a Hono route or service throws a `CustomError` or domain business error with `code`, `message`, and `httpStatus`
- **THEN** the REST error handler SHALL return the existing API response envelope and HTTP status
- **AND** the system SHALL emit a structured log with `event = "api.error.handled"`
- **AND** the log entry SHALL include `surface = "rest"`, `requestId`, `traceId`, `method`, `path`, `route`, `statusCode`, `errorCode`, `errorName`, and `errorMessage` when available

#### Scenario: REST handler receives HTTPException
- **WHEN** centralized REST error handling receives a Hono `HTTPException`
- **THEN** the response behavior SHALL remain the existing HTTPException adaptation behavior
- **AND** the system SHALL emit a structured log with `event = "api.error.handled"`
- **AND** the log entry SHALL include `surface = "rest"`, the preserved HTTP status as `statusCode`, `errorCode = ApiErrorCode.InternalError`, `errorName`, and `errorMessage`

#### Scenario: Known API error log level is selected
- **WHEN** a known API runtime error is logged
- **THEN** known errors with `httpStatus >= 500` SHALL be logged at `error` level and include the original `err`
- **AND** known errors with `httpStatus = 403` SHALL be logged at `warn` level
- **AND** known errors on `/internal` routes with `httpStatus = 401` or `httpStatus = 403` SHALL be logged at `warn` level
- **AND** ordinary known 4xx errors, including ordinary `401`, `400`, `404`, and `409`, SHALL be logged at `info` level without the original `err`

#### Scenario: Dedicated domain event already exists
- **WHEN** a route or service emits a dedicated domain, security, or integration event before throwing a known API error
- **THEN** centralized API error handling SHALL still emit the corresponding `api.error.handled` log for the failed API request
- **AND** the dedicated event SHALL remain responsible for domain-specific reason fields
- **AND** `api.error.handled` SHALL remain responsible for the uniform API failure fields

### Requirement: tRPC API errors emit structured error logs
The admin-api tRPC route SHALL emit the same API error events used by REST while preserving the existing tRPC error shape.

#### Scenario: tRPC procedure receives API runtime error
- **WHEN** a tRPC procedure maps a `CustomError` or domain business error to `TRPCError`
- **THEN** the tRPC response shape and formatter data SHALL remain compatible with the current admin frontend
- **AND** the system SHALL emit `event = "api.error.handled"`
- **AND** the log entry SHALL include `surface = "trpc"`, `procedurePath` when available, `statusCode`, `errorCode`, `errorName`, and `errorMessage`

#### Scenario: tRPC procedure throws unknown error
- **WHEN** a tRPC procedure fails with an unknown error that does not satisfy the API runtime error structure
- **THEN** the system SHALL emit `event = "api.error.unhandled"`
- **AND** the log entry SHALL include `surface = "trpc"`, `procedurePath` when available, `errorName`, `errorMessage`, and the original `err`
- **AND** the tRPC client-facing behavior SHALL continue to be controlled by tRPC's existing error response behavior

## MODIFIED Requirements

### Requirement: Structured logging for unexpected API errors
The system SHALL record unexpected API errors through the configured pino logging pipeline instead of direct console error output.

#### Scenario: Unexpected API error is logged
- **WHEN** centralized API error handling receives an error that is not an API runtime error and is not an `HTTPException`
- **THEN** the system SHALL log the error with a pino-compatible logger
- **AND** the log entry SHALL use `event = "api.error.unhandled"`
- **AND** the log entry SHALL include `surface = "rest"` and `statusCode = 500`
- **AND** the log entry SHALL include the original error object
- **AND** the log entry SHALL include the best-effort source location derived from the error stack
- **AND** the log entry SHALL include `requestId`, `traceId`, `method`, `path`, and `route` when available from the Hono request context
- **AND** the log entry SHALL include stable summary fields `errorName` and `errorMessage`
- **AND** the log entry SHALL NOT include request body, response body, complete request headers, authorization header, cookie header, token, secret, password, or verification code values
- **AND** the HTTP response SHALL continue to use the standardized internal-error envelope

#### Scenario: Request logger is available
- **WHEN** `hono-pino` has attached a request logger to the Hono `Context`
- **THEN** centralized API error handling SHALL use that request logger for the unexpected error log
- **AND** request-level logger bindings SHALL remain available to the log pipeline

#### Scenario: Request logger is unavailable
- **WHEN** centralized API error handling cannot read a request logger from the Hono `Context`
- **THEN** the system SHALL use the app-level logger supplied to `createApp` as a fallback
- **AND** the system SHALL NOT fall back to direct `console.error` output for the unexpected API error

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

#### Scenario: Validation failure logs a sanitized summary
- **WHEN** a REST request fails schema validation
- **THEN** the system SHALL emit `event = "api.error.handled"` at `info` level
- **AND** the log entry SHALL include `surface = "rest"`, `statusCode = 422`, `errorCode = ApiErrorCode.ValidationFailed`, `errorName = "ValidationError"`, `issueCount`, and `issuePaths`
- **AND** `issuePaths` SHALL contain only issue paths or equivalent schema locations derived from validation issues
- **AND** the validation failure log SHALL NOT include request body, response body, complete request headers, complete validation issues, or user input values
