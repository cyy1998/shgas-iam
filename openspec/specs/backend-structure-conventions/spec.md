# backend-structure-conventions Specification

## Purpose
Capture backend app structure rules that keep app assembly, middleware composition, route naming, and runtime configuration consistent across backend packages.

## Requirements
### Requirement: 后端入口应只负责应用装配
每个后端 app 的 `src/app.ts` SHALL 只负责读取 app config、env、logger，调用 app-local composition root materialize routes 和 middlewares，并调用 `createApp`。生产 runtime singleton、repository、service、route 和 middleware 的创建 MUST 放在 app-local `src/composition` 或其调用的专用 factory module 中，而不是内联在 `src/app.ts`。

#### Scenario: app 入口装配 logger
- **WHEN** 维护者查看 `apps/api/src/app.ts` 或 `apps/admin-api/src/app.ts`
- **THEN** 文件 MUST 从 app-local logger module import `logger`，并把它作为 `createApp` options 传入

#### Scenario: app 入口调用 composition root
- **WHEN** 维护者查看 `apps/api/src/app.ts` 或 `apps/admin-api/src/app.ts`
- **THEN** 文件 SHALL call app-local composition helper to materialize routes and middlewares
- **AND** 文件 MUST NOT directly instantiate service、repository、Redis、DB 或 integration client

#### Scenario: app-local logger singleton
- **WHEN** 维护者需要在任一后端 app 中使用 logger
- **THEN** 该 app MUST 提供 `src/lib/logger/index.ts`，并由该 module 负责调用 `createLogger`

### Requirement: tier middleware 应保持薄装配层
后端 tier-level `_middleware.ts` SHALL 只负责提供 middleware factory 或组合 middleware list。需要跨多个 tier 复用的 authentication handler MUST 通过 app composition root 注入的 runtime deps 创建，而不是在 `_middleware.ts` 中静态绑定 Redis 或 service singleton。

#### Scenario: admin REST 与 tRPC 共享认证 handler
- **WHEN** `apps/admin-api` 的 `admin` tier 和 `rpc` tier 使用相同 admin authentication 配置
- **THEN** 两个 tier 的 `_middleware.ts` MUST use the same app-level middleware factory or injected authentication handler

#### Scenario: middleware 配置来源单一
- **WHEN** admin authentication 需要读取 Redis、user schema、allowed client codes 或 admin role codes
- **THEN** 这些配置 MUST be provided by app composition root to the middleware factory
- **AND** `_middleware.ts` MUST NOT import app-local Redis singleton directly

### Requirement: backend route modules 应通过 factory 装配 handlers
后端 route index module SHALL 通过 factory 接收已绑定 handlers/adapters，并返回 Hono router。route definition、schema 和 type 文件可继续静态导入纯定义。

#### Scenario: REST route factory
- **WHEN** REST-only route module registers OpenAPI handlers
- **THEN** `*.index.ts` SHALL expose a router factory
- **AND** the factory SHALL receive handler deps or materialized handlers before calling `.openapi(...)`

#### Scenario: Admin REST and tRPC adapter factory
- **WHEN** admin route module exposes both REST handlers and tRPC procedures
- **THEN** adapter operations SHALL be created through a factory with injected service facades
- **AND** REST and tRPC exports SHALL use the same injected operation definitions

### Requirement: 后端配置文件应声明相同运行时边界
`apps/api` 与 `apps/admin-api` 的 TypeScript 和 ESLint 配置 SHALL 对 Bun runtime type 和 scripts 排除规则保持一致。

#### Scenario: TypeScript 配置包含 Bun runtime type
- **WHEN** 维护者查看任一后端 app 的 `tsconfig.json`
- **THEN** `compilerOptions` MUST include `"types": ["bun"]`

#### Scenario: TypeScript 配置排除 scripts
- **WHEN** 维护者查看任一后端 app 的 `tsconfig.json`
- **THEN** 配置 MUST exclude `scripts`

#### Scenario: ESLint 配置忽略 scripts
- **WHEN** 维护者查看任一后端 app 的 `eslint.config.js`
- **THEN** `ignores` MUST include `"scripts/**"`

### Requirement: route 文件命名应表达协议角色
后端 route 文件命名 SHALL 根据协议角色保持一致：REST-only route 使用 `*.handlers.ts`，REST + tRPC 共享 operation 使用 `*.adapter.ts` 与 `*.trpc.ts`，route type 文件 MUST 使用 `*.type.ts`。

