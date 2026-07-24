# 05 — 治理 test 与 typecheck 并发和超时预算

**What to build:** 为根 test/typecheck 命令设置与 Vitest/Bun、TS7 内部并行协调的 Turbo 并发预算，并为 OIDC 真实进程 smoke 设置有证据的定点 timeout。

**Blocked by:** 01

**Status:** resolved

- [x] 根 `typecheck` 默认使用 Turbo concurrency 3，workspace 局部 `tsc --noEmit` 入口与 TS7 默认 checker 行为保持不变。
- [x] 根 `test` 默认使用 Turbo concurrency 2，workspace 测试运行器的 worker 设置保持不变。
- [x] 不在 `turbo.json` 设置全局 concurrency；更大 runner 仍可通过 Turbo CLI 显式覆盖 test/typecheck 默认值。
- [x] OIDC entry smoke 只把进程就绪等待调整为 `15_000` 毫秒、单测总时限调整为 `25_000` 毫秒，保留子进程日志失败信息，不调整全局 Vitest/Bun timeout。
- [x] `turbo typecheck --force --concurrency=3` 连续两轮在 80 秒内完成当前 15/15 workspace。
- [x] `turbo test --force --concurrency=2` 连续两轮在 75 秒内通过当前 15/15 workspace，OIDC smoke 不再因默认资源竞争失败。
- [x] TypeScript 7 CLI 与 TypeScript 6 compatibility API 双轨解析保持不变，没有引入 project references 或额外 TypeScript incremental cache。
- [x] OIDC 聚焦测试、全仓 test/typecheck、root lint、冻结安装、workflow/docs 和 whitespace 检查通过。

## Resolution

- Ticket base: `7150e4eed80d1a29eac5a969c43d31f34b847ee0`
- Reviewed content head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`
- Candidate commits: `648f26b7703517cfc24c7df1bbce32e81ae63419`, `ab39309add7b8f40cfa23721c6daffea9c599a6a`, `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`
- Final squash commit: `pending`
- Validation:
  - `pnpm install --frozen-lockfile` — passed
  - `bun test scripts/__tests__/tooling-performance.test.ts` — passed
  - `pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/entry.smoke.test.ts` — passed
  - `pnpm exec turbo typecheck --force --concurrency=3` — passed twice within 80 seconds
  - `pnpm exec turbo test --force --concurrency=2` — passed twice within 75 seconds
  - `pnpm lint` — passed
  - `pnpm typecheck` — passed
  - `pnpm test` — passed
  - `pnpm exec tsc --version && node -e <wrapper/runtime version probe>` — passed
  - `pnpm check:docs` — passed
  - `pnpm check:workflow -- --feature tooling-performance` — passed
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
