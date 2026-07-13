## 1. Characterization Baseline 与 TDD Red Signal

- [x] 1.1 运行现有 open handler/service、UserService reset 与 API architecture focused tests，记录 child 修改前基线。
  - 2026-07-13：4 个 files、27 tests、58 assertions 全部通过。
- [x] 1.2 扩展 open handler characterization tests，覆盖 `login`、`bindPhone`、`resetPassword` 的 send/verify dispatch、
  Human Verification 前置顺序、SMS/audit payload 与 failure propagation。
- [x] 1.3 扩展 bound-mobile 与 route helper characterization tests，覆盖缺 username、用户不存在、未绑定 mobile、raw/masked
  mobile match/mismatch，以及 null、short、normal mobile masking。
- [x] 1.4 扩展 password reset characterization tests，覆盖 mobile mismatch、invalid code、transaction success/failure、
  success/failure audit、reservation confirm/release、confirm failure 与不标记 profile dirty。
- [x] 1.5 为 `routes/open` service factory 和 Account Recovery port ownership 增加 architecture red test，并确认仅因现有
  `OpenService`/legacy port pattern 触发预期失败。
  - Red evidence：Account Recovery port guard 通过；open route guard 仅报告 `open.port.ts` 与 `open.service.ts`。

## 2. Account Recovery Service 与 Pure Helpers

- [x] 2.1 新建 `services/account-recovery` type、consumer-owned port 与 `AccountRecoveryService.resolveBoundMobile`，保留现有
  active-user lookup、错误顺序、文案和 raw/masked mobile 兼容。
- [x] 2.2 将 `maskMobile` 与 `requirePhoneNumber` 迁为 route-local presenter/validation helper，不通过 composition 注入。
- [x] 2.3 将 legacy `open.service` tests 迁到 Account Recovery service 与 route helper tests，并让对应 characterization tests
  全绿。

## 3. Caller-Goal Use-Cases

- [x] 3.1 先为 `request-password-reset-code` 编写 failing use-case tests，再实现 bound-mobile resolution、ResetPassword SMS、
  success audit 与顺序敏感的 failure propagation。
- [x] 3.2 先为 `verify-password-reset-code` 编写 failing use-case tests，再实现 non-consuming verification、boolean result 与
  success/failure audit。
- [x] 3.3 先为 `reset-password` 编写 failing use-case tests，再迁移 user/mobile validation、verification reservation、password
  hashing、UnitOfWork password/audit write、confirm/release 与错误传播。
- [x] 3.4 从 `UserService` 删除 `resetPassword` public workflow 并收窄其 deps/tests，确认其他 user password/mobile behavior
  保持全绿。
- [x] 3.5 确认三个 use-case 与 shared service 的新 `*.port.ts` 直接声明方法和中立 shape，不使用
  `Pick<...Repository>`、`Pick<...Service>` 或 repository-owned DTO。

## 4. Route、Composition 与 Architecture Guard

- [x] 4.1 更新 open handler tests 为 Account Recovery use-case facade seam，确认 resetPassword usage 走 use-case，login/bindPhone
  保持现有 MobileService/audit path，REST response 不变。
- [x] 4.2 在 services composition 创建 `AccountRecoveryService`，在 use-cases composition 创建三个 operation facade，并通过
  `useCases.accountRecovery` 注入 route composition。
- [x] 4.3 更新 open handlers 使用 route-local helpers 与 caller-goal facades，删除 `open.service.ts`、`open.port.ts` 和
  `services.open` wiring。
- [x] 4.4 完成 API architecture guard，覆盖 migrated route service factory、反向依赖和新 Account Recovery port ownership，
  并确认 red test 转绿。

## 5. Verification 与 Archive 准备

- [x] 5.1 运行 Account Recovery service/use-case/open handler、MobileService、UserService 与 API architecture focused tests。
  - 2026-07-13：10 个 files、58 tests、96 assertions 全部通过。
- [x] 5.2 运行 `pnpm --filter @iam/api test` 与 `pnpm --filter @iam/api typecheck`，确认完整测试和类型检查通过。
  - 2026-07-13：API full test 31 个 files、153 tests、368 assertions 全部通过；typecheck 通过。
- [x] 5.3 运行 `pnpm --filter @iam/api lint`，确认没有新增 diagnostic；只允许 umbrella 记录的
  `auth.handlers.test.ts:2` import-order baseline 保持不变。
  - 2026-07-13：新增 lint diagnostic 已修复；重跑仅剩该 1 条既有 baseline。
- [x] 5.4 运行 child strict validation 与 `pnpm check:openspec`，检查 requirements、scenarios、tasks 和 active changes。
  - 2026-07-13：child strict 通过；聚合检查 36/36 items 与 68 个 archives integrity 通过；`git diff --check` 通过。
- [x] 5.5 人工复核 `/open` REST/OpenAPI、三种 VerificationCodeUsage、Human Verification、SMS、audit、masking、Redis key/TTL、
  password transaction 与 rollback matrix，并记录 child archive readiness。
  - 证据记录于 `verification.md`；结论为已准备 Archive，保留既有 lint baseline 与未执行 live environment smoke 两项残余风险。
