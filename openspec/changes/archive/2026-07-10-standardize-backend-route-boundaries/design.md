## Context

`introduce-functional-di` 已完成 `apps/api` 与 `apps/admin-api` 的 factory、composition root、repository factory 和 UnitOfWork 迁移。当前 route 清单中仍有两个明确例外：

- `apps/admin-api/src/routes/admin/position/position.adapter.ts` 为 search operation 直接注入 `PositionRepository`，同一 adapter 的其余 operation 则通过 `PositionService`。
- `apps/api/src/routes/internal/user/user.handlers.ts` 的 `contactRegister` 直接声明 transaction ports，在 handler 内编排四个 repository、profile dirty、审计和生产短信。

现有 architecture tests 只阻止 route 的生产 value import，未禁止 route 对 repository type 或 `UnitOfWorkPort` 的结构依赖，因此上述模式不会触发 guard。迁移必须保持既有 REST/OpenAPI/tRPC、错误、审计、短信、profile dirty 和 transaction 语义。

## Goals / Non-Goals

**Goals:**

- 让 route handler/adapter 只能通过 service/use-case facade 访问 repository 与 UnitOfWork。
- 为供应商联系人注册建立独立 use-case 边界，保留新建联系人、复用已有联系人、补建任职、dirty marking、审计和生产短信行为。
- 通过固定目录、文件后缀和 factory/type 命名，显式区分跨领域 Application Use Case、领域对齐 Application Service 和 pure domain logic。
- 让 admin position search 与其他 position operation 一样通过 `PositionService`。
- 用 architecture tests 同时扫描 type 与 value import，阻止 route 重新依赖 repository 或 UnitOfWork。
- 将迁移拆成五个可独立审查和验证的批次。

**Non-Goals:**

- 不把所有 route 强制收敛为“一 route 一 service”，也不迁移纯请求解析、cookie/header/redirect、VO 映射或 response envelope 逻辑。
- 不禁止既有 handler 使用纯 schema、DTO、error、audit context/helper；不在本次重写 internal organization/delegation 的简单审计调用。
- 不在本次批量移动或重命名现有 `UserService`、`RoleService` 等领域对齐 Application Service，也不把它们错误定义为 pure DDD Domain Service。
- 不拆分 auth、open、SSO 或 Session Kernel service，不处理 `packages/domain -> @iam/db/schema`、前端 API wrapper 或其他工程审查项。
- 不改变数据库 schema、Redis key、public API、tRPC router、权限模型或发布拓扑。

## Decisions

### 1. 以依赖方向和 transaction 所有权定义 route 边界

Route production module 可以校验已声明的 request schema、提取 request/audit context、读取 middleware bindings、调用一个或多个 service/use-case facade、映射 VO，并生成 HTTP/tRPC response。它 MUST NOT 直接依赖 app-local repository 或 `UnitOfWorkPort`，也不得根据 transaction 结果继续编排属于同一业务用例的 dirty、审计或通知副作用。

保留 handler 对 service facade 和纯 audit helper 的依赖，而不是要求每个 endpoint 新建一层转发 service。替代方案是禁止 route 调用任何 side-effect port 或多个 service；该规则会迫使当前大量薄 handler 做无行为价值的包装，不属于本次两个已证实热点的最小修复。

### 2. 为联系人注册创建独立 Application Use Case

联系人注册横跨 user、employment、organization、position 与 user-profile read model，放入通用 `UserService` 会扩大其职责。实现应在 API Application Use Case 层创建专用 contact registration factory 与 consumer-owned port：

- use-case 接收已校验的注册输入，以及 handler 提取的最小 request context 和 internal actor；不接收 Hono `Context`。
- use-case 拥有 UnitOfWork，在 transaction callback 中完成组织/岗位校验、用户或任职创建和 profile dirty marking。
- transaction 成功后，按现有顺序写审计；仅在 production 发送欢迎短信。任何失败的传播方式保持不变。
- handler 只解析输入、构造最小 context、调用 `registerContact(...)` 并返回原有成功 envelope。

