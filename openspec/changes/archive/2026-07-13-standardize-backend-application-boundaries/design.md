## Context

已归档的 `standardize-backend-route-boundaries` 建立了 route、Application Use Case、领域对齐 Application Service 与 pure domain logic 的基本依赖方向，并明确把 auth、open、SSO 的批量迁移留给后续 change。当前代码仍有以下结构性例外：

- `apps/api/src/routes/auth` 同时包含登录 workflow、登录失败 Redis 状态服务和带 nonce 防重放的 credential parser。
- `apps/api/src/routes/open/open.service.ts` 混合 presentation masking、输入 guard 与 Account Recovery 绑定手机号解析。
- `apps/api/src/routes/sso/sso.service.ts` 用单一 service facade 承载 authorize、callback、code exchange、OA/WeChat login 和 logout 等多个调用方目标。
- `apps/admin-api/src/services/employment/employment.service.ts` 的 `resignUser` 在一个 transaction 中同时结束任职、禁用用户、写 audit 并标记两类 profile dirty fact。
- `apps/oidc-provider/src/provider/claims.ts` 导出 `OidcClaimsService`，但其输入输出和生命周期均属于 `oidc-provider` protocol hook；`composition/services` 也把 adapter、policy、resolver、rate limiter 和 verifier 归为同一类。
- 多个 `*.port.ts` 通过 `Pick<Repository>` 或 repository-owned DTO 定义消费接口，虽为 type-only dependency，仍让 port 的 shape ownership 落在 provider 侧。

本 change 是 umbrella 计划，不直接实现上述源码迁移。每个 child change 从 `feature/standardize-backend-application-boundaries` 派生，独立完成 proposal/design/spec/tasks、TDD、验证和 archive；umbrella 只记录统一规则、依赖顺序与集成验收。

## Goals / Non-Goals

**Goals:**

- 让 Hono route 目录只包含协议 adapter、schema/type、route definition、presenter/mapper 和纯 route-local helper。
- 以调用方目标拆分 Account Recovery、Authentication 和 SSO workflow，避免用 `OpenService`、`AuthService`、`SsoService` 掩盖多个 application flow。
- 把 Admin User Resignation 建模为跨 User 与 Employment 的 Application Use Case。
- 让 non-Hono OIDC provider 组件按 adapter/resolver/policy/handler/security role 命名，不把 protocol hook 误称为领域对齐 Application Service。
- 让新建和迁移模块使用真正的 consumer-owned ports，并在最后一个 child change 收敛已有 repository-owned port shape。
- 为每批迁移建立行为基线和 architecture guards，保持认证、SSO、OIDC、session、audit、notification、profile dirty 和 Redis 行为等价。

**Non-Goals:**

- 不改变 REST/OpenAPI/tRPC/OIDC endpoint、schema、response、redirect、cookie 或 claims contract。
- 不改变数据库 schema、Redis key/TTL、Session Kernel credential/binding model、token 生命周期或部署拓扑。
- 不把所有领域对齐 Application Service 拆成“一方法一 use-case”；单领域 command/query facade 继续保留。
- 不把 `oidc-provider` 的 protocol adapter 移入 `packages/domain`，也不让 pure domain logic 依赖 `oidc-provider` 类型。
- 不在 umbrella 分支直接实现 child change，不跨 child change 混合提交或归档。

## Decisions

### 1. 先按依赖角色分类，再决定目录和后缀

后端模块采用以下判定顺序：

| 角色 | 判定 | 位置与命名 |
| --- | --- | --- |
| Protocol Adapter | 直接处理 Hono、REST/tRPC、cookie/header/redirect 或 `oidc-provider` hook 类型 | Hono 放 `routes/**` 的 `*.handlers.ts`/`*.adapter.ts`；OIDC 放 `provider/**`/`interaction/**` 的 `*Adapter`、`*Resolver`、`*Policy`、`*Handler` |
| Application Use Case | 表达一个调用方目标，协调多个 service/port、状态或副作用 | `use-cases/<scope>/<verb-noun>/<verb-noun>.use-case.ts` |
| Domain-aligned Application Service | 围绕一个领域能力提供可复用 command/query facade | `services/<domain>/<domain>.service.ts` 或同目录中职责明确的 parser/helper |
| Pure Domain Logic | 不依赖 persistence、network、audit、protocol runtime 或 composition | `packages/domain/src/<domain>`，使用 `*Policy`、`*Rules`、`*Specification` |

