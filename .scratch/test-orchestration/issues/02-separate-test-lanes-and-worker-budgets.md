# 02 — 分离测试通道并固定运行器预算

**What to build:** 在各受影响 package 中建立互斥的普通与 smoke 收集规则，固定 Vitest/Bun 的保守并发预算，并把历史上按名称误分类的进程内 OpenAPI 测试留在普通通道。

**Blocked by:** 01

**Status:** resolved

- [x] `@iam/oidc-provider` 的普通 `test` 排除 `*.smoke.test.ts`，package-local `test:smoke` 只收集 smoke 文件且使用单 worker。
- [x] 根 `pnpm test` 不收集 OIDC entry smoke，根 `pnpm test:smoke` 不收集 OIDC 普通测试；结构测试和真实 runner collection 同时证明互斥。
- [x] Admin、SSO 与 OIDC 的普通 Vitest worker 上限为可用 CPU 的 25%，普通 test timeout 统一为 10 秒。
- [x] 所有使用 Bun 的 workspace 普通测试并发不超过 2，并使用当前 Bun 版本实际支持的参数；PostgreSQL 专用通道保持单 worker。
- [x] `apps/api` 与 `apps/admin-api` 的进程内 OpenAPI HTTP 测试改为普通 `*.test.ts` 名称，行为断言保持不变。
- [x] 只有启动独立进程、监听端口或验证真实 runtime entry 的测试可以使用 `*.smoke.test.ts`；纯内存 integration 留在普通通道。
- [x] 普通 `test` 保持可缓存；smoke、PostgreSQL、E2E 和其他外部资源任务明确不缓存，coverage 不污染普通 test 输出。
- [x] Runner preset 如被共享，必须由 package 显式引用；不得通过 root Vitest project 隐式收集跨 workspace 文件。
- [x] 所有正式 package scripts 跨 Windows/Linux，不依赖 Bash、PowerShell 或 `cmd.exe` 专有语法。
- [x] 冻结安装、结构测试、受影响 workspace 的普通测试/lint/typecheck、OIDC smoke、完整 `pnpm test`/`pnpm verify`、Admin/SSO E2E、workflow/docs 和 whitespace 检查通过。

## Comments

- 2026-07-24 — 首轮分流后的根普通测试不再执行 OIDC smoke，但 Admin hermetic UI integration 在 package 内并行时稳定越过 5 秒；
  维护者据诊断证据明确要求所有 package-local Vitest 普通测试统一使用 10 秒，Bun 与 process smoke 预算不变。
- 2026-07-24 — 双轴评审发现首个候选只约束三个 Bun app、三个监听端口的 OIDC tests 仍在 ordinary lane，且 Turbo 未声明
  `test:postgres`/`test:coverage` 语义；修复范围按原 feature spec 扩展到所有 Bun workspace，并把真实端口测试迁入 smoke。

## Resolution

- Ticket base: `7c5c82cdcae2bdb2aee08542144d3475387c1760`
- Reviewed content head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`
- Candidate commits: `8b78564f9dbb2fc71cd7736f539bad372085b288`, `d9ba45886d452deff36f8e322fa5d522e471ae1b`
- Final squash commit: `461c711f8c610798795e96ecff74d34bfb7a239c`
- Validation:
  - `pnpm install --frozen-lockfile` — passed
  - `bun test scripts/__tests__/test-orchestration.test.ts` — passed
  - `pnpm lint` — passed
  - `pnpm typecheck` — passed
  - `pnpm test` — passed
  - `pnpm test:smoke` — passed
  - `pnpm build` — passed
  - `pnpm verify` — passed
  - `pnpm --filter @iam/admin e2e` — passed
  - `pnpm --filter @iam/sso e2e` — passed
  - `pnpm check:docs` — passed
  - `pnpm check:workflow -- --feature test-orchestration` — passed
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.

## Reopen 2026-07-24

- Reason: 最终 feature 评审发现本票实际范围漏记 docs、database、gateway 分类及对应专项 gate，且结构测试未锁定 E2E 禁用缓存。
- Previous reviewed content head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`
- Remediation base: `7c1669fd18912ede7bd1cbf31d3bd019f7da000c`
- Status transition: resolved -> claimed

## Resolution 2026-07-24

- Ticket base: `7c1669fd18912ede7bd1cbf31d3bd019f7da000c`
- Reviewed content head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`
- Candidate commits: `b79f83ae20cebccdf511425d03bfff6a6a68953f`
- Final squash commit: `461c711f8c610798795e96ecff74d34bfb7a239c`
- Validation:
  - `pnpm install --frozen-lockfile` — passed
  - `bun test scripts/__tests__/test-orchestration.test.ts` — passed
  - `pnpm lint` — passed
  - `pnpm typecheck` — passed
  - `pnpm test` — passed
  - `pnpm test:smoke` — passed
  - `pnpm build` — passed
  - `pnpm verify` — passed
  - `pnpm --filter @iam/db db:check` — passed
  - `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed
  - `pnpm --filter @iam/admin e2e` — passed
  - `pnpm --filter @iam/sso e2e` — passed
  - `pnpm gateway:apisix:validate -- --env dev:iam` — passed
  - `pnpm check:docs` — passed
  - `pnpm check:workflow -- --feature test-orchestration` — passed
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
