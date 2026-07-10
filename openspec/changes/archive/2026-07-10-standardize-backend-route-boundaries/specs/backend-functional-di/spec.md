## ADDED Requirements

### Requirement: Route Adapters Access Persistence Through Service Facades
后端 production route handler 与 adapter SHALL 通过注入的 service 或 use-case facade 访问持久化与 transaction 能力。`routes/**` 下的 production module MUST NOT 直接依赖 app-local repository 或 `UnitOfWorkPort` 的 type/value export。

#### Scenario: Admin query uses service facade
- **WHEN** admin REST/tRPC adapter 实现 position search operation
- **THEN** adapter SHALL 调用注入的 position service facade
- **AND** adapter MUST NOT 注入或 import position repository
- **AND** adapter MAY 保留输入解析、VO mapping 与 response pagination

#### Scenario: API transaction is hidden behind use-case
- **WHEN** API internal contact registration 需要在 transaction 中读写 user、employment、organization、position 和 profile dirty state
- **THEN** route handler SHALL 调用注入的 contact registration use-case
- **AND** handler MUST NOT 声明 repository transaction ports 或调用 `uow.transaction(...)`

#### Scenario: Pure protocol dependencies remain in route
- **WHEN** route 需要 request schema、DTO、domain error、HTTP status、response helper、request/audit context helper、logger 或最小 runtime config 完成协议适配
- **THEN** route MAY 静态 import 纯定义或接收最小 protocol dependency
- **AND** 本要求 MUST NOT 强制为无业务编排的 handler 新增转发 service

### Requirement: Application Workflow And Domain-Aligned Service Boundaries Are Explicit
后端 SHALL 区分跨领域 Application Use Case、领域对齐 Application Service 与 pure domain logic。跨 repository transaction 和 transaction 结果驱动的业务副作用 SHALL 由 Application Use Case 或明确的单领域 Application Service 拥有，而不是由 route 或 pure domain logic 拥有。

#### Scenario: Cross-domain workflow uses application use-case
- **WHEN** 一个 workflow 同时协调 user、employment、organization、position、profile dirty、audit 和 notification
- **THEN** production composition SHALL 创建独立 Application Use Case factory
- **AND** route SHALL 依赖该 use-case facade
- **AND** workflow MUST NOT 被并入通用 `UserService` 或 `RoleService`

#### Scenario: Existing domain-aligned services stay app local
- **WHEN** `UserService`、`RoleService` 或同类 app-local service 依赖 repository、UnitOfWork、audit 或 read model port
- **THEN** 它们 SHALL 被视为领域对齐 Application Service
- **AND** 本变更 MUST NOT 把它们描述为 pure DDD Domain Service
- **AND** `services/**` MUST NOT import `use-cases/**`

#### Scenario: Pure domain logic stays runtime independent
- **WHEN** business rule 位于 `packages/domain`
- **THEN** 该规则 MUST NOT depend on repository、UnitOfWork、audit、network、Hono 或 app composition
- **AND** Application Use Case 与领域对齐 Application Service MAY 静态 import 该纯规则

#### Scenario: Composition owns layer wiring
- **WHEN** Application Use Case 需要领域对齐 service facade、consumer-owned port 或 UnitOfWork
- **THEN** app composition SHALL 创建并注入这些依赖
- **AND** composition root SHALL keep Application Use Case instances in a separate `useCases` field rather than merging them into `services`
- **AND** app-local service 或 `packages/domain` MUST NOT 反向 import Application Use Case

### Requirement: Use-Case Owns Transaction-Result Side Effects
当业务副作用依赖 transaction 内部结果时，同一 service/use-case SHALL 拥有 transaction 和 transaction 成功后的副作用编排。该 service/use-case MUST 接收协议无关的最小 request context，而不是 Hono `Context`。

#### Scenario: Contact registration preserves transaction workflow
- **WHEN** internal contact registration 创建新联系人或为已有联系人补建任职
- **THEN** contact registration use-case SHALL 在 UnitOfWork callback 中完成 organization/position 校验、user/employment 写入和 profile dirty marking
- **AND** route handler SHALL NOT 访问这些 tx-bound ports

#### Scenario: Contact registration runs post-transaction effects
- **WHEN** contact registration transaction 成功
- **THEN** use-case SHALL 使用 transaction 返回的 target user 与 existing-contact 结果记录原有 audit event
- **AND** production 环境 SHALL 继续发送原有欢迎短信
- **AND** non-production 环境 MUST NOT 发送欢迎短信
- **AND** audit 与短信失败 SHALL 按迁移前行为继续向调用方传播

#### Scenario: Use-case stays protocol agnostic
- **WHEN** route 调用 contact registration use-case
- **THEN** route SHALL 只传已校验 input、normalized internal actor 和最小 audit request context
- **AND** use-case MUST NOT import 或接收 Hono `Context`

### Requirement: Architecture Guards Enforce Route Persistence Boundary
API 与 admin-api architecture tests SHALL 扫描 route production module 的 type/value imports，并在 route 直接依赖 app-local repository 或 `@iam/api-core/uow` 时失败。

#### Scenario: Type-only repository import fails
- **WHEN** `*.handlers.ts` 或 `*.adapter.ts` 使用 type-only import 引入 app-local `*.repository`
- **THEN** 对应 backend architecture test SHALL fail
- **AND** failure output SHALL 包含违规文件路径与 import specifier

#### Scenario: UnitOfWork import fails
- **WHEN** route production module import `@iam/api-core/uow` 或在 route 中声明 UnitOfWork dependency
- **THEN** 对应 backend architecture test SHALL fail

#### Scenario: Composition and service remain valid owners
- **WHEN** composition module 创建 repository/service/use-case，或 service/use-case 声明 repository/UnitOfWork port
- **THEN** route persistence boundary guard SHALL NOT 将该 import 视为 route violation
