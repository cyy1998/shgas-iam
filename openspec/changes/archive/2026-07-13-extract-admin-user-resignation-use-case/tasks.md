## 1. Characterization Baseline 与 TDD Red Signal

- [x] 1.1 运行现有 EmploymentService、Admin employment REST/tRPC adapter、Admin API architecture focused tests，并记录 child 修改前
  Admin API full test、typecheck 和 lint 基线。
  - 证据：2026-07-13 focused 4 files `23 pass / 0 fail`；Admin full test `98 pass / 0 fail`；typecheck 通过；lint 仅有计划内
    `admin-api-adapter.test.ts` 4 条 baseline（1 条 import order、3 条 type-only fixture unused diagnostic）。
- [x] 1.2 与用户确认 TDD public seams：`createResignUserUseCase().execute`、`createEmploymentAdapter` 的独立 `resignUser` facade、
  `createAdminApiUseCases` aggregate 与 Admin resignation architecture guards。
  - 证据：2026-07-13 用户确认按 proposal/design 中的四个 public seams 进入 TDD 实施。
- [x] 1.3 扩展 resignation characterization tests，覆盖 REST `{ username }` input、tRPC `resignUser` key、`true` result、normalized
  audit context、unknown-user error 与 adapter failure propagation。
  - 证据：employment adapter tests `4 pass / 0 fail`，同时覆盖 REST success envelope、tRPC key/result、REST 原错传播、tRPC normalized
    `NOT_FOUND` 与非离职 operation 继续走 `EmploymentService`。
- [x] 1.4 扩展 transaction characterization tests，覆盖 user lookup、active employment end、user disable、audit payload、
  `EmploymentUpdated`/`UserUpdated` order、afterCommit/requestId/traceId 与任一步失败的 no-later-side-effect/rollback semantics。
  - 证据：resign-user use-case tests 覆盖完整顺序、精确 audit/dirty input、observability、missing user 和 employment/user/audit/dirty
    四阶段失败传播，`4 pass / 0 fail`。
- [x] 1.5 为 `EmploymentService.resignUser`、service-owned resignation wiring、use-case composition ownership 与新 port ownership 增加
  architecture red tests，并用临时 sentinel 确认只触发预期规则。
  - 证据：ownership RED 精确报告 4 条旧结构违规；迁移后 architecture `10 pass / 0 fail`。临时 `Pick<...>` sentinel 仅触发 port
    ownership guard（`9 pass / 1 fail`），删除后恢复全绿。

## 2. Resign User Application Use-Case

- [x] 2.1 先为 `createResignUserUseCase` 编写 missing-module failing tests，再实现已存在用户的完整 transaction 顺序和 `true` result。
  - 证据：首次 RED 为 `Cannot find module '../resign-user.use-case'`（`0 pass / 1 fail`）；最小实现后成功顺序与 `true` result 转绿。
- [x] 2.2 先补 unknown-user 与 storage/audit/dirty failure tests，再实现既有 `UserNotFoundError`、失败传播、atomicity 与
  `adminAuditTransactionOptions` observability semantics。
  - 证据：missing user 抛出原 `UserNotFoundError("用户不存在")` 且无副作用；四个 transaction stage 的失败均原样传播且不执行后续步骤；
    requestId/traceId 进入 transaction observability。
- [x] 2.3 实现 `resign-user.type.ts` 与 consumer-owned `resign-user.port.ts`，直接声明最小 user/employment/audit/dirty/UoW contract，
  不使用 `Pick<...Repository>`、`Pick<...Service>` 或 concrete repository/service/route/adapter import。
  - 证据：port 直接声明五类消费行为和中立 shape；architecture guard 与 sentinel 验证禁止 `Pick` 及 provider module import。
- [x] 2.4 确认 use-case 只接收 `{ username }` 和 normalized `AdminAuditContext`，不接收 Hono/tRPC context，不新增 session revocation、
  cleanup、notification 或 fallback behavior。
  - 证据：production use-case/composition/adapter scope review 无 Hono/tRPC、session revoke、cleanup、notification 或 fallback workflow。

## 3. Admin Composition、Adapter 与 EmploymentService 收口