是否使用 `*Service` 由职责决定，而不是由 factory 是否可注入决定。Protocol adapter 即使内部协调多个 port，只要其 public contract 是 provider hook，就不称为 Application Service；反之，位于 route 目录但持有 Redis 状态或完整业务流程的 factory 也不能因为靠近 HTTP 而保留在 route。

替代方案是把现有文件整体移动到 `services/**`。未采用，因为这只修复路径，不会消除 omnibus service，也无法表达调用方目标和协议角色。

### 2. Account Recovery 由 use-case 表达，`OpenService` 不做一对一替换

Account Recovery 由以下调用方目标组成，child change `migrate-api-account-recovery-workflows` 应为其建立独立 use-case：

- `request-password-reset-code`
- `verify-password-reset-code`
- `reset-password`

现有 `/open` code send/verify endpoint 仍支持 `login`、`resetPassword`、`bindPhone` usage。Route MAY 根据已校验 usage 选择 Account Recovery use-case 或既有非恢复 facade；该选择属于协议 dispatch，不得把绑定手机号查询、短信、audit 或密码重置重新内联进 handler。

`resolveResetPasswordMobile` 不是调用方目标，不独立建 use-case。若三个 use-case 都需要该能力，则提取最小 `AccountRecoveryService.resolveBoundMobile(...)`，通过 consumer-owned user lookup port 查询 active user；它不拥有短信、验证码或密码重置 workflow。

`maskMobile` 留在 route presenter/helper，`requirePhoneNumber` 由 schema refinement 或纯 validation helper 表达。最终删除 `OpenService` 与 `OpenServiceDeps`，不保留同名空转 facade。

替代方案是创建包含全部 `/open` endpoint 的 `AccountRecoveryService`。未采用，因为 `/open` 是 transport tier，且 login/bindPhone 并不都属于 Account Recovery。

### 3. Authentication 拆分登录目标，状态型支持组件进入 authentication service 目录

child change `migrate-api-authentication-workflows` 应创建：

- `login-with-password` Application Use Case：拥有人机校验、用户/密码校验、失败计数、blacklist、session 创建与 success/failure audit。
- `login-with-mobile` Application Use Case：拥有验证码消费、失败计数、blacklist、session 创建与 audit。
- 一个最小 authentication facade 或 session port 用于现有 `authz` local session authorization；不得为了保留旧 API 而继续导出 omnibus `AuthService`。

`login-failure.helper.ts` 实际拥有 Redis 状态和 clock/random 依赖，应迁为 `services/authentication/login-failure.service.ts`。`login-credential.helper.ts` 是带 nonce 防重放的协议安全 parser，应迁到 `services/authentication/login-credential.parser.ts` 或等价的 authentication support module，保留 `Parser` 命名而不称为 use-case。

Route 继续负责读取 credential、cookie/header、设置 global session cookie 和构造 HTTP response。Magic code、人机校验阈值、错误类型、audit action、Redis key 与 TTL 均保持不变。

### 4. SSO 按 endpoint 目标拆 use-case，cookie 与 redirect 仍由 route 拥有

child change `migrate-api-sso-workflows` 应删除 omnibus `SsoService`，并按现有 operation 建立协议无关 use-case facade：

- `authorize-sso-client`
- `complete-sso-callback`
- `exchange-sso-code`
- `login-with-oa`
- `login-with-wechat`
- `logout-sso-session`

共享 redirect allowlist 规则、client lookup 和 session port 通过 consumer-owned ports 提供；WeChat polling/retry 只属于 `login-with-wechat` 内部 collaborator。Use-case 不接收 Hono `Context`，只接收 normalized token source、client/input 和最小 request context。

