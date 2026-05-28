## ADDED Requirements

### Requirement: Privilege delegation errors use centralized API errors
Privilege delegation SHALL use centralized named errors for stable delegation failure cases.

#### Scenario: Delegation record does not exist
- **WHEN** an operation targets a missing privilege delegation record
- **THEN** the backend SHALL throw a centralized privilege delegation not found error

#### Scenario: Delegation is ended
- **WHEN** an operation attempts to modify an ended delegation
- **THEN** the backend SHALL throw a centralized privilege delegation ended error

#### Scenario: Delegated privilege already exists
- **WHEN** creating delegation would duplicate already delegated privilege codes
- **THEN** the backend SHALL throw a centralized privilege already delegated error
