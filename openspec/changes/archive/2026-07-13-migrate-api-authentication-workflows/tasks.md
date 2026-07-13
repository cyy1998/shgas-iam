## 1. Characterization Baseline 与 TDD Red Signal

- [x] 1.1 运行现有 auth service/handler/routes/credential parser 与 API architecture focused tests，并记录 child 修改前 API
  full test、typecheck 和 lint 基线。
  - 2026-07-13：focused + architecture 共 5 个 files、36 tests、108 assertions 全部通过；API full test 31 个 files、
    153 tests、368 assertions 通过；typecheck 通过；lint 仅有 `auth.handlers.test.ts:2` import-order baseline。
- [x] 1.2 与用户确认 TDD public seams：password/mobile `execute`、LoginFailureService、LoginCredentialParser、
  `createAuthHandlers` facade dispatch 与 Authentication architecture guards。
- [x] 1.3 扩展 auth handler characterization tests，覆盖 encrypted credential 先解析、password/mobile facade dispatch、
  request context、`global_session` cookie、local authz session facade、header/cookie precedence 与错误传播。
- [x] 1.4 扩展 password login characterization tests，覆盖 Human Verification、user lookup、blacklist、password/MAGIC_CODE、
  failure risk/audit/count、session AMR、success audit、failure cleanup 与调用顺序。
- [x] 1.5 扩展 mobile login characterization tests，覆盖 Human Verification、unknown user、blacklist、MAGIC_CODE、atomic code
  consume/replay、shared failure streak、session AMR、audit 与错误传播。
- [x] 1.6 扩展 LoginFailureService 与 LoginCredentialParser characterization tests，覆盖 Redis keys/window/threshold/TTL/reason、
  timestamp、nonce key/TTL、replay 和 invalid credential mapping。
- [x] 1.7 为 legacy auth route service/stateful helpers 与 Authentication port ownership 增加 architecture red tests，并确认只因
  现有 `auth.service.ts`、`auth.port.ts`、`login-failure.helper.ts`、`login-credential.helper.ts` 模式触发预期失败。

## 2. Authentication Support Modules

- [x] 2.1 将 login failure state 迁为 `services/authentication/login-failure.service.ts`，保留 factory、public behavior、Redis
  keys、30-minute window、5-attempt threshold、blacklist TTL、reason 与 message semantics。
- [x] 2.2 将 encrypted credential parser 迁为 `services/authentication/login-credential.parser.ts`，保留 SM2/SM4、payload schema、
  timestamp window、nonce key/TTL、防重放与错误类型。
- [x] 2.3 将旧 support tests 迁到新模块旁的 `__tests__`，删除 route-local stateful helper files 且保持对应 tests 全绿。

## 3. Caller-Goal Login Use-Cases

- [x] 3.1 先为 `login-with-password` 编写 failing use-case tests，再实现 Human Verification、live user/password/MAGIC_CODE、
  blacklist/failure、PrincipalSession `pwd` AMR、audit 与现有错误传播顺序。
- [x] 3.2 先为 `login-with-mobile` 编写 failing use-case tests，再实现 Human Verification、live user、blacklist、MAGIC_CODE/
  atomic code consume、shared failure state、PrincipalSession `sms` AMR、audit 与现有错误传播顺序。
- [x] 3.3 确认两个 use-case 的 `*.port.ts` 直接声明消费方法和中立 shape，不使用 `Pick<...Repository>`、
  `Pick<...Service>`、concrete service import 或 repository-owned DTO。
- [x] 3.4 从 route boundary 删除 `AuthService`、`AuthServiceDeps` 与 legacy service tests，不保留 forwarding facade，并确认
  local authz 由最小 session authorizer 承担。

## 4. Route、Composition 与 Architecture Guard

- [x] 4.1 更新 auth handler tests 为 `useCases.authentication` operation facade、LoginCredentialParser 与 local-session authorizer
  seams，确认 route 仍拥有 credential/cookie/header/context/response adaptation。
- [x] 4.2 在 services composition 创建 LoginFailureService/LoginCredentialParser，在 use-cases composition 创建 password/mobile
  operations，并通过 `useCases.authentication` 注入 route composition。
- [x] 4.3 更新 auth handlers 使用两个 caller-goal use-case 与最小 local-session authorizer，删除 `services.auth` wiring 和 route
  legacy application files，保持 routes/schema 无 diff。
- [x] 4.4 完成 API architecture guards，覆盖 migrated auth route service/stateful helpers、反向依赖和 Authentication port ownership，
  并确认 red tests 转绿。
- [x] 4.5 修复 umbrella 分配给本 child 的 `auth.handlers.test.ts` import-order lint baseline，不纳入其他无关 lint 修复。

## 5. Verification 与 Archive 准备

- [x] 5.1 运行 Authentication use-case/support/handler/routes、Human Verification、MobileService、Session Kernel 与 API
  architecture focused tests。
  - 2026-07-13：focused 12 files、82 tests、231 assertions 全部通过。
- [x] 5.2 运行 `pnpm --filter @iam/api test` 与 `pnpm --filter @iam/api typecheck`，确认完整测试和类型检查通过。
  - 2026-07-13：API full test 33 files、164 tests、400 assertions 全部通过；typecheck 通过。
- [x] 5.3 运行 `pnpm --filter @iam/api lint`，确认本 child 关闭既有 auth import-order baseline 且 API lint 全绿。
  - 2026-07-13：API lint 通过，既有 `auth.handlers.test.ts` import-order baseline 已关闭。
- [x] 5.4 运行 child strict validation、`pnpm check:openspec` 与 `git diff --check`，检查 requirements、scenarios、tasks、active
  changes 与 archive integrity。
  - 2026-07-13：child strict validation 通过；OpenSpec 36/36 items 通过、69 archives integrity 通过；
    `git diff --check` 通过。
- [x] 5.5 人工复核 REST/OpenAPI、encrypted credential、cookie、Human Verification、MAGIC_CODE、failure/blacklist、Redis
  key/TTL、Session Kernel AMR、audit、rollback matrix，并记录 child archive readiness。
  - 2026-07-13：auth route/schema 无 diff；support modules 与旧实现逐行一致；handler 保留 credential parsing、
    `global_session` cookie 和 local authz header/cookie precedence；use-case tests 覆盖 Human Verification、MAGIC_CODE、
    shared failure/blacklist、atomic code consume/replay、`pwd`/`sms` AMR、audit 与错误传播。未发现 archive blocker。