#### Scenario: REST-only route 使用 handlers
- **WHEN** route module 只暴露 REST/OpenAPI handler
- **THEN** handler implementation MUST be named `*.handlers.ts`

#### Scenario: REST 和 tRPC 共享 operation 使用 adapter
- **WHEN** route module 需要从同一 operation 同时生成 REST handler 和 tRPC procedure
- **THEN** shared operation implementation MUST be named `*.adapter.ts` and tRPC export module MUST be named `*.trpc.ts`

#### Scenario: route type 文件使用单数 type 后缀
- **WHEN** route module 定义 route handler 类型或 route-local VO type
- **THEN** 文件名 MUST use `*.type.ts` rather than `*.types.ts`

### Requirement: route handler 与 adapter 应保持协议边界
后端 route handler 与 adapter SHALL 聚焦协议适配：读取已校验输入和 middleware bindings、提取 request/audit context、调用 service/use-case facade、映射 route VO，并构造 HTTP/tRPC response。跨 repository 的业务 transaction 与依赖 transaction 结果的后续业务副作用 MUST 由 service/use-case 拥有。

#### Scenario: Thin internal contact registration handler
- **WHEN** `apps/api` internal user route 处理 contact registration request
- **THEN** handler SHALL 提取已校验 input、internal actor 与 audit request context
- **AND** handler SHALL 调用 contact registration use-case 并返回既有 success envelope
- **AND** handler MUST NOT 编排 repository、UnitOfWork、profile dirty、audit write 或欢迎短信

#### Scenario: Shared REST and tRPC position adapter stays presentational
- **WHEN** `apps/admin-api` position adapter 处理 shared REST/tRPC search operation
- **THEN** adapter SHALL 通过 position service 获取查询结果
- **AND** adapter MAY 使用既有 mapper 与 pagination helper 构造共享 presentation result
- **AND** REST 与 tRPC SHALL 继续复用同一个 injected operation definition

#### Scenario: Simple route audit remains allowed
- **WHEN** route 在不读取 transaction 内部结果、不编排跨 repository workflow 的情况下记录现有 request-scoped audit event
- **THEN** handler MAY 使用注入的 audit writer 与纯 audit builder
- **AND** 本要求 MUST NOT 强制迁移无关的 internal organization/delegation audit call

### Requirement: Application use-case 与 service 的位置和命名应表达职责
后端代码结构 SHALL 通过目录、文件后缀和 factory/type 名称区分 Application Use Case、领域对齐 Application Service 与 pure domain logic。

#### Scenario: Cross-domain use-case has explicit location and suffix
- **WHEN** app-local module 表达一个跨领域 workflow
- **THEN** module SHALL 位于 `apps/<app>/src/use-cases/<scope>/<verb-noun>/`
- **AND** 主文件 MUST 使用 `<verb-noun>.use-case.ts`
- **AND** factory/type MUST 使用 `create<VerbNoun>UseCase` 与 `<VerbNoun>UseCase`
- **AND** co-located consumer-owned port 与 input type SHALL 使用 `<verb-noun>.port.ts` 和 `<verb-noun>.type.ts`
- **AND** production wiring SHALL 位于 `apps/<app>/src/composition/use-cases/`
- **AND** composition root SHALL 通过独立 `useCases` field 将实例交给 route composition

#### Scenario: Domain-aligned application service keeps domain folder
- **WHEN** app-local service 围绕 user、role、position 等领域能力提供 command/query facade
- **THEN** module SHALL 位于 `apps/<app>/src/services/<domain>/<domain>.service.ts`
- **AND** factory/type MAY 继续使用 `create<Domain>Service` 与 `<Domain>Service`
- **AND** 该命名 MUST NOT imply pure DDD Domain Service when runtime ports are injected

#### Scenario: Pure domain rule uses semantic name
- **WHEN** business rule 不需要 repository、UnitOfWork、audit、network、Hono 或 app composition
- **THEN** rule SHALL 位于 `packages/domain/src/<domain>/`
- **AND** naming SHALL 使用 `<Concept>Policy`、`<Concept>Rules`、`<Concept>Specification` 或其他能表达规则角色的名称
- **AND** `*DomainService` MUST be reserved for domain behavior that does not naturally belong to entity、value object、policy 或 specification

#### Scenario: Existing services are not bulk renamed
- **WHEN** 实施本 route boundary change
- **THEN** existing `UserService`、`RoleService` and similar modules SHALL remain in their current app-local service locations
- **AND** bulk relocation or renaming MUST be handled by a separately planned change

