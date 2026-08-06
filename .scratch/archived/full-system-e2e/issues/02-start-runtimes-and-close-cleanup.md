# 02 — 启动 Repo Runtimes 并封闭诊断清理路径

**What to build:** 在 migrated infra 上启动 API、Admin API、OIDC、Worker、Admin 与 SSO，渲染单一 `127.0.0.1`
Gateway routes 并完成 protocol readiness/route probes；把 startup/readiness/timeout/可捕获 signal 统一到
`collectDiagnostics -> cleanup` finally，并提供 exact descriptor 恢复入口。

**Blocked by:** 01 — 建立 Exact-project Infra 与 Migration Lifecycle

**Status:** resolved

**Repository invariant:** 在加入 seed/journeys 前先形成完整系统生命周期与安全恢复点；仍不发布 root `test:e2e`。

本 ticket 的 Compose/runtime 只使用 feature 固定或 run-generated synthetic data/credentials，不接受 production endpoint、
production credential 或真实 PII。临时 artifacts 可以包含 synthetic token/password/key；通过 run-scoped directory、retention 与
访问控制治理，不做内容脱敏。

**Focused verification:**

- 对 runtime startup、Gateway route readiness、timeout、signal 与 cleanup failure 注入聚焦失败。
- 每个场景核对 artifacts 顺序、exit code、best-effort cleanup 尝试与 exact recovery；signal/timeout/cleanup failure 允许残留；运行 workspace lint/typecheck 与
  `git diff --check`。

- [x] 清理前尽量保存 Compose `ps`/health、bounded raw logs、Gateway state、migration receipt 和 raw Playwright artifacts；raw 文件受路径、symlink、文件数与字节上限保护但不做内容脱敏或删除。
- [x] Setup failure、timeout 与 Ctrl+C 都尝试一次 best-effort child/tree termination 和 exact-project cleanup；cleanup failure 改变最终 exit code并保留 descriptor，允许残留。
- [x] 恢复只接受明确 descriptor/project，不扫描模糊前缀、不做全局 prune、不承诺 SIGKILL 后自动恢复。
- [x] 只有 Gateway 暴露 browser-visible origin；Worker 等内部 readiness 不新增 host port。
