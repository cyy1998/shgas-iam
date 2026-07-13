## ADDED Requirements

### Requirement: Admin User Resignation Uses A Caller-Goal Application Use-Case

Admin backend SHALL expose user resignation as a dedicated Application Use Case that owns the cross-domain User and Employment
transaction. The use-case SHALL receive protocol-independent input and normalized audit context.

#### Scenario: Resignation owns the complete transaction
- **WHEN** an admin resigns an existing user
- **THEN** the `resign-user` use-case SHALL resolve the user inside one UnitOfWork
- **AND** it SHALL end all active employments before disabling the user
- **AND** it SHALL record the existing resignation audit and profile dirty facts in the same transaction
- **AND** it SHALL return the existing `true` success result

#### Scenario: Missing user stops the workflow
- **WHEN** the resignation username does not resolve to a user
- **THEN** the use-case SHALL throw the existing user-not-found error
- **AND** it MUST NOT end employments、disable a user、write audit or mark profile dirty

#### Scenario: Audit and dirty context remain ordered
- **WHEN** the resignation transaction reaches its side effects
- **THEN** the audit action、target and details SHALL match the existing `admin.employment.resign_user` payload
- **AND** profile dirty reasons SHALL remain ordered as `EmploymentUpdated` then `UserUpdated`
- **AND** the dirty marker SHALL receive the transaction afterCommit port and the normalized requestId/traceId

### Requirement: Admin Resignation Ports And Guards Enforce Ownership

The new resignation use-case SHALL declare consumer-owned transaction ports, and Admin architecture tests SHALL prevent the
cross-domain workflow from returning to `EmploymentService` or service composition.

#### Scenario: Resignation port owns consumed methods and shapes
- **WHEN** the use-case needs user lookup/update、employment end、audit or profile dirty behavior
- **THEN** its port SHALL directly declare only the consumed methods and neutral target/input shapes
- **AND** it MUST NOT use `Pick<...Repository>`、`Pick<...Service>` or import concrete repository、service、route or adapter modules
- **AND** composition SHALL structurally adapt the existing UnitOfWork transaction ports

#### Scenario: EmploymentService remains domain aligned
- **WHEN** resignation has migrated to the use-case
- **THEN** `EmploymentService` MUST NOT expose or implement `resignUser`
- **AND** create、update、status、delete、transfer and set-primary employment behavior SHALL remain in `EmploymentService`

#### Scenario: Resignation ownership regression fails architecture guard
- **WHEN** production code restores `resignUser` on `EmploymentService`、binds resignation through `services.employment` or places the
  use-case in service composition
- **THEN** Admin API architecture tests SHALL fail with the offending ownership or wiring