### Requirement: 后端结构迁移不得改变外部契约
函数工厂 DI 与 route boundary 迁移 SHALL preserve existing REST paths, OpenAPI route definitions, tRPC router shape, authentication behavior, audit semantics, profile dirty semantics, notification behavior, database schema, and service/repository business logic.

#### Scenario: 同步后接口契约保持不变
- **WHEN** 实现本变更后运行后端 typecheck 或 focused tests
- **THEN** 现有 REST route definitions 和 tRPC router exports MUST remain compatible with existing imports and consumers

#### Scenario: service 与 repository 不强行同形
- **WHEN** `apps/api` 与 `apps/admin-api` 的同名 domain service 或 repository 存在不同管理职责
- **THEN** 本变更 MUST NOT merge those modules or move business behavior across app boundaries

#### Scenario: 联系人注册行为保持等价
- **WHEN** contact registration workflow 从 route handler 迁移到 use-case
- **THEN** 已有联系人、补建任职、新建联系人、organization/position 缺失、profile dirty reason 与 success response 语义 MUST remain unchanged
- **AND** audit payload 的 action、actor、target 与 mobile redaction MUST remain unchanged
- **AND** production/non-production 欢迎短信条件与 failure propagation MUST remain unchanged

#### Scenario: Position search contract remains equivalent
- **WHEN** position search 从 adapter-to-repository 调用迁移为 adapter-to-service 调用
- **THEN** REST path、request schema、tRPC router key、VO fields、status text、member count 与 pagination result MUST remain unchanged

### Requirement: API Account Recovery Modules Use Explicit Locations
API Account Recovery SHALL place caller-goal workflow under `use-cases/account-recovery`、shared bound-mobile resolution under
`services/account-recovery` and protocol-only presentation/validation under `routes/open`.

#### Scenario: Account Recovery use-case layout is operation-specific
- **WHEN** password reset code request、code verification and password reset are implemented
- **THEN** their main modules SHALL be
  `request-password-reset-code.use-case.ts`、`verify-password-reset-code.use-case.ts` and `reset-password.use-case.ts`
- **AND** each use-case SHALL have co-located `*.port.ts` and `*.type.ts` files
- **AND** a single omnibus Account Recovery use-case or replacement `OpenService` MUST NOT own all operations

#### Scenario: Bound-mobile resolution is a minimal service
- **WHEN** multiple Account Recovery use-cases need the active user's bound mobile
- **THEN** `services/account-recovery/account-recovery.service.ts` SHALL expose only the reusable resolution behavior
- **AND** it MUST NOT own SMS、verification reservation、password write or audit workflow

#### Scenario: Pure open helpers stay in route boundary
- **WHEN** open route masks a mobile for presentation or validates that a non-recovery phone number exists
- **THEN** the function SHALL remain under `routes/open` with a presenter、validation or pure helper role
- **AND** `routes/open/open.service.ts` and `routes/open/open.port.ts` MUST NOT remain

#### Scenario: Composition exposes account recovery through useCases
- **WHEN** API production composition materializes Account Recovery
- **THEN** the shared resolver SHALL be created in services composition
- **AND** the three operation facades SHALL be created in use-cases composition
- **AND** route composition SHALL receive them through the existing separate `useCases` field rather than `services`

### Requirement: Account Recovery Migration Preserves Open Contracts
Moving Account Recovery out of open route and UserService SHALL preserve observable `/open` contracts、verification state、audit and
password transaction behavior.

#### Scenario: REST and OpenAPI contract remains equivalent
- **WHEN** the Account Recovery migration is complete
- **THEN** `/open/code/send`、`/open/code/verify` and `/open/password/reset` paths、methods、request schemas、success envelopes and
  error mappings MUST remain unchanged
- **AND** the three `VerificationCodeUsage` values MUST remain accepted exactly as before

#### Scenario: Human Verification and user-info masking remain equivalent
- **WHEN** open user-info or code-send requests are handled after migration
- **THEN** existing Human Verification action、context、failure timing and risk recording MUST remain unchanged
- **AND** user-info mobile masking for null、short and normal mobile values MUST remain unchanged

#### Scenario: SMS verification and password side effects remain equivalent
- **WHEN** an Account Recovery request succeeds or fails
- **THEN** SMS provider calls、verification Redis key/TTL、non-consuming verify、reservation confirm/release、password hash/write and
  audit action/payload/order MUST match the migration baseline
- **AND** database schema、Redis keyspace、Session Kernel and deployment topology MUST remain unchanged

