# 06 — 锁定工具链实践并完成全仓验证

**What to build:** 将最终 lint 缓存模型、ESLint 配置加载策略、test/typecheck 并发预算和复测方法写入 Current 文档与结构 guard，并完成 feature 级性能和正确性验证。

**Blocked by:** 04, 05

**Status:** resolved

- [x] Current 开发文档说明 package-level lint、Turbo root task、共享 ESLint 配置、冷/热缓存测量、命令级并发覆盖和 Remote Cache 的可选边界。
- [x] 自动化结构检查在 root lint 绕过 Turbo、共享配置未进入依赖图、默认 test/typecheck 并发预算被移除或全局 timeout 被放宽时失败。
- [x] warm lint、冷 typecheck、冷 test 和 ESLint config load 的最终数据按 spec 的重复轮数与预算记录，并与原始基线对比。
- [x] TypeScript 7 CLI、TypeScript 6 compatibility API、ESLint/typescript-eslint 唯一版本和 Umi 私有旧 lint 边界完成最终审计。
- [x] frozen install、lint、typecheck、test、build、workflow/docs、Admin/SSO E2E、DB、role-assignment PostgreSQL、Gateway 和 whitespace 检查全部通过或具有维护者批准的明确 waiver。
- [x] Standards 与 Spec 最终双轴评审无未解决 finding，所有验证和评审证据绑定同一 content HEAD。

## Resolution

- Ticket base: `10e5cc80f78cfbe582151048adfd65e487223e7b`
- Reviewed content head: `336585da98878c35c55478074b62a0f4b9f39d75`
- Candidate commits: `6503f4f8de86c93be3f8adcba151f238158f5358`, `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`, `2107e13d03f165219046b777afe3a4d5055ec177`, `336585da98878c35c55478074b62a0f4b9f39d75`
- Final squash commit: `pending`
- Validation:
  - `pnpm install --frozen-lockfile` — passed
  - `bun test scripts/__tests__/tooling-performance.test.ts` — passed
  - `bun test scripts/__tests__/eslint-config-equivalence.test.ts` — passed
  - `node scripts/benchmark-eslint-config.mjs --rounds 5` — passed
  - `timeout 10s pnpm lint` — passed three consecutive times after preheating
  - `pnpm exec turbo typecheck --force --concurrency=3` — passed twice within 80 seconds
  - `pnpm exec turbo test --force --concurrency=2` — passed twice within 75 seconds
  - `pnpm --filter @iam/sso test` — passed
  - `pnpm --filter @iam/sso lint` — passed
  - `pnpm --filter @iam/sso typecheck` — passed
  - `pnpm --filter @iam/sso e2e` — passed
  - `pnpm lint` — passed
  - `pnpm typecheck` — passed
  - `pnpm test` — passed
  - `pnpm build` — passed
  - `pnpm --filter @iam/db db:check` — passed
  - `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed
  - `pnpm --filter @iam/admin e2e` — passed
  - `pnpm gateway:apisix:validate -- --env dev:iam` — passed
  - `pnpm check:docs` — passed
  - `pnpm check:workflow` — passed
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.

## Reopen 2026-07-23

- Reason: 最终 feature 双轴评审发现验证工具会吞掉 ESLint lint 失败且混合结构审计职责，共享配置 workspace 缺少 `lint:fix`，性能基准遗漏首文件 lint 分段，冷 test/typecheck 证据遗漏 CPU 时间。
- Previous reviewed content head: `336585da98878c35c55478074b62a0f4b9f39d75`
- Remediation base: `63ed5274e2bdd20c59dd77e1e94950bd9de3de98`
- Status transition: resolved -> claimed

## Resolution 2026-07-24

- Ticket base: `63ed5274e2bdd20c59dd77e1e94950bd9de3de98`
- Reviewed content head: `232f2de75043fb0985cbadff17f73213c6282c5c`
- Candidate commits: `232f2de75043fb0985cbadff17f73213c6282c5c`
- Final squash commit: `pending`
- Validation:
  - `pnpm install --frozen-lockfile` — passed，16 个 workspace 且 lockfile 无变化
  - `bun test scripts/__tests__/tooling-performance.test.ts` — passed，10/10 测试、72 个断言
  - `node_bin=$(command -v node); env PATH=/usr/bin:/bin "$node_bin" scripts/benchmark-eslint-config.mjs --profile current-backend --rounds 5` — passed，故障注入确认内层 lint 退出 127、外层 benchmark 退出 1
  - `bun test scripts/__tests__/eslint-config-equivalence.test.ts` — passed，2/2 测试、48 个断言
  - `pnpm --filter @iam/eslint-config test` — passed，4/4 测试
  - `pnpm --filter @iam/eslint-config lint` — passed
  - `pnpm --filter @iam/eslint-config typecheck` — passed
  - `pnpm exec turbo lint:fix lint:fix:root --dry=json` — passed，15 个 workspace 均有真实 `lint:fix` 入口
  - `node scripts/benchmark-eslint-config.mjs --rounds 5` — passed，backend/frontend 各五轮 config、首文件与完整 lint
  - `timeout 10s pnpm lint` — passed，预热后连续三轮 1.00/1.00/1.20 秒
  - `pnpm exec turbo typecheck --force --concurrency=3` — passed，连续两轮 46.78/72.12 秒并记录 wall/user/system CPU/RSS
  - `pnpm exec turbo test --force --concurrency=2` — passed，连续两轮 50.93/53.60 秒并记录 wall/user/system CPU/RSS
  - `pnpm --filter @iam/sso test` — passed，19/19 测试
  - `pnpm --filter @iam/sso lint` — passed
  - `pnpm --filter @iam/sso typecheck` — passed
  - `pnpm --filter @iam/sso e2e` — passed，3/3
  - `pnpm lint` — passed，16/16 tasks
  - `pnpm typecheck` — passed，15/15 workspace
  - `pnpm test` — passed，15/15 workspace
  - `pnpm build` — passed，2/2
  - `pnpm --filter @iam/db db:check` — passed
  - `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed，45/45
  - `pnpm --filter @iam/admin e2e` — passed，2/2
  - `pnpm gateway:apisix:validate -- --env dev:iam` — passed，12 条 routes
  - `pnpm check:docs` — passed，28 个 Current 文档索引
  - `pnpm check:workflow` — passed，7 个 v2 feature 与 4 个 legacy feature
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
- Status transition: claimed -> resolved
