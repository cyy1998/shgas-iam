## ADDED Requirements

### Requirement: Organization domain errors use centralized API errors
Organization management SHALL use centralized named errors for stable organization failure cases.

#### Scenario: Organization does not exist
- **WHEN** an organization operation targets a missing organization
- **THEN** the backend SHALL throw a centralized organization not found error

#### Scenario: Organization code already exists
- **WHEN** creating or renaming an organization would duplicate an organization code
- **THEN** the backend SHALL throw a centralized organization code exists error

#### Scenario: Organization cannot be deleted
- **WHEN** an organization has child organizations or active employment relationships
- **THEN** the backend SHALL throw the corresponding centralized conflict error
