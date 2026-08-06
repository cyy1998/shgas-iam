# 01 — 发布完整 Provider-neutral Gate Interface

**What to build:** 在同一 root orchestration change 中发布
`verify:ci = verify -> test:integration` 与 `verify:release = verify:ci -> test:e2e`；两者严格 fail fast，并原样传播
owner resource、diagnostics 与 cleanup failure。

**Blocked by:** Feature [real-redis-test-migration](../../real-redis-test-migration/spec.md) 完成；Feature
[full-system-e2e](../../full-system-e2e/spec.md) 完成

**Status:** resolved

**Repository invariant:** 全部依赖能力在本 feature 开始前已完整；两个浅 Gate compositions 一次发布，不形成 placeholder
或重复修改同一 root orchestration seam。

**Rollback:** 同时移除 `verify:ci` 与 `verify:release`，保留全部 owner commands。

**Focused verification:**

- Root orchestration 聚焦测试覆盖两个 Gate 的 success、各阶段 failure、E2E 未启动与 cleanup failure propagation。
- 用受控 child commands 验证完整顺序/exit propagation；运行受影响 root tooling lint/typecheck 与 `git diff --check`。

- [x] 两个命令只组合完整 owner commands，不读取资源变量、不复制 preflight/descriptor/diagnostics/cleanup，也不解释
  profile failures。
- [x] `verify` 失败时不启动 Integration；`verify:ci` 失败时不创建 E2E project；`test:e2e`/cleanup failure 保留 owner
  诊断并顶层非零。
- [x] 顺序、fail-fast、signal/exit code propagation 由同一 root orchestration 外部行为覆盖。
- [x] 命名只表达 provider-neutral 目的，不声明真实 CI 已启用。
- [x] 不引入 retry、`test:e2e:smoke`、resource detector、evidence framework 或 provider workflow。