Route 保留 cookie 名称/属性、query/header token precedence、redirect URL 拼装和 response。ORCAS session identity 只作为 callback/local session 结果，不并入 User Profile。所有 client validation、OA hash/timestamp、WeChat Redis sentinel/TTL、audit 与错误传播保持原行为。

替代方案是仅把 `sso.service.ts` 移到 `services/sso`。未采用，因为六个 operation 具有不同调用目标、依赖与失败面，继续共享一个 service 会保留当前职责聚合。

### 5. Admin User Resignation 是独立跨领域 use-case

child change `extract-admin-user-resignation-use-case` 应创建：

```text
apps/admin-api/src/use-cases/employment/resign-user/
  resign-user.use-case.ts
  resign-user.port.ts
  resign-user.type.ts
```

Use-case 拥有当前单一 UnitOfWork：查询用户、结束其全部 active employments、禁用用户、写原 audit，并以同一 afterCommit context 标记 `EmploymentUpdated` 与 `UserUpdated`。`EmploymentService` 不再导出 `resignUser`，Admin employment adapter 改为依赖 `useCases.resignUser`；REST/tRPC operation key 与 response 保持不变。

`transferEmployment`、`setPrimaryEmployment` 等仍围绕 Employment 生命周期，继续留在 `EmploymentService`。不因它们查询 Organization/Position 就机械拆成 use-case。

### 6. OIDC claims 保持 provider 边界，但按 adapter 命名

child change `clarify-oidc-provider-protocol-components` 应将：

- `createOidcClaimsService` 重命名为 `createOidcClaimsAdapter`
- `OidcClaimsService` 重命名为 `OidcClaimsAdapter`
- factory deps 与测试命名同步为 adapter 语义

该模块继续位于 `provider/claims.ts`，因为它直接实现 `oidc-provider` 的 `findAccount`、token extra 和 claims hook。`OIDC Claims Snapshot` 的 account/client/scope/authorization 固化规则、binding validation 与 invalid credential revocation 行为不得改变。

`composition/services` 当前混合 claims adapter、interaction policy、global session resolver、rate limiter 和 client secret verifier。Child change 应拆为 provider/security/session 的现有 composition ownership，或改成不暗示 Application Service 的 `components` 聚合；不得仅把目录改名而产生新的环依赖。Global session resolver 应直接由 session composition 提供，不通过 services 二次分类。

替代方案是把 claims 移到 `services/claims`。未采用，因为这会让 application layer 直接暴露 `oidc-provider` token 类型，并掩盖其 protocol adapter 身份。

### 7. Consumer-owned port 收敛放在职责迁移之后

前五个 child changes 中新增或迁移的 port MUST 直接声明消费方需要的方法，并使用消费方或中立 `*.type.ts` 中的数据 shape；不得通过 `Pick<ConcreteService>`、`Pick<Repository>` 或从 `*.repository.ts` import DTO 来定义新 port。

最后的 child change `strengthen-backend-consumer-owned-ports` 再统一处理：

- `apps/admin-api/src/services/{client,employment,organization,position,role,user}/*.port.ts`
- `apps/oidc-provider/src/provider/claims.port.ts`
- `apps/oidc-provider/src/interaction/interaction.port.ts`
- 前五批调查发现的同类 production port

Repository/composition adapter 通过结构兼容满足这些 port；共享中立数据 shape 移入所属 `*.type.ts` 或 domain/contracts 模块。Architecture tests 在迁移完成后禁止 production `*.port.ts` 依赖 `*.repository.ts`，并禁止 `Pick<...Repository>`/`Pick<...Service>` 重新成为 port ownership 的替代品。

该批次最后执行，避免业务文件搬迁与 port shape 重写同时发生，降低 review 和故障定位难度。

### 8. Umbrella 采用六个 child changes 和固定集成顺序

