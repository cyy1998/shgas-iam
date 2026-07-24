# 04 — 连续验收并固化测试架构

**What to build:** 在 Windows 本地完成无重试的连续 smoke 与完整 verify 验收，核对无残留进程，并把实际命令、workflow gate、平台状态和 backend smoke adoption 原子写入 Current 文档。

**Blocked by:** 02, 03

**Status:** resolved

- [x] OIDC `test:smoke` 在禁用任务缓存且不重试失败轮次的前提下连续 20 次通过；每轮结果可追溯。
- [x] 正式 `pnpm verify` 连续 3 次按 static、typecheck、test、smoke、build 顺序通过；任一失败后从连续样本 1 重新计数。
- [x] 每轮结束后都没有由本次 harness 启动的残留 OIDC 进程、监听端口或临时资源；检查不得误杀其他开发者 Node 进程。
- [x] 连续验收不依赖 required-gate retry、继续放宽已声明的全局 timeout、永久 skip 或未记录 waiver。
- [x] `docs/development/commands.md` 准确记录 `test`、`test:smoke`、`verify`、外部资源附加命令和本地使用方式。
- [x] `docs/agents/workflow.md` 把 feature/merge candidate 的环境无关基线更新为 `pnpm verify`，并继续按改动类型追加 PostgreSQL、E2E 与 Gateway 检查。
- [x] 测试架构文档从目标状态提升为 Current，文档索引同步更新；实现与命令未覆盖的能力不得写成已完成。
- [x] OIDC adoption 标为完成；API/Admin API 只标记进程内测试已正确分类；Worker 和其他真实 process smoke 保持明确 pending。
- [x] Linux 与 CI 验收明确保持 pending；正式 scripts 虽跨平台，但不宣称未经实际 runner 验证的平台状态。
- [x] 冻结安装、完整 feature 验证矩阵、Admin/SSO E2E、20/3 连续验收、workflow/docs 和 whitespace 检查全部通过。

## Resolution

- Ticket base: `4f10dc40c43f698382534cf399d6a3cd4cfaa500`
- Reviewed content head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`
- Candidate commits: `470204c053dbcf6f60855ba1eaa3089049ad57ca`, `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`
- Final squash commit: `pending`
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
