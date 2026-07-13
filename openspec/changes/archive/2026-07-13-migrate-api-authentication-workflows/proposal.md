## Why

`apps/api/src/routes/auth` 当前同时拥有 password/mobile login workflow、Redis-backed login failure state 与加密 credential
parser，使 route boundary 无法区分协议适配、调用方目标和可复用 authentication support。作为 umbrella 的第二个 child，需要在
保持登录与 Session Kernel 行为不变的前提下移除 omnibus `AuthService`，并复用首个 child 建立的 use-case composition 模板。

## What Changes

- 将 password login 与 mobile login 建模为两个独立的 Authentication Application Use Case，由 composition 的独立
  `useCases.authentication` 字段提供给 auth route。
- 将 login failure/blacklist Redis 状态迁为 `services/authentication/login-failure.service.ts`，保持失败窗口、阈值、key、TTL
  与提示文案不变。
- 将加密 login credential 解析器迁为 `services/authentication/login-credential.parser.ts`，保持 SM2/SM4、timestamp、nonce
  防重放与错误映射不变。
- 让 auth route 保留 credential/cookie/header 解析、local authz 协议校验和 response adaptation；`authz` 通过最小
  local-session authorizer 调用现有 Session Kernel adapter。
- 删除 `AuthService`、`AuthServiceDeps` 与 `services.auth` wiring；新 use-case ports 直接声明消费方法和中立 shape，并增加
  architecture guards 防止 route application service/stateful helper 与 provider-owned port 回退。
- 扩展 characterization tests，锁定 human verification、failure/blacklist、magic code、verification-code consumption、session、
  audit、Redis key/TTL、cookie 和错误传播，并关闭 umbrella 记录的 API auth test import-order lint baseline。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `backend-functional-di`: 明确 password/mobile login 由 caller-goal use-cases 拥有，authz 只消费最小 session facade，新增
  Authentication ports 由消费方声明，并由 architecture guard 阻止 route service 与 provider-owned port 回退。
- `backend-structure-conventions`: 固定 Authentication use-case、Redis failure service、credential parser 与 auth route/composition
  的位置和命名，同时要求既有登录、Session Kernel、audit、human verification 与 Redis 行为保持不变。

## Impact

- 影响 `apps/api/src/routes/auth`、新增的 `apps/api/src/use-cases/authentication`、
  `apps/api/src/services/authentication`、API composition 与相邻 characterization/architecture tests。
- 保留现有 REST/OpenAPI schema、`global_session` cookie、Session Kernel adapter、User/Mobile/Human Verification service、audit
  builder、Redis key/TTL 和错误类型；不提前迁移 SSO workflow。
- 不改变 database schema、workspace dependency、Redis keyspace、Session Kernel lifetime 或 deployment topology。