| 顺序 | Child change | 依赖 |
| --- | --- | --- |
| 1 | `migrate-api-account-recovery-workflows` | 无；建立迁移模板 |
| 2 | `migrate-api-authentication-workflows` | 1；复用 API use-case composition 约定 |
| 3 | `migrate-api-sso-workflows` | 2；避免并发修改 API services/routes composition |
| 4 | `extract-admin-user-resignation-use-case` | 可在 1-3 期间独立设计，集成时位于 3 之后 |
| 5 | `clarify-oidc-provider-protocol-components` | 可独立设计，集成时位于 4 之后 |
| 6 | `strengthen-backend-consumer-owned-ports` | 1-5 全部完成 |

每个 child change 必须从 umbrella feature 分支创建 `work/<child-name>`，独立 archive 回 feature 分支。不得在同一 child 中顺手迁移下一批模块。只有六个 child 全部归档并通过集成矩阵后，umbrella 才能 archive 到 `main`。

### 9. Characterization tests 与 architecture guards 共同定义完成条件

每个 child 在改 production code 前先建立 focused characterization tests，覆盖 success、主要 failure branch、audit/context、session/Redis side effects 和协议输出。最终 architecture guards 至少验证：

- Hono `routes/**` production module 不导出 `create*Service` 或拥有 repository/UoW/stateful application dependency。
- `services/**` 不反向 import `use-cases/**`。
- 新增/迁移的 `*.port.ts` 不 import repository implementation/type ownership，也不使用 `Pick<...Repository>`/`Pick<...Service>`。
- OIDC provider 的 claims hook 以 adapter contract 注入，protocol module 不静态绑定 DB、Redis 或 logger singleton。

Naming guard 只针对已迁移的 production patterns，不全局禁止单词 `Service`，避免误伤合法的领域对齐 Application Service。

## Implementation Coordination Record

### 迁移前验证基线

基线于 2026-07-13 在 `feature/standardize-backend-application-boundaries`、commit
`5c2d01d4589018a7e124b00dd237f798c36fd131` 记录。命令均从仓库根目录执行；child 验收不得新增失败，最终 umbrella
集成验证必须消除以下已知 lint 失败，并让三个 app 的完整验证全绿。

| App | Focused / architecture baseline | Full test | Typecheck | Lint | 已知基线与归属 |
| --- | --- | --- | --- | --- | --- |
| API | open/auth/SSO 8 个 focused files：54 passed；`src/__tests__/architecture.test.ts`：9 passed | `pnpm --filter @iam/api test`：127 passed | `pnpm --filter @iam/api typecheck`：passed | `pnpm --filter @iam/api lint`：failed，1 diagnostic | `auth.handlers.test.ts:2` import order 由 Authentication child 关闭；此前 child 只允许保留这一条且不得新增 lint diagnostic。 |
| Admin API | employment、REST/tRPC adapter 3 个 focused files：15 passed；`src/__tests__/architecture.test.ts`：8 passed | `pnpm --filter @iam/admin-api test`：98 passed | `pnpm --filter @iam/admin-api typecheck`：passed | `pnpm --filter @iam/admin-api lint`：failed，4 diagnostics | `admin-api-adapter.test.ts` 有 1 条 import order 与 3 条 type-only fixture unused diagnostics，由 User Resignation child 关闭；此前 child 不涉及 Admin API。 |
| OIDC Provider | claims/provider wiring/session security/token flow 4 个 focused files：9 passed；`src/__tests__/architecture.test.ts`：4 passed | `pnpm --filter @iam/oidc-provider test`：65/66 passed，`http-server-logging` 首个用例达到 10 秒 timeout；单文件隔离复跑 3/3 passed | `pnpm --filter @iam/oidc-provider typecheck`：passed | `pnpm --filter @iam/oidc-provider lint`：passed | 记录为现有 timing flake；OIDC child 必须让 full test 在隔离资源下通过，单文件复跑只能辅助诊断，不能替代最终 full test。 |

Focused baseline 使用以下稳定入口：

- API：`pnpm --filter @iam/api exec bun test`，目标文件为 `open.service`、`open.handlers.human-verification`、
  `auth.service`、`auth.handlers`、`auth.routes`、`login-credential.service`、`sso.handlers` 和
  `sso-session-consistency` tests。
- Admin API：`pnpm --filter @iam/admin-api exec bun test`，目标文件为 `employment.service`、`trpc.index` 和
  `admin-api-adapter` tests。
