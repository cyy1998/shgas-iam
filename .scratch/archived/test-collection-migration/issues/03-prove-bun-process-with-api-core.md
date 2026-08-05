# 03 — 用 API Core 纵切验证 Bun 与 Process Harness 迁移

**What to build:** 以 API Core 为 Bun tracer bullet，迁移 ordinary/process/redis collections 与 package-local canonical
commands；保留共享 process harness，同时把 harness/fake 自身的普通 tests 与真正 child-process tests 分开。

**Blocked by:** 02 — 用 OIDC 纵切验证 Vitest 多 Profile 迁移

**Status:** resolved

**Repository invariant:** API Core 的全部新 package commands 完整可用；RESP shim 仍服务尚未迁移的 consumers。

**Focused verification:**

- 运行 package canonical commands、共享 harness 最高层测试，并与 Ticket 01 子集做 equality diff。
- 运行 `pnpm --filter @iam/api-core lint`、typecheck 与 root orchestration tests。

- [x] 35 个 ordinary、3 个 process、4 个 redis 文件按 Ticket 01 mapping 唯一收集；Bun 窄目录 adapter 不复制完整发现算法。
- [x] `process-smoke-harness` 的普通 contract tests 不因文件名或 helper 语义误归真实 process profile。
- [x] 新 tasks 保持 transit dependency；resource lanes 保持 `cache:false` 与专用 URL fail-fast。
