## ADDED Requirements

### Requirement: Employment domain errors use centralized API errors
Employment management SHALL use centralized named errors for stable employment failure cases.

#### Scenario: Employment does not exist
- **WHEN** an employment operation targets a missing employment record
- **THEN** the backend SHALL throw the centralized employment not found error

#### Scenario: Employment is not editable
- **WHEN** an operation attempts to modify an employment record that is no longer editable
- **THEN** the backend SHALL throw the centralized employment not editable error

#### Scenario: Employment relationship already exists
- **WHEN** creating an employment relationship would duplicate an existing relationship
- **THEN** the backend SHALL throw a centralized employment already exists error
