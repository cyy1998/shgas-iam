## ADDED Requirements

### Requirement: Authentication errors use standardized API error contract
Authentication and session flows SHALL use centralized API errors with string business error codes for stable login, credential, session, and maintenance failures.

#### Scenario: Encrypted login credential is invalid
- **WHEN** password login receives an invalid encrypted credential
- **THEN** the backend SHALL return the standardized invalid login credential error

#### Scenario: Session is missing or expired
- **WHEN** authentication requires a valid session but none exists
- **THEN** the backend SHALL return the standardized unauthorized error with a distinct business error code and HTTP status

#### Scenario: Client is under maintenance
- **WHEN** an authz check rejects access because the target client is under maintenance
- **THEN** the backend SHALL return the standardized maintenance error code
