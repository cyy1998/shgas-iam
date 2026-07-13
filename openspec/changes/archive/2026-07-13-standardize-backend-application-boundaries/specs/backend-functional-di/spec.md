## ADDED Requirements

### Requirement: Legacy Route Application Modules Are Migrated By Responsibility
Hono backend SHALL remove production application service factories and stateful workflow modules from `routes/**` by classifying each behavior as Protocol Adapter、Application Use Case、Domain-aligned Application Service 或 pure helper。迁移 MUST NOT create a one-to-one replacement service solely to preserve a legacy route service name.

#### Scenario: Account recovery uses caller-goal use-cases
- **WHEN** `/open` endpoint 处理 password reset code request、code verification 或 password reset
- **THEN** account recovery workflow SHALL 由独立 Application Use Case facade 拥有
- **AND** route SHALL only dispatch validated usage、extract protocol context、call the facade and build the response
- **AND** `OpenService` MUST NOT remain as an omnibus or forwarding facade

#### Scenario: Authentication login workflows leave routes
- **WHEN** password 或 mobile login 协调 human verification、failure state、user lookup、session creation 和 audit
- **THEN** 每个登录目标 SHALL 由 Application Use Case 拥有
- **AND** Redis-backed login failure state SHALL 位于 authentication service boundary
- **AND** credential parser SHALL use a parser/security role name rather than a use-case or route service name

#### Scenario: SSO operations use separate application facades
- **WHEN** SSO authorize、callback、code exchange、OA login、WeChat login 或 logout 被 production composition 创建
- **THEN** composition SHALL wire operation-specific use-case facades
- **AND** route SHALL retain only cookie、header/query precedence、redirect 和 response adaptation
- **AND** a single `SsoService` MUST NOT own all operations

#### Scenario: Pure route helpers remain local
- **WHEN** route behavior only masks a response field、validates an already parsed primitive、maps a VO 或 joins a redirect URL
- **THEN** behavior MAY remain in `routes/**` as a presenter、mapper、validation helper or pure function
- **AND** behavior MUST NOT be named or composed as an Application Service

### Requirement: Cross-Domain Administrative Workflow Uses Application Use-Case
Admin workflow that atomically changes more than one domain lifecycle SHALL be modeled as an Application Use Case even when its endpoint is grouped under one domain route.

#### Scenario: User resignation crosses user and employment
- **WHEN** admin resigns a user
- **THEN** a `resign-user` use-case SHALL own the transaction that ends active employments and disables the user
- **AND** the use-case SHALL own existing audit and profile dirty orchestration
- **AND** `EmploymentService` MUST NOT expose `resignUser`

#### Scenario: Employment lifecycle remains a domain service
- **WHEN** admin creates、updates、transfers、deletes or selects a primary employment
- **THEN** `EmploymentService` MAY continue to own that behavior
- **AND** querying organization or position within an employment invariant MUST NOT alone force a separate use-case

### Requirement: Protocol Components Are Not Classified As Domain-Aligned Services
Non-Hono backend components whose public contract is a protocol runtime hook SHALL use adapter、resolver、policy、handler 或 security role semantics. Such components MAY depend on consumer-owned ports but MUST NOT be presented as pure domain logic or a domain-aligned Application Service.

#### Scenario: OIDC claims hook is an adapter
- **WHEN** a component implements `oidc-provider` account lookup、token extra 或 claims callback types
- **THEN** the component SHALL be named and injected as `OidcClaimsAdapter` or an equivalently explicit protocol role
- **AND** it MAY remain under `provider/**`
- **AND** it MUST NOT be moved to `packages/domain`

#### Scenario: Claims snapshot behavior stays stable
- **WHEN** OIDC claims adapter creates or reads an OIDC Claims Snapshot
- **THEN** account、client、scope、authorization、session binding 和 config version validation SHALL preserve existing semantics
- **AND** invalid access-token credential revocation behavior MUST remain unchanged

#### Scenario: Composition groups protocol roles explicitly
- **WHEN** OIDC provider composition materializes claims adapter、interaction policy、session resolver、rate limiter 和 client secret verifier
- **THEN** composition SHALL preserve their distinct protocol/security roles
- **AND** a generic `services` aggregate MUST NOT imply that all components are domain-aligned Application Services

### Requirement: Consumer-Owned Ports Own Method And Data Shapes
New or migrated service/use-case `*.port.ts` modules SHALL directly declare the operations and data shapes consumed by that module. They MUST NOT derive the contract with `Pick<Repository>`、`Pick<ConcreteService>` or import repository-owned DTO types.

#### Scenario: Use-case declares a narrow outbound port
- **WHEN** an authentication、SSO、account recovery 或 resignation use-case needs behavior from an existing service/repository adapter
- **THEN** the use-case-owned port SHALL declare only the methods it calls
- **AND** composition SHALL adapt the production implementation structurally

#### Scenario: Port data type has neutral ownership
- **WHEN** multiple adapters need the same input or result shape
- **THEN** the shape SHALL live in a consumer-owned `*.type.ts`、domain module 或 shared contract
- **AND** production `*.port.ts` MUST NOT import that shape from `*.repository.ts`

#### Scenario: Existing repository-derived ports migrate last
- **WHEN** business workflow relocation changes a module that currently uses `Pick<Repository>`
- **THEN** the workflow child change SHALL avoid introducing new repository-derived ports
- **AND** the umbrella's final port-hardening child SHALL remove remaining repository-derived port ownership without changing persistence behavior

### Requirement: Architecture Guards Cover Application Module Classification
Backend architecture tests SHALL detect structural regressions after each migrated boundary while allowing legitimate protocol adapters and domain-aligned services.

#### Scenario: Route service factory fails
- **WHEN** migrated Hono `routes/**` production code exports `create*Service` or statically owns a stateful application dependency
- **THEN** the corresponding architecture test SHALL fail with the file and offending role/dependency

#### Scenario: Repository-derived port fails
- **WHEN** a migrated production `*.port.ts` imports `*.repository.ts` or defines a port through `Pick<...Repository>`/`Pick<...Service>`
- **THEN** the corresponding architecture test SHALL fail

#### Scenario: Legitimate protocol adapter passes
- **WHEN** OIDC provider adapter imports `oidc-provider` protocol types and depends only on injected ports
- **THEN** architecture tests SHALL allow the protocol type dependency
- **AND** they SHALL continue rejecting static DB、Redis singleton、logger singleton or concrete repository value imports outside approved boundaries
