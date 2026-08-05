# 04 — 迁移 API 的完整 Canonical Package Surface

**What to build:** 按已验证的 Bun 形状，把 API 的 ordinary/process/composition/postgres/redis 测试迁为完整 package-local
canonical commands，并同步 lint、tsconfig、config 与旧命令兼容路径。

**Blocked by:** 03 — 用 API Core 纵切验证 Bun 与 Process Harness 迁移

**Status:** resolved

**Repository invariant:** API 新 package interface 完整，旧 root commands 仍可达相同覆盖；不提前改变默认 `test`/`verify`。

**Focused verification:**

- 对各 API canonical command 执行 list/preflight/聚焦运行，并与 Ticket 01 子集做 equality diff。
- 运行 `pnpm --filter @iam/api lint`、typecheck、process cleanup 聚焦检查与 root orchestration tests。

- [x] 约 56 个 API tests 与 Ticket 01 package 子集完全相等且互斥；composition 多资源行为不按全局优先级误归。
- [x] Process 只拥有 child/readiness/exit/tree-cleanup；Redis-dependent entry 行为保持当前 fidelity，留给真实 Redis feature。
- [x] 专用 PostgreSQL/Redis/composition 环境缺失时 package command 非零失败，不回退 runtime URL。
