# 05 — 迁移 Admin API 与 Worker 的 Canonical Package Surfaces

**What to build:** 把 Admin API 与 Worker 的 ordinary/process 以及 Worker postgres collections 迁成完整 package-local
canonical commands，并正确排除由 Admin API process test spawn 的非测试 fixture。

**Blocked by:** 04 — 迁移 API 的完整 Canonical Package Surface

**Status:** resolved

**Repository invariant:** 两个 owner 各自完成整组 package interface；旧 smoke/postgres root 路径保留到最终 cutover。

**Focused verification:**

- 运行各 package canonical commands、process fixture 排除检查，并与 Ticket 01 子集做 equality diff。
- 运行两个 workspace 的 lint/typecheck、process 聚焦测试与 root orchestration tests。

- [x] 约 46 个 runner-owned tests 与 Ticket 01 package 子集相等；`client-cache-invalidation.composition-smoke.ts` 只作为
  fixture，不被 runner 收集。
- [x] Process assertions 锁定 readiness/not-ready/exit 等外部安全行为，不固化内部 PostgreSQL-first 顺序。
- [x] 路径迁移同步 lint、tsconfig 与 scripts；Worker postgres 保持 caller URL、随机 schema 与 fail-fast。
