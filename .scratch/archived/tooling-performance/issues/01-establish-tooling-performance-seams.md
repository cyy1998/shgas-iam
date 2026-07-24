# 01 — 建立工具链性能与任务图回归接缝

**What to build:** 建立可重复、可机器读取的 ESLint 配置分段基准与工具链结构测试，为后续规则加载、Turbo root task、缓存输入和并发预算改造提供稳定反馈环。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] ESLint 基准能够分别记录 config import、config compose、完整 workspace lint、墙钟时间和最大 RSS，并支持相同 profile 交错运行至少五轮。
- [x] 基准明确区分冷启动、文件系统热缓存和 Node compile cache，不把首次缓存写入计入热启动收益。
- [x] 工具链结构测试能够读取 root scripts、`turbo.json`、workspace scripts 和 ESLint 配置依赖，并为后续 tickets 提供可扩展断言。
- [x] 当前 lint、typecheck、test 的基线命令、机器资源和复测方法被记录为测试 fixture 或基准元数据，不依赖聊天记录。
- [x] 聚焦测试、root lint/typecheck、workflow/docs 检查和 whitespace 检查通过。

## Resolution

- Ticket base: `7f438dff50aa2a42ff22d6655c93698ec378b09d`
- Reviewed content head: `69e05c4bea838c212f7821ff8baa8c58da060c85`
- Candidate commits: `f167d84bb0ad5488f67d3347623b526f8577292b`, `07fa964c302d822d0d632dea4ab331c183cdb57b`, `69e05c4bea838c212f7821ff8baa8c58da060c85`
- Final squash commit: `a5f1355ea4d0f164417e5bab32367cf6d7dadf16`
- Validation:
  - `bun test scripts/__tests__/tooling-performance.test.ts` — passed
  - `node scripts/benchmark-eslint-config.mjs --profile current-backend --rounds 5 --compile-cache-dir <temp>` — passed
  - `pnpm lint` — passed
  - `pnpm typecheck` — passed
  - `pnpm check:docs` — passed
  - `pnpm check:workflow -- --feature tooling-performance` — passed
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
