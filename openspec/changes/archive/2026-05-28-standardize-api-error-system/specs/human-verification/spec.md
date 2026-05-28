## ADDED Requirements

### Requirement: Human verification errors are centralized
Human verification failures SHALL use centralized API error classes and standardized string business error codes.

#### Scenario: Verification token is required
- **WHEN** risk rules require human verification and the request has no valid token
- **THEN** the backend SHALL throw the centralized human verification required error

#### Scenario: Verification site key is invalid
- **WHEN** a public human verification endpoint receives an invalid site key
- **THEN** the backend SHALL return a named invalid human verification site error instead of a generic `CustomError`
