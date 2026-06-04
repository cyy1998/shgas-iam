## Context

`@iam/api-core` 目前提供 Hono app 创建、HTTP response envelope、error handler、tRPC 适配、鉴权 middleware、Redis、logger 等 API 基础设施能力。与此同时，`packages/api-core/src/errors/` 也定义了大量业务领域错误，例如组织、用户、岗位、任职、客户端、权限委托等错误。

`@iam/domain` 已经存在并被 `apps/api`、`apps/admin-api` 用于共享领域 schema、DTO type 和审计辅助逻辑。把稳定业务错误迁入 `@iam/domain` 可以让领域语义集中在 domain 包中，而 `@iam/api-core` 继续负责把可识别的 API runtime error 序列化为 REST/tRPC 响应。

当前关键约束：

- `ApiErrorCode` 已在 `@iam/contracts` 中作为前后端共享协议码，迁移不应改变 error code 字符串。
- REST error handler 和 tRPC mapper 目前主要通过 `err instanceof CustomError` 识别 API 错误。
- `@iam/domain` 不能依赖 `@iam/api-core`，否则业务层会反向依赖 API 基础设施。
- 对外 REST/tRPC response envelope、HTTP status、默认 message 和前端分支行为应保持不变。

## Goals / Non-Goals

**Goals:**

- 将稳定、跨 app 复用的业务错误类迁移到 `@iam/domain/<domain>`。
- 让 `@iam/api-core` 能识别 domain 业务错误并保持现有 REST/tRPC 序列化行为。
- 保持 `ApiErrorCode` 在 `@iam/contracts`，继续作为前后端共享协议。
- 明确哪些错误属于 domain、哪些继续属于 `api-core`、哪些应留在 app-local 或 integration-local。
- 在实施过程中全面迁移业务错误 import，避免 `@iam/api-core/errors` 长期保留业务错误兼容出口。

**Non-Goals:**

- 不重命名现有 `ApiErrorCode` 值。
- 不改变 response envelope、HTTP status 映射、tRPC error formatter 字段或前端错误处理契约。
- 不把所有 `CustomError` 使用一次性消灭；低价值、边界型或临时错误可在后续 change 中继续分类。
- 不调整数据库 schema、业务流程或权限模型。

## Decisions

### Decision 1: `@iam/domain` 定义业务错误，`@iam/api-core` 定义 API 基础设施错误

稳定业务错误类放在对应 domain 子模块中，例如：

- `@iam/domain/user`: `UserNotFoundError`、`UsernameAlreadyExistsError`、`WeakPasswordError`
- `@iam/domain/organization`: `OrganizationNotFoundError`、`OrganizationCodeExistsError`
- `@iam/domain/position`: `PositionNotFoundError`、`PositionCodeExistsError`
- `@iam/domain/employment`: `EmploymentNotFoundError`、`EmploymentNotEditableError`
- `@iam/domain/client`: `ClientNotFoundError`、`ClientCodeExistsError`
- `@iam/domain/privilege`: `PrivilegeDelegationNotFoundError`、`PrivilegeAlreadyDelegatedError`

`@iam/api-core` 保留：

- `CustomError` 或其后续基础 API error 类型。
- `AuthzUnauthorizedError`、`AuthzForbiddenError`、`AuthzMaintenanceError` 等横切鉴权/维护模式错误。
- REST error handler、tRPC mapper、response envelope 和 HTTP status helper。

备选方案：继续把所有 named errors 放在 `api-core`。该方案迁移成本最低，但会让 `api-core` 持续被业务领域污染，新增业务规则仍需修改基础设施包。

### Decision 2: 使用结构化 API error shape 跨包识别，避免 domain 依赖 api-core

domain 业务错误 SHALL 暴露稳定的 runtime shape：

- `message`
- `name`
- `code`
- `httpStatus`

`@iam/api-core` 的 REST error handler 和 tRPC mapper SHALL 通过结构化 type guard 识别可序列化 API error，而不是只依赖 `err instanceof CustomError`。`CustomError` 继续满足同一 shape，因此现有基础设施错误不需要改变外部行为。

备选方案：让 domain error `extends CustomError`。该方案复用现有 handler 最直接，但会引入 `@iam/domain -> @iam/api-core` 依赖，破坏包边界。

备选方案：让 `@iam/api-core` 直接依赖 `@iam/domain` 并判断 `instanceof DomainError`。该方案也会让基础设施包感知具体业务包，后续 domain 增长会继续牵动 `api-core`。

### Decision 3: 保留 `ApiErrorCode` 在 `@iam/contracts`

业务错误类只引用 `ApiErrorCode`，不定义新的业务码来源。`@iam/contracts` 继续是前后端共享协议边界，domain error 是后端 runtime 表达。

备选方案：把 error code 随错误类迁入 domain。该方案会使前端、contracts、domain 的协议边界混在一起，也会增加前端消费稳定 error code 的成本。

