## ADDED Requirements

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

## MODIFIED Requirements

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