### Requirement: API Authentication Modules Use Operation-Specific Locations
API Authentication SHALL place caller-goal login workflow under `use-cases/authentication`、Redis-backed failure state and encrypted
credential parsing under `services/authentication`、and protocol-only behavior under `routes/auth`.

#### Scenario: Login use-case layout is operation-specific
- **WHEN** password and mobile login workflows are materialized
- **THEN** their main modules SHALL be `login-with-password.use-case.ts` and `login-with-mobile.use-case.ts`
- **AND** each use-case SHALL have co-located `*.port.ts` and `*.type.ts` files
- **AND** a single omnibus login use-case or replacement `AuthService` MUST NOT own both operations

#### Scenario: Authentication support layout expresses role
- **WHEN** production composition materializes login failure state and encrypted credential parsing
- **THEN** Redis-backed state SHALL use `services/authentication/login-failure.service.ts`
- **AND** credential parsing SHALL use `services/authentication/login-credential.parser.ts` or an equivalently explicit Parser role
- **AND** `routes/auth` MUST NOT retain stateful `*.helper.ts` modules

#### Scenario: Composition exposes login through useCases
- **WHEN** API production composition materializes Authentication
- **THEN** support modules SHALL be created in services composition
- **AND** password/mobile operation facades SHALL be created in use-cases composition
- **AND** route composition SHALL receive login operations through the separate `useCases` field and local authz through a minimal
  session facade

### Requirement: Authentication Migration Preserves Login Contracts
Moving Authentication workflow and support modules out of auth route SHALL preserve observable REST/OpenAPI、credential、cookie、
Human Verification、failure state、Session Kernel and audit behavior.

#### Scenario: REST OpenAPI and cookie contract remains equivalent
- **WHEN** the Authentication migration is complete
- **THEN** password/mobile login and authz paths、methods、request schemas、success envelopes and error mappings MUST remain unchanged
- **AND** successful password/mobile login SHALL keep the existing `global_session` HttpOnly、SameSite=Lax、path and max-age behavior

#### Scenario: Password login side effects remain equivalent
- **WHEN** password login succeeds or fails after credential parsing
- **THEN** Human Verification、live user lookup、magic code、password check、failure risk/count/blacklist、Session Kernel AMR、audit
  action/payload/order and error propagation MUST match the migration baseline

#### Scenario: Mobile login side effects remain equivalent
- **WHEN** mobile login succeeds or fails
- **THEN** Human Verification、magic code、atomic code consumption/replay、unknown-user handling、shared failure
  count/blacklist、Session Kernel AMR、audit action/payload/order and error propagation MUST match the migration baseline

#### Scenario: Security state and infrastructure remain unchanged
- **WHEN** Authentication support modules move to explicit locations
- **THEN** login credential algorithms、timestamp/nonce policy、failure and blacklist Redis keys/TTL、Session Kernel lifetime and
  client authorization semantics MUST remain unchanged
- **AND** database schema、Redis keyspace、workspace dependencies and deployment topology MUST remain unchanged

### Requirement: API SSO Modules Use Operation-Specific Locations

API SSO SHALL place caller-goal workflow under `use-cases/sso`、reusable redirect validation under `services/sso`、and protocol-only
behavior under `routes/sso`.

#### Scenario: SSO use-case layout is operation-specific
- **WHEN** authorize、callback、code exchange、OA login、WeChat login and logout workflows are materialized
- **THEN** their main modules SHALL use operation-specific folders and `*.use-case.ts` files under `use-cases/sso`
- **AND** each use-case SHALL have co-located `*.port.ts` and `*.type.ts` files
- **AND** a single omnibus use-case or replacement `SsoService` MUST NOT own multiple operations

#### Scenario: SSO support layout expresses role
- **WHEN** authorize and callback share redirect allowlist validation
- **THEN** the collaborator SHALL use `services/sso/redirect-url.validator.ts` or an equivalently explicit Validator role
- **AND** WeChat-only cache/retry workflow SHALL remain owned by the WeChat login use-case
- **AND** `routes/sso` MUST NOT retain stateful workflow modules

#### Scenario: Composition exposes SSO through useCases
- **WHEN** API production composition materializes SSO operations
- **THEN** redirect validation SHALL be created in services composition
- **AND** all six operation facades SHALL be created under `useCases.sso`
- **AND** route composition SHALL receive them through the separate `useCases` field rather than `services.sso`

### Requirement: SSO Migration Preserves Protocol And Runtime Contracts