- [x] 3.1 新增 `composition/use-cases`，通过 `mapUnitOfWork` 创建 `useCases.employment.resignUser`，并保留 transaction afterCommit
  与 observability options。
  - 证据：`composition/use-cases/index.ts` 结构化映射 tx repositories、audit writer、dirty marker；`mapUnitOfWork` 继续透传 afterCommit。
- [x] 3.2 更新 Admin composition root 和 route composition，通过独立 `useCases` field 注入 resignation facade，不把 use-case 并入
  `services` aggregate。
  - 证据：composition root 暴露独立 `useCases` field，routes 从 `useCases.employment.resignUser` 注入 adapter；services aggregate 未新增 use-case。
- [x] 3.3 更新 employment adapter 让 REST/tRPC resignation operation 调用 `resignUser.execute`，其余 operations 继续调用
  `EmploymentService`，并保持 route/schema/index/trpc public contract 无行为性 diff。
  - 证据：adapter REST/tRPC characterization `4 pass / 0 fail`，route/schema/index/trpc 文件无行为性修改。
- [x] 3.4 从 `EmploymentService`、返回类型、service tests 和 `AdminEmploymentTransactionPorts` 移除 resignation ownership 及仅离职使用的
  transaction methods，不改其它 Employment lifecycle behavior。
  - 证据：删除 service `resignUser` 与旧 test ownership；transaction port 移除 `endActiveEmploymentsByUserId`/`updateUserByUsername`，
    EmploymentService 其余 9 个 tests 全绿。
- [x] 3.5 完成 Admin API architecture guards，覆盖 EmploymentService regression、adapter service binding、use-case composition location、
  service-to-use-case reverse dependency 和 resignation port ownership，并确认 red tests 转绿。
  - 证据：Admin architecture `10 pass / 0 fail`，含既有 service-to-use-case reverse-dependency guard 与两条新 resignation guards。

## 4. Admin Lint Baseline 收口

- [x] 4.1 修复 umbrella 已记录的 `admin-api-adapter.test.ts` import-order 与 compile-time type fixture lint diagnostics，保留原有类型契约断言，
  不夹带其它历史 lint 修复。
  - 证据：type imports 按规则排序，并以 `void` value-use 保留三个 compile-time route/handler assertions；未改变 runtime assertions。
- [x] 4.2 运行 Admin API lint 并确认既有 4 条 baseline diagnostics 已关闭且没有新增 diagnostic。
  - 证据：`pnpm --filter @iam/admin-api lint` exit 0；修改前 4 条 baseline 全部关闭。

## 5. Verification 与 Archive 准备

- [x] 5.1 运行 resign-user use-case、EmploymentService、employment adapter REST/tRPC 与 Admin API architecture focused tests。
  - 证据：最终 focused 4 files `27 pass / 0 fail`、`72 expect()`。
- [x] 5.2 运行 `pnpm --filter @iam/admin-api test` 与 `pnpm --filter @iam/admin-api typecheck`，确认完整测试和类型检查通过。
  - 证据：Admin API full test `107 pass / 0 fail`、`316 expect()`；Admin API typecheck 通过；作为 tRPC 消费方的 Admin frontend
    typecheck 也通过。
- [x] 5.3 运行 `pnpm --filter @iam/admin-api lint`，确认 Admin API lint 全绿。
  - 证据：最终 `pnpm --filter @iam/admin-api lint` exit 0。
- [x] 5.4 运行 child strict validation、`pnpm check:openspec` 与 `git diff --check`，检查 requirements、scenarios、tasks、active changes
  与 archive integrity。
  - 证据：child strict valid；`pnpm check:openspec` 36/36 passed、archive integrity 71 passed；仅报告既有精确 waiver
    `2026-05-27-normalize-employment-organization-context` 的 2 个 incomplete tasks；`git diff --check` 通过。
- [x] 5.5 人工复核 REST/OpenAPI、tRPC、transaction、employment end、user disable、audit、profile dirty、afterCommit、session、rollback
  compatibility matrix，并记录 child archive readiness 与无法执行的 smoke 前提。
  - 证据：REST route/schema/index 和 tRPC public key 无行为性 diff；所有 transaction/side-effect/session 项由 focused/full tests 覆盖。
    本机 `30001`/Docker `30012` 的 `/admin/doc`、`/rpc/doc` 均未运行（HTTP `000`），因此未执行 live interface smoke；child 在静态、
    unit/integration、type 与 architecture 层面 archive-ready。
