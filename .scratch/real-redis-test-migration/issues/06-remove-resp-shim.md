# 06 — 删除 RESP Shim 并收口 Redis 文档

**What to build:** 删除 process-smoke RESP server、专属 tests/testing exports 与 Redis command-order assertions，并更新
真实 Redis fidelity、隔离、destructive cleanup 和 RESP shim 退役对应的 Current docs。

**Blocked by:** 01 — 用 API External Entry 证明 Production-owner Seed；02 — 让 OIDC External Entry 复用同一 Owner Pattern；
03 — 收窄 API 与 Admin API Process 覆盖；04 — 移除 OIDC、Worker 与 API Core 的 Process Shim 依赖；
05 — 证明 Legacy Cleanup 的精确删除边界

**Status:** ready-for-agent

**Repository invariant:** 删除只发生在全部替代覆盖与 cleanup safety 成立后；不顺带改变 canonical commands、E2E 或 Gate。

**Rollback:** 整体 revert 本 feature，在 canonical collections 下恢复 RESP shim 与原覆盖。

**Focused verification:**

- 运行所有受影响 `redis`/`process`/`composition` profiles 与 package lint/typecheck。
- 用 `rg` inventory 证明 shim/command observer 退役；运行 `pnpm check:docs` 与 `git diff --check`。

- [ ] Consumer inventory 为零，所有删除场景已有更高 fidelity 的公开行为覆盖。
- [ ] 仓库不存在 shim import/export、Lua comment dispatch、`MULTI/EXEC` 排列或 `redis.commands` assertions。
- [ ] Current docs 准确描述真实 Redis、普通隔离与 destructive cleanup；未复制其他 feature 的 contract。
- [ ] 本票没有改变 canonical commands、Full-system E2E 或 Gate。