Moving SSO workflow out of route SHALL preserve observable REST/OpenAPI、cookie、redirect、client、Session Kernel、ORCAS、OA、WeChat、
Redis and audit behavior.

#### Scenario: Route protocol contract remains equivalent
- **WHEN** the SSO migration is complete
- **THEN** endpoint paths、methods、schemas、success envelopes、error mappings and endpoint configuration MUST remain unchanged
- **AND** cookie names/attributes、query/header/cookie token precedence、redirect targets、parameters and encoding MUST match the baseline

#### Scenario: Callback and code exchange remain equivalent
- **WHEN** Gateway callback or Independent code exchange succeeds or fails
- **THEN** client/secret/redirect validation、auth-code one-time consumption、ORCAS identity、local-session mode/result and error propagation
  MUST match the baseline
- **AND** revoked PrincipalSession、payload write failure and ORCAS failure MUST preserve existing no-token semantics

#### Scenario: OA and WeChat login remain equivalent
- **WHEN** OA or WeChat login succeeds、retries or fails
- **THEN** OA timestamp/hash/user-type and WeChat key/sentinel/retry/delay/TTL/cache payload behavior MUST match the baseline
- **AND** PrincipalSession AMR、success audit payload/order/count and active-user checks MUST remain unchanged

#### Scenario: Session and infrastructure remain unchanged
- **WHEN** SSO operations move to use-cases
- **THEN** Custom SSO Session Kernel lifetime、authority keys、cleanup/notification behavior and legacy bearer observability MUST remain unchanged
- **AND** database schema、Redis keyspace、workspace dependencies、integration contracts and deployment topology MUST remain unchanged

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

### Requirement: OIDC Claims Uses Protocol Adapter Naming

The OIDC claims hook SHALL remain under the provider boundary and use Adapter naming that reflects its direct `oidc-provider` protocol role.

#### Scenario: Claims Adapter naming is explicit
- **WHEN** the OIDC claims hook is materialized or imported
- **THEN** its module SHALL remain `apps/oidc-provider/src/provider/claims.ts`
- **AND** its factory、return type and deps type SHALL be named `createOidcClaimsAdapter`、`OidcClaimsAdapter` and `CreateOidcClaimsAdapterDeps`
- **AND** `createOidcClaimsService` and `OidcClaimsService` MUST NOT remain as production aliases

#### Scenario: Claims protocol types stay at provider boundary
- **WHEN** claims code receives `AccessToken`、`AuthorizationCode` or other `oidc-provider` model types
- **THEN** those protocol types SHALL remain contained by the provider adapter/configuration boundary
- **AND** the adapter MUST NOT be relocated to an application service folder

### Requirement: OIDC Component Migration Preserves Protocol And Runtime Contracts

Renaming the Claims Adapter and reclassifying composition SHALL preserve observable OIDC/OAuth、claims、token、session、storage and issuer behavior.

#### Scenario: Claims snapshot and token extra remain equivalent
- **WHEN** an authorization code or access token builds or resolves account claims after migration
- **THEN** scope-filtered UserInfo snapshot、ID Token claim filtering、`auth_time` and token extra fields/timing MUST match the baseline
- **AND** authorization claims MUST remain available only for the approved scope/use

#### Scenario: Binding configuration and credential validation remain equivalent
- **WHEN** provider session binding、global session、client config version or credential metadata is missing or inconsistent
- **THEN** claims resolution MUST reject the token at the same validation point as the baseline
- **AND** a resolved but invalid credential MUST be revoked using the same credential id while an unresolved credential MUST NOT add a revocation side effect

#### Scenario: Provider protocol surface remains equivalent
- **WHEN** the refactored composition creates the provider runtime
- **THEN** discovery metadata、supported response/grant/auth methods、PKCE、redirect/CORS rules、protocol payload extensions and public issuer endpoints MUST remain unchanged

#### Scenario: Session storage and deployment remain unchanged
- **WHEN** provider/security/session components are rewired
- **THEN** token/session lifetime、Session Kernel validation、Redis/provider storage keys and TTL MUST remain unchanged
- **AND** database schema、workspace dependencies and deployment topology MUST remain unchanged

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

### Requirement: API Authentication Modules Use Explicit Application Locations
API auth、open 和 SSO modules SHALL place caller-goal workflow under `use-cases/**`, reusable domain-aligned state/facade under `services/**`, and protocol-only behavior under `routes/**`. Production composition MUST expose use-case instances through a separate `useCases` field.