替代方案是把逻辑并入现有 `UserService`。未采用，因为该流程还拥有 employment、organization、position 和通知规则，独立 use-case 更能表达跨 domain workflow，也避免让通用用户 CRUD facade 继续膨胀。

### 3. 用目录和命名区分三类业务模块

仓库采用以下规范语言和代码布局：

- **Application Use Case**：表达一个调用方目标下的跨领域流程，拥有跨 repository UnitOfWork、transaction 结果驱动的审计/通知等编排。放在 `apps/<app>/src/use-cases/<scope>/<verb-noun>/`，主文件使用 `<verb-noun>.use-case.ts`，consumer-owned port 与输入类型使用 `<verb-noun>.port.ts`、`<verb-noun>.type.ts`。Factory/type 使用 `create<VerbNoun>UseCase` 与 `<VerbNoun>UseCase`；production wiring 放在 `apps/<app>/src/composition/use-cases/`，composition root 通过独立 `useCases` 字段向 routes 暴露实例。
- **Domain-aligned Application Service**：围绕一个领域能力提供 app-local command/query facade，可以依赖 repository、UnitOfWork、audit 和 read model port。继续放在 `apps/<app>/src/services/<domain>/<domain>.service.ts`，使用 `create<Domain>Service` 与 `<Domain>Service`；现有 `UserService`、`RoleService` 属于此类，不称为 pure DDD Domain Service。
- **Pure Domain Logic**：不依赖 repository、UnitOfWork、audit、network、Hono 或 app composition 的业务规则，放在 `packages/domain/src/<domain>/`。优先使用 `<Concept>Policy`、`<Concept>Rules`、`<Concept>Specification` 等能表达规则角色的名称；只有行为确实不适合 entity/value object/policy 时才使用 `*DomainService`。

本次联系人注册采用：

```text
apps/api/src/use-cases/internal/register-purveyor-contact/
  register-purveyor-contact.use-case.ts
  register-purveyor-contact.port.ts
  register-purveyor-contact.type.ts
```

Factory/type 使用 `createRegisterPurveyorContactUseCase` 与 `RegisterPurveyorContactUseCase`，返回对象暴露 `execute(input, options)`。`apps/api/src/composition/use-cases/index.ts` 创建实例并通过 `useCases.registerPurveyorContact` 交给 route composition。Route 可以依赖 use-case facade；use-case 可以依赖 consumer-owned ports、UnitOfWork 与领域对齐 service facade；`services/**` MUST NOT 反向 import `use-cases/**`，`packages/domain` MUST NOT import app-local use-case/service。

替代方案是继续把两类 app-local 模块都放在 `services/**` 并统一使用 `*Service`。未采用，因为它无法从路径与名称判断模块是否允许跨领域编排，容易让新的 workflow 再次膨胀 `UserService`、`RoleService`。另一个替代方案是本次全量移动现有 service；风险和回归面超出 route boundary change，留待单独盘点。

### 4. Position search 进入既有 PositionService，VO 与分页仍属于 adapter

`PositionService` 增加 search facade 并依赖 repository 的 `searchPositionsFuzzy` operation。Adapter 调用该 facade 后继续执行现有 `toPositionVo` 和 `paginate`，因为这两步塑造 REST/tRPC 共享的 presentation contract，不拥有 persistence 或 transaction。

替代方案是把 VO 与分页一并移入 service。未采用，因为会让 service 依赖 route-local VO schema，反转当前依赖方向；本 change 只需要消除 adapter 到 repository 的直连。

### 5. Architecture guard 检查 route 的 type 与 value dependency

