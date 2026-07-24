# 02 — 迁移到 Vitest 4

**What to build:** 让 Admin、SSO 和 OIDC 的测试在 Vitest 4.1.10 上保持原有测试含义，并让前端覆盖率继续由完全对齐的 V8 provider 产生，以便后续依赖升级都由目标测试 runner 验证。

**Blocked by:** 01 — 统一 pnpm 11.14 与 Turbo 2.10.

**Status:** resolved

- [x] 所有直接 `vitest` 依赖精确固定到 4.1.10，所有 `@vitest/coverage-v8` 依赖精确固定到 4.1.10，不存在 runner/provider 混版。
- [x] MSW 更新到 2.15.0，现有 request handlers、未匹配请求策略和测试生命周期保持有效。
- [x] 测试配置已按 Vitest v1-v4 迁移要求调整，不再依赖已删除或已弃用的 pool、deps、hook、mock 或 coverage 行为。
- [x] Admin、SSO 和 OIDC 全部测试通过，测试数量没有通过删除、skip、only 或弱化断言来减少。
- [x] Admin 与 SSO coverage 命令通过，include/exclude 范围与现有质量意图一致，没有为获得绿灯降低覆盖目标。
- [x] 测试执行没有未处理 rejection、泄漏 worker、mock 清理或 hook cleanup 警告；发现的行为差异已有明确兼容修正。
- [x] 受影响 workspaces 的 lint、typecheck 和 frozen-lockfile 安装通过。

## Resolution

- Final squash commit: `fbfe426807fc576ade42e554b734b1b47c572cf8`
- Reviewed implementation commit: `3243ccebb7338a6a93a634a7e9b84bc73c239a93`
- Validation:
  - `pnpm --filter @iam/admin test:coverage` on Vitest 0.34.6 — passed with 9 files / 19 tests before the upgrade.
  - `pnpm --filter @iam/sso test:coverage` on Vitest 0.34.6 — passed with 6 files / 15 tests before the upgrade.
  - `pnpm --filter @iam/sso exec vitest run src/lib/__tests__/human-verification.test.ts` — passed after migrating the constructor mock required by Vitest 4.
  - `pnpm --filter @iam/admin test` — passed on Vitest 4.1.10 with 9 files / 19 tests.
  - `pnpm --filter @iam/sso test` — passed on Vitest 4.1.10 with 6 files / 15 tests.
  - `pnpm --filter @iam/oidc-provider test` — passed on Vitest 4.1.10 with 20 files / 79 tests.
  - `pnpm --filter @iam/admin test:coverage` — passed with V8 provider 4.1.10; the existing include/exclude patterns now report covered and uncovered matching source files.
  - `pnpm --filter @iam/sso test:coverage` — passed with V8 provider 4.1.10; the existing include/exclude patterns now report covered and uncovered matching source files.
  - `pnpm --filter @iam/admin --filter @iam/sso --filter @iam/oidc-provider lint` — passed.
  - `pnpm --filter @iam/admin --filter @iam/sso --filter @iam/oidc-provider typecheck` — passed.
  - `pnpm install --frozen-lockfile` — passed with pnpm 11.14.0.
  - `pnpm test` — passed for all 14 workspace tasks with no cache hits.
  - `git diff --check` — passed.
- Review: Standards and Spec review passed with no unresolved findings. The optional Vite 8 Sass peer notice is non-blocking because Vitest's Vite serves only the test runner; frozen install, tests, coverage, lint, and typecheck all pass.
