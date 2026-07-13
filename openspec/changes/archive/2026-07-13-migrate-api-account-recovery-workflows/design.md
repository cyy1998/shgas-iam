## Context

`apps/api/src/routes/open/open.handlers.ts` 当前处理七个 `/open` operation。其中 `codeSend`、`codeVerify` 和
`passwordReset` 在 route 内完成 resetPassword 手机号解析、SMS/verification 调用、audit 与 UserService 调用；
`open.service.ts` 又把 live user lookup、mobile masking 和必填校验组合为一个 route-local `OpenService`。

现有 password reset 的核心一致性语义位于 `UserService.resetPassword`：先读取 active user 并校验 mobile，失败时写 audit；
再 reserve `resetPassword` verification code、hash 新密码、在 UnitOfWork 内写 password 与成功 audit，commit 后 confirm
reservation；transaction 失败时 release reservation。该顺序、错误类型与 failure propagation 已被相邻测试部分覆盖，本次迁移
必须保持。

本 change 是 `standardize-backend-application-boundaries` 的首个 child。它只处理 Account Recovery，不提前迁移
Authentication 或 SSO；外部 REST/OpenAPI、Redis、database 与 deployment contract 均不改变。

## Goals / Non-Goals

**Goals:**

- 用 `request-password-reset-code`、`verify-password-reset-code`、`reset-password` 三个 caller-goal use-case 表达
  Account Recovery。
- 将 active user 绑定手机号解析收敛为最小 `AccountRecoveryService`，让三个 use-case 复用同一校验语义。
- 让 open route 对 `VerificationCodeUsage.ResetPassword` 只做 human verification、protocol dispatch、context 提取与
  response adaptation。
- 从 `UserService` 移出跨 mobile verification、user password、UnitOfWork 与 audit 的 password reset workflow。
- 新建 consumer-owned ports，并增加 characterization/architecture tests 锁定行为和结构。

**Non-Goals:**

- 不迁移 password/mobile login、login failure、credential parser 或 SSO operation；这些属于后续 child。
- 不改变 `VerificationCodeUsage.Login` 或 `VerificationCodeUsage.BindPhone` 的现有 MobileService/audit path。
- 不改变 Human Verification risk policy、Cap endpoint、SMS provider、Redis key/TTL、password hashing policy 或
  Session Kernel。
- 不处理仓库中既有 repository-derived ports；本 child 只保证新 port 不继续引入该模式。

## Decisions

### 1. 三个 use-case 按调用方目标拆分，route 只 dispatch resetPassword 分支

新增以下模块：

```text
apps/api/src/use-cases/account-recovery/
  request-password-reset-code/
    request-password-reset-code.use-case.ts
    request-password-reset-code.port.ts
    request-password-reset-code.type.ts
  verify-password-reset-code/
    verify-password-reset-code.use-case.ts
    verify-password-reset-code.port.ts
    verify-password-reset-code.type.ts
  reset-password/
    reset-password.use-case.ts
    reset-password.port.ts
    reset-password.type.ts
```

`codeSend` 与 `codeVerify` 继续先完成 route-owned Human Verification/context extraction；当 usage 为
`ResetPassword` 时分别调用 request/verify use-case，当 usage 为 `Login` 或 `BindPhone` 时继续走现有 MobileService 与
request-scoped audit path。`passwordReset` 直接调用 reset use-case。Use-case 只接收已校验 primitive 与 `ApiRequestContext`，
不得接收 Hono `Context`。

替代方案是把三个 operation 合并为 `AccountRecoveryService`。未采用，因为 request、verify、reset 具有不同副作用、失败面和
依赖，合并后会重复 `OpenService` 的 omnibus 问题。另一个方案是本 child 同时抽取 login/bindPhone code workflow；未采用，
因为这会提前进入 Authentication/Mobile Binding child 的范围。

### 2. 绑定手机号解析使用最小 service，纯 helper 留在 route

新增：

```text
apps/api/src/services/account-recovery/
  account-recovery.service.ts
  account-recovery.port.ts
  account-recovery.type.ts
```

`AccountRecoveryService.resolveBoundMobile(username, phoneNumber)` 通过直接声明的 active-user lookup port 读取最小 user shape，
保留以下错误顺序与文案：缺 username、active user 不存在、未绑定 mobile、输入 mobile 与 raw/masked bound mobile 不匹配。
三个 use-case 结构化依赖该方法；service 不拥有 SMS、verification reservation、password write 或 audit。

`maskMobile` 移到 route-local presenter/helper，`requirePhoneNumber` 移到纯 validation helper，并由 handler 静态调用。
删除 `open.service.ts`、`open.port.ts` 及 `services.open` wiring，不保留同名 forwarding facade。

替代方案是让每个 use-case 重复 user lookup/matching。未采用，因为错误顺序和 masked-mobile 兼容容易漂移。把 masking 放进
AccountRecoveryService 也未采用，因为 user-info presentation 与 Account Recovery caller goal 无关。

### 3. reset-password use-case 接管完整 reset workflow

`reset-password` 不调用 `UserService.resetPassword`，而是迁移其现有 workflow：