- OIDC Provider：`pnpm --filter @iam/oidc-provider exec vitest run`，目标文件为 `claims`、`provider-wiring`、
  `session-security` 和 `token-flow` tests。
- Architecture guard：分别用对应 app 的 test runner 单独执行 `src/__tests__/architecture.test.ts`。

### Child 分支、依赖与交付边界

所有 child 的唯一 target branch 是 `feature/standardize-backend-application-boundaries`；每个 work branch 必须从已接收
前置 child 的最新 target branch 派生，不能从 `main` 或另一个 work branch 派生。

| 顺序 | Child change | Work branch | 依赖 | Target branch | 交付边界 |
| --- | --- | --- | --- | --- | --- |
| 1 | `migrate-api-account-recovery-workflows` | `work/migrate-api-account-recovery-workflows` | Umbrella baseline | `feature/standardize-backend-application-boundaries` | Account Recovery use-cases、最小 bound-mobile facade、open route/composition 与 guard。 |
| 2 | `migrate-api-authentication-workflows` | `work/migrate-api-authentication-workflows` | Child 1 已归档 | `feature/standardize-backend-application-boundaries` | password/mobile login use-cases、failure service、credential parser、auth route/composition 与 guard。 |
| 3 | `migrate-api-sso-workflows` | `work/migrate-api-sso-workflows` | Child 2 已归档 | `feature/standardize-backend-application-boundaries` | 六个 SSO operation use-cases、shared ports、route/composition 与 guard。 |
| 4 | `extract-admin-user-resignation-use-case` | `work/extract-admin-user-resignation-use-case` | Child 3 已归档后集成；可提前只读调查 | `feature/standardize-backend-application-boundaries` | `resign-user` use-case、Admin route/useCases composition、EmploymentService 收口与 guard。 |
| 5 | `clarify-oidc-provider-protocol-components` | `work/clarify-oidc-provider-protocol-components` | Child 4 已归档后集成；可提前只读调查 | `feature/standardize-backend-application-boundaries` | Claims Adapter 命名、provider/security/session composition 分类与 guard。 |
| 6 | `strengthen-backend-consumer-owned-ports` | `work/strengthen-backend-consumer-owned-ports` | Child 1-5 全部已归档 | `feature/standardize-backend-application-boundaries` | Admin/OIDC production port shape ownership、structural adapter 与三 app guards。 |

### 外部契约保持矩阵

| Child | MUST 保持的外部/运行时契约 | 明确不得改变 |
| --- | --- | --- |
| Account Recovery | `/open` REST/OpenAPI path、method、schema、response/error；`login`、`resetPassword`、`bindPhone` usage dispatch；mobile masking、SMS、audit、verification reserve/confirm/release 和 reset 顺序 | Redis key/TTL、verification usage enum、User/Password persistence、HTTP envelope |
| Authentication | password/mobile login request/response/error；human verification、magic code、failure streak/blacklist、session creation/cookie 和 success/failure audit 顺序 | failure Redis key/TTL、credential nonce/timestamp policy、Session Kernel lifetime、cookie attributes |
| SSO | authorize/callback/token/OA/WeChat/logout endpoints；query/header/cookie token precedence、redirect parameters/allowlist、ORCAS session identity、audit/error propagation | client validation、OA hash/timestamp、WeChat sentinel/retry/TTL、local/global session semantics |
| User Resignation | 既有 Admin REST path、tRPC operation key、success result；同一 transaction 内 employment end + user disable；audit 与 `EmploymentUpdated`/`UserUpdated` dirty facts | schema、transaction atomicity、employment/user persistence behavior、session revocation semantics |
| OIDC Components | discovery metadata、supported flows、claims shape/snapshot timing、token extra、binding/config validation、invalid credential revocation、provider wiring | `oidc-provider` protocol types、token/session lifetime、Redis/provider storage、public issuer endpoints |
| Consumer-Owned Ports | 所有前三 app 已锁定的 endpoint/protocol/session/audit/notification/profile dirty 行为；composition 仅做结构适配 | repository queries/writes、DTO runtime shape、DB schema、Redis keyspace、workspace dependencies |

