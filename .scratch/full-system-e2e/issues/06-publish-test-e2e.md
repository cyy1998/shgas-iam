# 06 — 发布完整 test:e2e 并同步 Owner 文档

**What to build:** 把已完成的 lifecycle、两条 journeys、诊断与精确清理作为唯一 root `pnpm test:e2e` 发布，并更新
E2E workspace、命令、资源与 artifact 边界对应的 Current docs。

**Blocked by:** 04 — 交付 Admin Custom SSO 真实 Journey；05 — 交付 OIDC Authorization Code + PKCE 真实 Journey

**Status:** ready-for-agent

**Repository invariant:** 公开入口只包装已经完整的 owner command；feature 可整体 revert，不影响 canonical Unit/Integration。

**Rollback:** 移除 E2E workspace、`test:e2e`、Compose/Gateway 增量与对应文档；若 Gate 已发布，先回滚 Gate。

**Focused verification:**

- 从干净环境无 retry 运行 `pnpm test:e2e` 一次，验证成功后没有本 run 资源残留。
- 运行 root orchestration 聚焦测试、`pnpm check:docs` 与 `git diff --check`。

- [ ] `test:e2e` 从第一次出现起运行 preflight、完整 lifecycle、两条 journeys、diagnostics/cleanup；cleanup failure 非零。
- [ ] Root/Turbo/workspace command 可达；缺 Docker/browser/config 时在创建资源前明确失败。
- [ ] 不新增 `test:e2e:smoke`、plugin platform、额外 journey 或 provider workflow。
- [ ] Current docs 准确描述 workspace、orchestrator、命令、资源与 artifact 边界，不宣称 Linux/CI 已验收。
