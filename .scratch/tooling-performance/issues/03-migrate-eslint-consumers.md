# 03 — 迁移全仓 ESLint 消费端

**What to build:** 将 root、backend、frontend 和 gateway ESLint 配置迁移到唯一共享配置包，在保留 package-local ignores/rules 差异的同时消除插件版本漂移和重复配置正文。

**Blocked by:** 02

**Status:** resolved

- [x] 14 个 workspace 与根配置都从共享配置包获得对应 preset，不再各自直接组装 Antfu、typescript-eslint 或 React 插件图。
- [x] package-local ignores、规则例外、`lint`、`lint:fix`、前端 `lint:eslint`/`lint:style` 入口保持有效，前端格式化继续由 Prettier/Stylelint 负责。
- [x] 迁移前后被检查文件集合、退出码以及 error/warning 诊断键集合没有减少；任何有意规则变化均不夹带在本票。
- [x] Umi 私有旧 lint 依赖不被当前 flat-config 入口加载，仓库不存在新的 ESLint 或 typescript-eslint 版本分叉。
- [x] backend 与 frontend 各自的 config import/compose、完整 lint 和最大 RSS 均完成五轮交错复测，结果符合 ticket 02 的选型结论。
- [x] 全仓 lint/typecheck、Admin/SSO E2E、DB、role-assignment PostgreSQL、Gateway、冻结安装、workflow/docs 和 whitespace 检查通过。

## Resolution

- Ticket base: `865a3f99a2399de2860c4db6de724982ca41a2d8`
- Reviewed content head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`
- Candidate commits: `81a60b0e48736523dcb74e1a72d1ccc75e3290cd`, `1fe00e596e2c41de28a30a2d9bc37689a34c745b`
- Final squash commit: `pending`
- Validation:
  - `pnpm install --frozen-lockfile` — passed
  - `bun test scripts/__tests__/eslint-config-equivalence.test.ts` — passed
  - `node scripts/benchmark-eslint-config.mjs --rounds 5` — passed
  - `pnpm lint` — passed
  - `pnpm typecheck` — passed
  - `pnpm --filter @iam/db db:check` — passed
  - `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed
  - `pnpm --filter @iam/admin e2e` — passed
  - `pnpm --filter @iam/sso e2e` — passed
  - `pnpm gateway:apisix:validate -- --env dev:iam` — passed
  - `pnpm check:docs` — passed
  - `pnpm check:workflow -- --feature tooling-performance` — passed
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
