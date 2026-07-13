## Why

`apps/api/src/routes/open` 当前同时拥有 Account Recovery workflow、live user lookup 与纯 presentation/validation helper，
使 route boundary 无法清楚区分协议 dispatch、调用方目标和可复用领域能力。作为 umbrella 迁移的首个 child，需要先建立一套
可复用的 use-case/composition 模板，并在不改变 `/open` 行为的前提下移除 `OpenService` 例外。

## What Changes

- 将 password reset code request、code verification 和 password reset 建模为三个独立的 Account Recovery Application
  Use Case，并由 composition 的独立 `useCases` 字段提供给 open route。
- 将绑定手机号解析收敛为最小 Account Recovery service facade；将 mobile masking 与必填手机号校验保留为 route-local
  pure helper，不以 service 形式装配。
- 让 `/open/code/send` 与 `/open/code/verify` 只按已校验的 `VerificationCodeUsage` dispatch：
  `resetPassword` 交给 Account Recovery use-case，`login` 与 `bindPhone` 保持现有非恢复路径。
- 将 password reset 的 verification reservation、password write、audit 与失败清理 workflow 从通用 `UserService`
  移入 `reset-password` use-case，并使用 consumer-owned ports 连接现有实现。
- 删除 `OpenService`、`OpenServiceDeps` 与 route service factory wiring，增加 characterization tests 和 architecture guards
  防止 stateful workflow 回到 `routes/open`。
- 保持 REST/OpenAPI、三种 verification usage、human verification、SMS、audit、masking、Redis key/TTL、password reset
  transaction 与错误传播行为兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `backend-functional-di`: 明确 Account Recovery workflow 由 caller-goal use-cases 拥有，open route 只做协议 dispatch，
  新建 ports 直接声明消费方法与数据 shape，并由 architecture guard 阻止 route service factory 回退。
- `backend-structure-conventions`: 固定 Account Recovery use-case、最小 service facade、route-local helper 与 composition 的
  位置和命名，同时要求 `/open` 外部契约与运行时副作用保持不变。

## Impact

- 影响 `apps/api/src/routes/open`、`apps/api/src/use-cases/account-recovery`、
  `apps/api/src/services/account-recovery`、API composition 与相邻 characterization/architecture tests。
- 收窄 `apps/api/src/services/user/user.service.ts` 的 password reset 职责，但不改变其他 User command/query 行为。
- 不改变 REST path、method、OpenAPI schema、response envelope、error type、database schema、Redis key/TTL、
  Session Kernel、workspace dependency 或部署拓扑。