两个 app 的 architecture tests 应新增明确的 route-layer 检查：`routes/**` 下 production `*.handlers.ts`、`*.adapter.ts`、`*.index.ts` 和 tier middleware 不得 import app-local `*.repository` 或 `@iam/api-core/uow`。检查不以 `hasValueImport` 过滤，从而覆盖 type-only dependency；composition、use-case、service、repository implementation 和 tests 不在该规则范围内。Guard 还应阻止 `services/**` 反向 import `use-cases/**`，保持 application workflow 位于领域对齐 service 之上。

使用语法树 import 扫描延续现有 guard 机制，不引入新的 lint plugin。替代方案是只靠 code review；无法持续防止 type-only port 重新泄漏到 route，因此不采用。

### 6. 五批迁移顺序

1. **行为基线**：补齐 position search 与 contact registration 的 focused characterization tests，覆盖分页/VO、已有联系人、新联系人、任职已存在、组织缺失、dirty reason、审计及 production/non-production 短信。
2. **Admin position 边界**：扩展 `PositionService` search facade，迁移 adapter 与 composition wiring，移除 adapter 的 repository dependency。
3. **联系人 transaction 核心**：按 `use-cases/internal/register-purveyor-contact` 目录和 `*.use-case.ts` 命名创建 Application Use Case/port，把 repository、UnitOfWork 和 profile dirty 编排迁出 handler，并以 use-case unit tests 验证 transaction 分支。
4. **联系人副作用与 route wiring**：把审计、环境判断和欢迎短信纳入 use-case，handler 只传输入与最小 context；更新 composition 和 handler delegation tests。
5. **Guard 与整体回归**：收紧两个 app 的 architecture tests，确认 route 不再 import repository/UoW、service 不反向 import use-case，运行 focused tests、两个 backend 全量 tests、typecheck 和 lint，并同步三类模块的架构与命名约定。

批次按低风险 adapter 修复、transaction 核心、外部副作用、全局防回归的顺序推进。每批发现外部行为差异时停止后续批次，先恢复该批行为等价性。

## Risks / Trade-offs

- [Risk] 联系人注册拆分时改变 transaction、审计或短信的执行顺序 → Mitigation：先建立行为基线；保持“transaction commit → audit → production SMS → response”的当前顺序，并分别断言失败传播。
- [Risk] use-case 输入若直接携带 Hono `Context`，会把协议依赖从 handler 移到 service → Mitigation：只传最小 audit request context 与 normalized internal actor。
- [Risk] 把现有 `UserService`、`RoleService` 称为 Domain Service 会掩盖其 UnitOfWork、repository 与 audit 依赖 → Mitigation：规范名称固定为领域对齐 Application Service；pure domain logic 只放在 `packages/domain`。
- [Risk] 新增 `use-cases/` 后出现 service 反向依赖 workflow → Mitigation：规定 `services/**` 不得 import `use-cases/**`，由 composition 在顶层完成 wiring，并增加 architecture guard。
- [Risk] position service 暴露 repository row shape → Mitigation：以最小 service return type 约束 search 结果，adapter 继续通过既有 schema parser 构造 VO；不让 service import route module。
- [Risk] architecture guard pattern 过宽会误伤 route 的 service/schema type import → Mitigation：只禁止 app-local `*.repository` 与 `@iam/api-core/uow`，并用违规路径与 import specifier 生成可诊断失败信息。
- [Trade-off] 五批全部留在一个 OpenSpec change 中，不能分别 archive → 这些批次共享同一小型边界契约和最终 guard，单一 change 比 umbrella/child 生命周期更轻；tasks 保持批次级复选框和验证点。

## Migration Plan

这是无数据迁移、无分阶段部署需求的源码重构。按五批顺序在同一 `work/standardize-backend-route-boundaries` 分支实施，每批运行对应 focused tests；第五批再执行两个 backend 的完整验证矩阵。若实现回归，可回退当前源码 change，不需要数据库、Redis 或运维回滚。

## Open Questions

无阻断性开放问题。实现时若发现第三个 route 直接依赖 repository/UnitOfWork，应先更新本 design、delta specs 与 tasks，再扩展范围。
