## ADDED Requirements

### Requirement: Backend Port Data Shapes Have Neutral File Ownership
由多个 backend adapters 或 protocol components 共享的 port input/result shape SHALL 位于 consumer-owned `*.type.ts`、domain module、shared contract 或职责明确的中立 protocol/session type module。Repository implementation file and concrete service module MUST NOT be the authoritative owner of a production port DTO。

#### Scenario: Repository DTO is moved to a neutral owner
- **WHEN** production port 当前从 `*.repository.ts` 或 `repositories/**` import result/input type
- **THEN** type definition SHALL move to an adjacent consumer/neutral type module or existing domain/contracts owner
- **AND** repository implementation SHALL import the neutral type rather than re-export it as the ownership source

#### Scenario: OIDC protocol ports share neutral shapes
- **WHEN** Claims Adapter 与 interaction components 消费 authorization claim、client runtime metadata、global session、provider binding 或 return-handle shape
- **THEN** ports SHALL import each shape from its protocol/session-neutral owner
- **AND** `provider/claims.port.ts` 与 `interaction/interaction.port.ts` MUST NOT depend on `repositories/**` type ownership
- **AND** parallel duplicate DTO definitions MUST NOT be introduced

#### Scenario: Consumer-local data stays co-located
- **WHEN** a data shape is only meaningful to one service or use-case contract
- **THEN** it SHALL remain in that module's adjacent `*.type.ts` or `*.port.ts`
- **AND** it MUST NOT be promoted to a cross-app package solely for this migration

### Requirement: Port Ownership Migration Preserves Runtime Boundaries
Consumer-owned port hardening SHALL preserve API、Admin API 与 OIDC Provider 的 existing runtime behavior and external contracts。The migration MUST NOT require database、Redis、dependency or deployment changes。

#### Scenario: Backend application behavior remains equivalent
- **WHEN** API 或 Admin API repository/service dependencies are retyped through consumer-owned ports
- **THEN** REST/OpenAPI、tRPC、transaction、audit、notification、session revocation 与 profile dirty behavior MUST remain unchanged
- **AND** repository query/write methods and runtime DTO values MUST remain equivalent

#### Scenario: OIDC behavior remains equivalent
- **WHEN** claims 与 interaction ports stop using repository-owned shapes
- **THEN** discovery metadata、claims snapshot、token extra、interaction、binding/config validation 与 credential revocation behavior MUST remain unchanged
- **AND** provider storage、Redis keys/TTL and token/session lifetimes MUST remain unchanged

#### Scenario: No platform migration is introduced
- **WHEN** all production ports satisfy the new ownership guards
- **THEN** database schema、workspace dependencies、environment variables and deployment topology SHALL remain unchanged
