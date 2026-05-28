## ADDED Requirements

### Requirement: Position domain errors use centralized API errors
Position management SHALL use centralized named errors for stable position failure cases.

#### Scenario: Position does not exist
- **WHEN** a position operation targets a missing position
- **THEN** the backend SHALL throw a centralized position not found error

#### Scenario: Position code already exists
- **WHEN** creating or renaming a position would duplicate a position code
- **THEN** the backend SHALL throw a centralized position code exists error

#### Scenario: Position cannot be deleted
- **WHEN** a position has active employment relationships
- **THEN** the backend SHALL throw the centralized position has employment error
