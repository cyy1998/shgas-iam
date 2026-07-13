## Verification Evidence

Date: 2026-07-13
Branch: `work/migrate-api-account-recovery-workflows`
Target: `feature/standardize-backend-application-boundaries`

### Automated checks

- Account Recovery focused matrix：10 个 files、58 tests、96 assertions 全部通过。
- `pnpm --filter @iam/api test`：31 个 files、153 tests、368 assertions 全部通过。
- `pnpm --filter @iam/api typecheck`：通过。
- `pnpm --filter @iam/api lint`：本 change 的新增 diagnostic 为 0；仅剩 umbrella 已记录的
  `apps/api/src/routes/auth/__tests__/auth.handlers.test.ts:2` import-order baseline。
- API architecture：11/11 tests 通过，包含 open route service factory 与 Account Recovery consumer-owned port guards。
- `openspec validate migrate-api-account-recovery-workflows --strict --no-interactive`：通过。
- `pnpm check:openspec`：36/36 specs/active changes 与 68 个 archives integrity 通过。
- `git diff --check`：通过。

### Compatibility matrix

| Contract | Evidence | Result |
| --- | --- | --- |
| REST/OpenAPI | `open.routes.ts`、`open.schema.ts` 无 diff；handler focused tests 保持 success envelope；API typecheck 通过 | Preserved |
| `VerificationCodeUsage` | enum 无 diff；send/verify tests 分别覆盖 `login`、`bindPhone`、`resetPassword` dispatch | Preserved |
| Human Verification | `SendSmsCode` action/context 仍在 route；required error 在任何 SMS/use-case effect 前传播 | Preserved |
| SMS 与 notification | `MobileService`、SMS provider 与 Redis write 无 diff；request use-case 保持 resolve → send → audit 及失败传播 | Preserved |
| Audit | audit builders 无 diff；request/verify/reset tests 覆盖 action、outcome、masked mobile、requestId 与顺序 | Preserved |
| Mobile masking | normal、short、null presentation 与 raw/masked bound-mobile compatibility tests 通过 | Preserved |
| Redis key/TTL | `MobileService` 无 diff；focused tests 覆盖 send/check/reserve/confirm/release，仍使用既有 usage namespace 与 TTL | Preserved |
| Password transaction | reset use-case tests 覆盖 reserve、hash、UnitOfWork password + tx audit、commit 后 confirm、tx failure release、confirm failure propagation | Preserved |
| User Profile | reset transaction port 不暴露 dirty marker；UserService 其余 dirty behavior tests 通过 | Preserved |
| DB/dependencies/deployment | `packages/db`、`package.json`、`pnpm-lock.yaml` 与部署配置无 diff | Unchanged |

### Scope and rollback

- Production diff 仅涉及 API Account Recovery/open route、UserService 收口、composition wiring 与 architecture guard；没有提前
  修改 Authentication、SSO、Admin API 或 OIDC Provider。
- 回滚只需回退本 child 的 squash commit，即可恢复 `OpenService`、legacy route wiring 与 `UserService.resetPassword`；
  不需要 database、Redis 或 deployment migration。
- 未运行 live `/doc` 或真实 SMS/password reset smoke：本地运行依赖与测试账号未纳入本任务。外部 route definitions 无 diff，
  full tests、focused handler/use-case tests 与 typecheck 是替代证据；真实运行环境 smoke 仍是 residual risk。

### Archive readiness

Child artifacts、implementation、TDD evidence、focused/full verification 与 compatibility review 已一致。除预先记录的 API lint
baseline 和未执行 live environment smoke 外，本 child 已准备进入用户确认后的 Archive workflow。