1. 使用 `AccountRecoveryService` 解析 bound mobile。
2. 再次读取 active user，保持现有 route resolution 后 UserService live lookup 的两阶段行为。
3. mobile mismatch 时先用 root audit writer 记录 `auth.password.reset` failure，再抛出原错误。
4. reserve `VerificationCodeUsage.ResetPassword` code；reservation 为空时记录 failure audit 并抛出原错误。
5. hash 新密码，在 UnitOfWork 内执行 `setPassword` 与 success audit。
6. transaction 成功后 confirm reservation；transaction 未成功时 release reservation。confirm/audit/storage failure 按当前顺序
   向调用方传播，不新增吞错或补偿。

迁移后从 `UserService` public API 删除 `resetPassword`，保留 `setPassword`、`setMobile` 和其他 domain-aligned user
command/query。password reset 不标记 user-profile dirty 的现有行为不变。

替代方案是让 use-case 转发到 `UserService.resetPassword`。未采用，因为 verification、transaction 与 audit 的实际 ownership
仍会留在通用 User facade，无法满足 caller-goal boundary。

### 4. 新 ports 直接声明消费方法和中立 shape

每个 `*.port.ts` 直接声明调用的方法签名，不使用 `Pick<Repository>`、`Pick<ConcreteService>`，也不从
`*.repository.ts` import DTO。最小 active-user/audit/input shape 放在各自 `*.type.ts` 或现有中立 audit/context contract；
composition 通过结构兼容连接 `services.accountRecovery`、`services.mobile`、user repository、password helper、audit writer
和 mapped UnitOfWork。

`reset-password` 的 transaction port 只暴露 `userRepository.setPassword` 与 `auditLogWriter.recordAuditLog`。它可以依赖共享
`UnitOfWorkPort` abstraction，但不能知道 concrete DbClient 或 repository implementation。

替代方案是继续沿用现有 `Pick<UserService>`/`Pick<UserRepository>` 模式。未采用，因为 umbrella 明确要求新增/迁移 port 从本
child 起使用 consumer-owned contract；历史 port 的批量收敛仍留给最后一个 child。

### 5. composition 分开暴露 services 与 useCases

`createApiServices` 创建并返回 `accountRecovery` service，不再返回 `open`。`createApiUseCases` 创建三个 Account Recovery
use-case，并可在 `useCases.accountRecovery` 下按 operation 聚合；`createApiRoutes` 从 `useCases` 字段将该聚合注入
`createOpenHandlers`。该聚合只是 composition ownership，不提供新的 omnibus workflow API。

Architecture test 增加已迁移范围的 guard：`routes/open/open.service.ts` 与 `open.port.ts` 不得恢复，`routes/open` production
module 不得导出 `create*Service`，新 Account Recovery `*.port.ts` 不得 import repository module 或使用
`Pick<...Repository>`/`Pick<...Service>`。

## Risks / Trade-offs

- [Risk] resetPassword usage 与 login/bindPhone 共用 route，dispatch 迁移可能改变三种 usage 的调用或 audit。→ Mitigation：
  先用 handler characterization tests 覆盖三种 usage 的 send/verify dispatch、Human Verification 顺序与 audit payload。
- [Risk] password reset 移出 UserService 时可能改变 reservation、transaction、audit 或 failure cleanup 顺序。→ Mitigation：
  把现有 UserService reset tests 迁移并扩展为 use-case tests，显式断言 mismatch、invalid code、commit、confirm、release 与错误传播。
- [Risk] shared resolver 与 reset use-case 的两次 live lookup 看似冗余。→ Mitigation：本 child 保留现有两阶段读取以降低行为漂移；
  若未来要合并查询，必须单独证明一致性与 race 语义。
- [Risk] operation 数量增加使 composition 变长。→ Mitigation：只在 `useCases.accountRecovery` 下做 wiring 聚合，不重新提供
  单一业务 facade。
- [Trade-off] `Login`/`BindPhone` 分支仍在 route 组合 MobileService 与简单 audit。→ 接受该局部不对称以维持 child 边界，
  Authentication/Mobile Binding 的后续规划再决定其最终 facade。

## Migration Plan

1. 在 production code 修改前补齐 handler、resolver、request/verify/reset workflow 与 architecture red tests。
2. 新增 Account Recovery service、三个 use-case 与 consumer-owned ports，并迁移 password reset workflow。
3. 更新 services/useCases/routes composition，删除 `OpenService`，收窄 `UserService`。
4. 运行 Account Recovery focused tests、API architecture test、full test、typecheck 与 lint；仅允许 umbrella 记录的既有 API
   auth test import-order lint baseline，不得新增 diagnostic。
5. 验证通过后按 child Archive workflow 同步 specs 并 squash merge 回
   `feature/standardize-backend-application-boundaries`。

Rollback 只需回退该 child 的 squash commit，即可恢复 `OpenService`、UserService reset 与原 route wiring。没有 data migration、
Redis migration 或部署切换步骤。

## Open Questions

无阻断性开放问题。login/bindPhone verification workflow 的最终 application facade 归后续 child 决定，本 change 不先行固化。
