## ADDED Requirements

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
