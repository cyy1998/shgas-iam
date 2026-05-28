## ADDED Requirements

### Requirement: Client and SSO errors use centralized API errors
Client registry and SSO flows SHALL use centralized named errors for stable client and SSO validation failures.

#### Scenario: Client does not exist
- **WHEN** a client operation targets a missing client
- **THEN** the backend SHALL throw a centralized client not found error

#### Scenario: Client code already exists
- **WHEN** creating or renaming a client would duplicate a client code
- **THEN** the backend SHALL throw a centralized client code exists error

#### Scenario: SSO request has invalid client or redirect URI
- **WHEN** an SSO request contains an invalid client code or redirect URI
- **THEN** the backend SHALL return the corresponding centralized SSO validation error
