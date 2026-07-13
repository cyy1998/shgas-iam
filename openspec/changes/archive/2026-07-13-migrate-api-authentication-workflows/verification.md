## Verification Evidence

Date: 2026-07-13
Branch: `work/migrate-api-authentication-workflows`
Target: `feature/standardize-backend-application-boundaries`

### Automated checks

- Authentication focused matrix：12 个 files、82 tests、231 assertions 全部通过。
- `pnpm --filter @iam/api test`：33 个 files、164 tests、400 assertions 全部通过。
- `pnpm --filter @iam/api typecheck`：通过。
- `pnpm --filter @iam/api lint`：通过；umbrella 记录的 `auth.handlers.test.ts` import-order baseline 已关闭。
- API architecture：13/13 tests 通过，包含 auth route application factory/stateful helper 与 Authentication
  consumer-owned port guards。
- `pnpm exec openspec validate migrate-api-authentication-workflows --type change --strict`：通过。
- `pnpm check:openspec`：36/36 specs/active changes 与 69 个 archives integrity 通过。
- `git diff --check`：通过。

### Compatibility matrix

| Contract | Evidence | Result |
| --- | --- | --- |
| REST/OpenAPI | `auth.routes.ts`、`auth.type.ts`、`auth.index.ts` 无 diff；route tests 与 API typecheck 通过 | Preserved |
| Encrypted credential | Parser production module 与迁移前实现逐行一致；tests 覆盖 SM2/SM4、timestamp、nonce key/TTL、replay 和 invalid mapping | Preserved |
| Cookie/authz | handler tests 覆盖 `global_session` cookie、local cookie/header precedence、`X-User-Info` 与错误传播 | Preserved |
| Human Verification | password/mobile tests 覆盖 action、context、required error 早停、risk recording 与 lookup failure timing | Preserved |
| MAGIC_CODE | password/mobile tests 覆盖 bypass 且不记录 credential failure、不消费 verification code | Preserved |
| Failure/blacklist | LoginFailureService 与迁移前实现逐行一致；tests 覆盖 shared streak、threshold、blacklist reason/message 和 cleanup | Preserved |
| Redis key/TTL | support tests 覆盖 nonce TTL、failure 30-minute window、five-attempt threshold 与 blacklist TTL | Preserved |
| Session Kernel | use-case tests 断言 `pwd`/`sms` AMR；SSO session consistency matrix 通过 | Preserved |
| Audit | password/mobile tests 覆盖 success/failure/blacklist/lookup action、reason、request context 与顺序 | Preserved |
| DB/dependencies/deployment | DB schema、workspace dependencies、lockfile 与 deployment 配置无 diff | Unchanged |

### Scope and rollback

- Production diff 仅涉及 API Authentication login use-cases、support module location、auth handler/composition wiring 与
  architecture guard；没有修改 SSO service、Admin API、OIDC Provider、database schema 或 deployment topology。
- 回滚只需回退本 child 的 squash commit，即可恢复 `AuthService`、legacy route wiring 与 route-local support helpers；不需要
  database、Redis 或 deployment migration。
- 未运行 live `/doc`、真实 Redis 或登录 smoke：本地运行依赖与测试账号未纳入本任务。外部 route definitions 无 diff，
  full tests、focused handler/use-case/support/session tests 与 typecheck 是替代证据；真实运行环境 smoke 仍是 residual risk。
- 仓库 Verify workflow 引用的 `openspec-verify-change` skill 已从当前仓库与会话移除；本 change 使用
  `docs/workflows/verify.md` 的完整命令矩阵、strict validation 与人工 compatibility review 作为替代流程。

### Archive readiness

Child artifacts、implementation、TDD red/green evidence、focused/full verification 与 compatibility review 已一致。除未执行
live environment smoke 的既有环境风险外，本 child 已准备执行 Archive workflow。