所有 child 共同保持数据库 schema、部署拓扑与 workspace dependency 不变；任何矩阵变化都必须先更新 umbrella artifacts，再继续
production implementation。

### Archive 回 feature 分支的验收规则

每个 child 进入 Archive 前必须同时满足：

1. child proposal/design/spec/tasks 完整且 apply-ready，所有 tasks 已完成；OpenSpec strict validation 通过。
2. characterization tests 在 production code 修改前出现预期 red signal，迁移后 focused tests 与新增 architecture guards 全绿。
3. 目标 app 的 full test 与 typecheck 通过；lint 不得新增 diagnostic。API Authentication child 和 Admin User Resignation
   child 分别负责关闭上表中的既有 lint baseline，之后所有 child lint 必须全绿。
4. 人工复核本 child 的外部契约矩阵；确认没有 DB schema、Redis key/TTL、workspace dependency 或部署拓扑变化。
5. diff 只包含本 child 计划内 artifacts、tests、production wiring 和必要 docs；不得夹带下一个 child 或无关历史修复。
6. 按 Archive workflow 同步 delta specs、归档 child，并 squash merge 到唯一 target branch；仅在 feature branch 已包含最终提交、
   工作树干净且 smoke check 通过后清理 work branch。
7. merge 后在 feature branch 重跑该 child focused tests、architecture guard、目标 app full test/typecheck/lint，并把命令与结果回写
   本协调记录；任一失败都阻断后续 child 派生。

## Risks / Trade-offs

- [Risk] Account Recovery use-case 与通用 code send/verify endpoint 的 usage 分支交叉 → Mitigation：先锁定三种 `VerificationCodeUsage` characterization；route 只做 dispatch，reset-specific 行为由 use-case 拥有。
- [Risk] Authentication/SSO 拆分改变 audit、failure counting、cookie、redirect 或 error propagation 顺序 → Mitigation：每个 operation 先建立顺序敏感测试，迁移后保持原调用和失败传播顺序。
- [Risk] use-case 数量增加导致 composition 变得冗长 → Mitigation：按 scope 聚合 factory，但 composition root 仍以独立 `useCases` field 暴露，不重新合并成 omnibus service。
- [Risk] 把 OIDC claims 误拆成 application service 会泄漏 provider 类型 → Mitigation：保留 provider adapter，只有确认可独立复用的纯 snapshot rule 才另行提取。
- [Risk] port ownership 收敛引发大量类型改动 → Mitigation：作为最后一个 child 单独执行；只改变 shape ownership，不同时改变 repository 行为或数据模型。
- [Trade-off] 六个 child changes 增加生命周期成本 → 换取每批可独立回滚、验证和归档，并减少三个 app 同时变更造成的 review 风险。

## Migration Plan

1. 在 umbrella feature 分支依次创建六个 child OpenSpec changes；每个 child 明确行为基线、范围和非目标。
2. Child 1-3 顺序迁移 API Account Recovery、Authentication、SSO，并在每批 archive 前运行 API focused/full tests、typecheck、lint 与 architecture tests。
3. Child 4 提取 Admin User Resignation，运行 REST/tRPC focused tests、transaction/use-case tests和 Admin 全量验证。
4. Child 5 校正 OIDC provider claims/component 分类，运行 claims、token flow、provider wiring、architecture 与全量 OIDC tests。
5. Child 6 收敛 consumer-owned ports，并在三个 app 上运行 architecture tests、typecheck、lint 和全量 tests。
6. Umbrella 集成验证通过后归档到 `main`；无数据库或 Redis migration，不需要分阶段发布。

任一 child 出现行为差异时，只回退该 child 的 squash commit，恢复其迁移前 wiring；后续 child 不继续集成。由于没有数据迁移，rollback 不需要额外运维步骤。

## Open Questions

无阻断性开放问题。每个 child 可在 proposal/design 中进一步收窄 operation 命名，但不得改变本 umbrella 确定的职责分类、依赖方向和外部行为保持要求。
