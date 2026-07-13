## Verification Summary

- 日期：2026-07-13
- Change：`extract-admin-user-resignation-use-case`
- 结果：实现与本地验证完成，21/21 tasks complete，具备 Archive 前置条件。
- Verify skill：仓库 workflow 指定的 `$openspec-verify-change` 在当前可用 skills 中不存在；本次按
  `docs/workflows/verify.md` 执行等价验证矩阵。

## TDD Evidence

- 用户确认 seams：`createResignUserUseCase().execute`、employment adapter 的独立 `resignUser` facade、
  `createAdminApiUseCases` aggregate 与 Admin resignation architecture guards。
- Use-case 首次 RED 为 missing module；最小成功 transaction 转绿后，补齐 missing-user、audit/dirty context 与四阶段失败传播。
- Employment adapter 首次 RED 证明旧 wiring 未调用独立 facade；改为 `resignUser.execute` 后 REST/tRPC characterization 转绿。
- Architecture ownership RED 精确报告四条旧结构违规；临时 `Pick<...>` sentinel 仅触发 consumer-owned port guard，删除后
  architecture 10/10 tests 全绿。

## Commands And Results

- Focused use-case、EmploymentService、employment adapter、architecture：4 files、27 tests、72 assertions 全部通过。
- `pnpm --filter @iam/admin-api test`：23 files、107 tests、316 assertions 全部通过。
- `pnpm --filter @iam/admin-api typecheck`：通过。
- `pnpm --filter @iam/admin-api lint`：通过，并关闭修改前计划内 4 条 lint baseline。
- `pnpm --filter @iam/admin typecheck`：通过，证明 Admin tRPC 消费契约未漂移。
- `openspec validate extract-admin-user-resignation-use-case --strict --no-interactive`：通过。
- `pnpm check:openspec`：36/36 items 通过；71 archives integrity 通过。历史 waiver 仍为
  `2026-05-27-normalize-employment-organization-context` 的 2 个 incomplete tasks。
- `git diff --check`：通过。

## Compatibility Review

- Employment REST route/schema/index 与 tRPC public key 无行为性 diff；`/users/:username/resign`、`resignUser`、`{ username }`、
  success `true` 与 error mapping 保持不变。
- Use-case 在同一 UnitOfWork 内保持 user lookup、active employment end、user disable、audit、profile dirty 的既有顺序。
- Audit action/target/details、`EmploymentUpdated`/`UserUpdated` dirty reason 顺序、afterCommit、requestId/traceId 和 transaction
  observability 保持不变。
- `EmploymentService` 继续拥有 create、update、status、delete、transfer 与 set-primary operations；离职改由独立 use-case 拥有。
- 未新增 session revocation、cleanup、notification 或 fallback；database schema、Redis keyspace、workspace dependencies 与
  deployment topology 未修改。

## Residual Risk And Rollback

- 未运行 live `/admin/doc`、`/rpc/doc` 或 resignation endpoint smoke：本机 `30001` 与 Docker `30012` Admin API 均未运行。
  本地 adapter/use-case/architecture、Admin API full suite 与 Admin frontend typecheck 已覆盖主要风险。
- Rollback 为回退本 child 的最终 squash commit，恢复 `EmploymentService.resignUser` 与旧 adapter wiring；无数据、Redis 或
  dependency migration。