### Decision 4: 全面迁移 import，不保留业务错误兼容导出

实施过程中 SHALL 将已迁入 domain 的业务错误 import 全面切换到 `@iam/domain/<domain>`。完成迁移后，`@iam/api-core/errors` SHALL 不再导出这些业务错误，避免旧路径继续被新代码依赖。

备选方案：为迁移期保留 `api-core` re-export。该方案短期风险较低，但容易让旧 import 长期存在，削弱本次边界调整的效果。

### Decision 5: 先迁移稳定跨 app 错误，app-local/integration-local 错误保持就近

明显绑定单个 app、单个 route 或第三方 integration 的错误不强制迁入 domain。例如 `OrcasLoginFailedError` 更适合靠近 Orcas integration；SSO client/redirect/auth code 错误需要按是否属于稳定 SSO domain 再决定归属。

备选方案：所有 named errors 都进入 domain。该方案会让 domain 成为新的杂物层，把 app-local 和 integration-local 行为也提升成跨 app 语义。

## Risks / Trade-offs

- [Risk] 结构化识别过宽，误把普通对象当作 API error → Mitigation：type guard 必须校验 `message`、`code`、`httpStatus` 类型和 HTTP status 范围，并优先保留 `CustomError` 测试覆盖。
- [Risk] 全面迁移 import 的改动面较大 → Mitigation：按 domain 分批迁移并运行 focused typecheck/tests，最后扫描 `@iam/api-core/errors` 旧业务导入确认清零。
- [Risk] domain 携带 `httpStatus` 让领域错误带有 API transport 语义 → Mitigation：本次迁移的是“API-facing business errors”，不是纯领域模型异常；纯算法/解析错误仍可使用普通 `Error` 或 app-local 转换。
- [Risk] tRPC formatter 字段变化影响 admin 前端 → Mitigation：明确保持 `serviceCode`、`serviceMessage`、`httpStatus` 输出不变，并增加 focused test。
- [Risk] 错误分类存在灰区，例如 SSO 和 human verification → Mitigation：先迁移 user/org/position/employment/client/privilege 等清晰跨 app 领域错误；灰区错误在实现时按使用范围单独确认。

## Migration Plan

1. 在 `@iam/domain` 增加业务错误基础结构和各 domain 子模块导出。
2. 更新 `@iam/api-core` REST error handler 和 tRPC mapper，使其识别结构化 API error shape。
3. 分批更新 `apps/api`、`apps/admin-api` 和相关 tests 的业务错误 import。
4. 从 `@iam/api-core/errors` 移除已迁入 domain 的业务错误定义与导出。
5. 运行 `@iam/domain`、`@iam/api-core`、`@iam/api`、`@iam/admin-api` 的 focused tests/typecheck。

Rollback 策略：如果结构化识别或 package 边界引入异常，可保留 domain 错误定义并临时恢复相关调用方 import；由于 response contract 不变，回滚不涉及数据迁移。

## Open Questions

- `InvalidSsoClientError`、`InvalidRedirectUriError`、`InvalidAuthCodeError` 是否应建立 SSO domain 子模块，还是保留在 `apps/api` 的 SSO 边界内？
- `HumanVerificationRequiredError` 是否属于 login/security 横切能力，还是应继续保留在 `api-core` 或 app-local human-verification service？

## Implementation Classification Notes

- `InvalidSsoClientError`、`InvalidRedirectUriError`、`InvalidAuthCodeError`、`LoginFailedError`、`InvalidLoginCredentialError`、`InvalidVerificationCodeError` 暂不迁入 `@iam/domain`：它们当前表达 public API auth/SSO/login 边界行为，不属于本次明确迁移的 user、organization、position、employment、client、privilege 稳定领域错误。若后续建立 SSO/auth domain，再整体收敛。
- `HumanVerificationRequiredError`、`InvalidHumanVerificationSiteError` 暂不迁入 `@iam/domain`：它们属于 apps/api 的 human-verification/login 风控能力，现有 `apps/api/src/services/human-verification/human-verification.error.ts` 已提供 app 侧入口，保留现状避免把风控边界提升为通用业务领域语义。
- `OrcasLoginFailedError` 暂不迁入 `@iam/domain`：它只服务 apps/api 的 Orcas third-party integration，属于 integration-local 失败，不应提升为跨 app domain 语义。
- 被触达代码中剩余的 generic `CustomError` 用法未在本次强行改写：`apps/admin-api/src/services/employment/employment.service.ts` 的祖先组织校验、`apps/api/src/services/mobile/mobile.service.ts` 的短信发送失败、`apps/api/src/services/user/user.service.ts` 的旧密码与新密码相同、`apps/api/src/services/user/user-delegation-query.helper.ts` 的查询参数限制目前都依赖旧的 generic response behavior 或属于 app/integration 边界。若要命名化，应先补充新的 `ApiErrorCode`/业务契约，避免本次迁移改变对外行为。
