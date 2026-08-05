# 09 — 用 Root Commands 与永久 Guard 封闭 Collections

**What to build:** 在全部 package tasks 完整后发布 root `test:unit`（含 4 个 root tooling tests）、六个 profile commands
与带一次性资源预检的 `test:integration`，并实现 `pnpm check:test-collection` 证明唯一收集、命名和 Turbo 可达性。

**Blocked by:** 02 — 用 OIDC 纵切验证 Vitest 多 Profile 迁移；03 — 用 API Core 纵切验证 Bun 与 Process Harness 迁移；
04 — 迁移 API 的完整 Canonical Package Surface；05 — 迁移 Admin API 与 Worker 的 Canonical Package Surfaces；
06 — 迁移 Database 与 Read-model 资源 Owners；07 — 迁移 Pure Shared Packages 与 Gateway Unit Surfaces；
08 — 迁移 Frontend Unit 与 Mock-browser Surfaces

**Status:** resolved

**Repository invariant:** Root commands 只组合已经完整的 package surfaces；Guard 面向当前目标树，不需要永久兼容表或
live exception。

**Focused verification:**

- 运行 Guard 外部 interface 的 allow/violation fixtures、`pnpm check:test-collection` 与全部 root lists/dry-runs。
- 验证 `test:integration` preflight/ordering/failure propagation 与 `scripts/__tests__/test-orchestration.test.ts`。
- 在 Windows 本地无 retry 连续运行 `pnpm test:integration:process` 20/20，并逐轮核对 owner process、port 与临时目录残留。

- [x] Guard 只观察路径/命名、package task、runner list 与 Turbo dry-run，不分析断言、资源使用或 AST/data flow。
- [x] 漏收、重收、归属不一致、task 不可达或 adapter 失败均给出可定位诊断并非零退出。
- [x] Guard 认可 Unit 窄 owner-local roots、六个 sibling profile paths 与 `e2e/system`；browser 不形成独立 layer。
- [x] `test:integration` 在启动任何 profile 前列出全部缺失资源，包括
  `IAM_API_CORE_CLEANUP_TEST_REDIS_URL`；Turbo strict env 透传 owner URLs，resource tasks 保持 `cache:false`。
- [x] Windows 本地 `test:integration:process` 连续 20/20 通过，无 timeout、retry 或 owner process/port/temp 残留；
  Linux/CI 仍明确为 `pending`。
- [x] Root tooling tests 有明确 Unit owner；`subject-projection:rehearsal` 不属于 Guard candidate 或任何 profile。
