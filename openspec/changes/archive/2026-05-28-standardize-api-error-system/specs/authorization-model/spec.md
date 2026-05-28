## ADDED Requirements

### Requirement: Authorization errors use unified CustomError model
Authorization failures SHALL be represented by centralized errors that inherit from `CustomError` and preserve HTTP status.

#### Scenario: User lacks admin access
- **WHEN** an admin route rejects a user due to missing admin permission
- **THEN** the backend SHALL throw a centralized forbidden authorization error
- **AND** Hono and tRPC SHALL expose the same business error semantics

#### Scenario: Internal client secret is invalid
- **WHEN** an internal route rejects a missing or invalid client secret
- **THEN** the backend SHALL throw a centralized unauthorized authorization error
