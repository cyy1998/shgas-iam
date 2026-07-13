## ADDED Requirements

### Requirement: Admin User Resignation Modules Use Explicit Application Locations

Admin User Resignation SHALL place caller-goal workflow under `use-cases/employment/resign-user`, production wiring under
`composition/use-cases`, and REST/tRPC protocol adaptation under the existing employment route.

#### Scenario: Resign-user layout is explicit
- **WHEN** the resignation workflow is materialized
- **THEN** its main module SHALL be `use-cases/employment/resign-user/resign-user.use-case.ts`
- **AND** consumer-owned port and input/options types SHALL be co-located as `resign-user.port.ts` and `resign-user.type.ts`
- **AND** the factory/type SHALL use `createResignUserUseCase` and `ResignUserUseCase`

#### Scenario: Composition exposes resignation separately from services
- **WHEN** Admin production composition creates the resignation use-case
- **THEN** it SHALL create the instance under `composition/use-cases`
- **AND** the composition root SHALL expose it through a separate `useCases` field rather than the `services` aggregate
- **AND** route composition SHALL inject the facade into the employment adapter separately from `EmploymentService`

#### Scenario: Employment adapter remains a protocol adapter
- **WHEN** REST or tRPC invokes the existing resignation operation
- **THEN** the adapter SHALL parse the validated username、normalize audit context and call `resignUser.execute`
- **AND** it MUST NOT own UnitOfWork、repository、audit or profile dirty workflow

### Requirement: User Resignation Migration Preserves Admin Contracts

Moving resignation from `EmploymentService` to a use-case SHALL preserve observable REST/tRPC、transaction、audit、profile dirty and
session behavior.

#### Scenario: REST and tRPC contracts remain equivalent
- **WHEN** the migration is complete
- **THEN** the existing REST path、method、schema、success envelope and error mapping MUST remain unchanged
- **AND** the tRPC employment router key SHALL remain `resignUser` with the same `{ username }` input and `true` result

#### Scenario: Transaction and side effects remain equivalent
- **WHEN** resignation succeeds or any transaction step fails
- **THEN** user lookup、active employment end、user disable、audit and profile dirty order/atomicity MUST match the baseline
- **AND** `adminAuditTransactionOptions` observability and profile rebuild afterCommit behavior MUST remain unchanged

#### Scenario: Session and infrastructure remain unchanged
- **WHEN** resignation workflow changes application ownership
- **THEN** existing session live-state and revocation semantics MUST remain unchanged without adding an explicit revocation side effect
- **AND** database schema、Redis keyspace、workspace dependencies and deployment topology MUST remain unchanged