#### Scenario: Account recovery layout is explicit
- **WHEN** account recovery request、verification 和 reset workflows are materialized
- **THEN** their main modules SHALL use `use-cases/account-recovery/<verb-noun>/<verb-noun>.use-case.ts` or an equivalently explicit scope
- **AND** shared bound-mobile resolution MAY use a minimal `services/account-recovery` facade
- **AND** presentation masking and pure input validation SHALL remain route-local helpers

#### Scenario: Authentication layout separates workflow and support
- **WHEN** password/mobile login and login failure state are materialized
- **THEN** login workflows SHALL use `use-cases/authentication/<verb-noun>`
- **AND** Redis-backed failure state and credential parser SHALL use explicit support roles under `services/authentication`
- **AND** `routes/auth` MUST NOT contain `auth.service.ts` or stateful `*.helper.ts`

#### Scenario: SSO layout separates operations
- **WHEN** authorize、callback、code exchange、OA login、WeChat login and logout are materialized
- **THEN** operation-specific use-cases SHALL use `use-cases/sso/<verb-noun>`
- **AND** `routes/sso` SHALL contain only route/index/type/schema/handler and pure protocol helper modules
- **AND** `routes/sso/sso.service.ts` MUST NOT remain

### Requirement: Admin Use-Case Composition Is Separate From Domain Services
`apps/admin-api` SHALL create cross-domain Application Use Cases under `composition/use-cases` and pass them to route composition separately from `services`.

#### Scenario: Resign user wiring uses useCases field
- **WHEN** Admin employment adapter exposes the existing resign-user REST/tRPC operation
- **THEN** adapter SHALL receive `useCases.resignUser` or an equivalent use-case facade
- **AND** the use-case instance MUST NOT be added to the `services` aggregate

#### Scenario: Existing domain services stay domain aligned
- **WHEN** Admin user、employment、role、position、organization or client service owns domain-aligned command/query behavior
- **THEN** it SHALL remain under `services/<domain>`
- **AND** this migration MUST NOT split methods solely because a transaction uses audit、dirty marker or a related-domain lookup

### Requirement: OIDC Provider Components Use Protocol Role Names
`apps/oidc-provider` SHALL use file/factory/type names that distinguish provider adapter、interaction handler/policy、session resolver and security components from domain-aligned Application Services.

#### Scenario: Claims factory uses adapter suffix
- **WHEN** production composition creates the OIDC claims hook
- **THEN** factory/type SHALL use `createOidcClaimsAdapter` and `OidcClaimsAdapter` or equivalent adapter terminology
- **AND** the module MAY remain `provider/claims.ts`

#### Scenario: Composition does not flatten heterogeneous roles
- **WHEN** composition wires claims、interaction、session and client security components
- **THEN** directory/field names SHALL retain provider、interaction、session and security ownership
- **AND** `services` MUST NOT be the only classification for all components

#### Scenario: Provider protocol types stay outside domain
- **WHEN** a module imports `oidc-provider` token、account or interaction types
- **THEN** the module SHALL remain in provider/interaction adapter boundaries
- **AND** `packages/domain` MUST NOT depend on those types

### Requirement: Application Boundary Migration Preserves External Contracts
The six child migrations SHALL preserve existing authentication、Account Recovery、SSO、Admin REST/tRPC and OIDC provider observable behavior.

#### Scenario: Open and authentication contracts remain equivalent
- **WHEN** account recovery and login workflows move out of routes
- **THEN** REST paths、methods、request/response schemas、error types、mobile masking、human verification、magic code、failure thresholds、audit actions and Redis TTL/key semantics MUST remain unchanged

#### Scenario: SSO contracts remain equivalent
- **WHEN** SSO service operations become use-cases
- **THEN** cookie names/attributes、query/header token precedence、redirect parameters、client validation、OA signature/timestamp、WeChat retry/cache、ORCAS result and audit semantics MUST remain unchanged

#### Scenario: Admin resignation contract remains equivalent
- **WHEN** `resignUser` moves from EmploymentService to a use-case
- **THEN** existing REST path、tRPC key、success result、transaction atomicity、audit payload and profile dirty reasons MUST remain unchanged

#### Scenario: OIDC provider contract remains equivalent
- **WHEN** OIDC claims service is reclassified as an adapter and composition roles are reorganized
- **THEN** discovery metadata、supported flow、claims shape、snapshot timing、token extra、session binding validation and revocation semantics MUST remain unchanged

#### Scenario: No data or deployment migration is required
- **WHEN** all child changes are integrated
- **THEN** database schema、Redis keyspace、workspace dependencies and deployment topology SHALL remain unchanged
