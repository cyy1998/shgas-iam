# 02 — 启动 Repo Runtimes 并封闭诊断清理路径

**What to build:** 在 migrated infra 上启动 API、Admin API、OIDC、Worker、Admin 与 SSO，渲染单一 `127.0.0.1`
Gateway routes 并完成 protocol readiness/route probes；把 startup/readiness/timeout/可捕获 signal 统一到
`collectDiagnostics -> cleanup` finally，并提供 exact descriptor 恢复入口。

**Blocked by:** 01 — 建立 Exact-project Infra 与 Migration Lifecycle

**Status:** ready-for-agent

**Repository invariant:** 在加入 seed/journeys 前先形成完整系统生命周期与安全恢复点；仍不发布 root `test:e2e`。

**Focused verification:**

- 对 runtime startup、Gateway route readiness、timeout、signal 与 cleanup failure 注入聚焦失败。
- 每个场景核对 artifacts 顺序、exit code 与 project-scoped resource inventory；运行 workspace lint/typecheck 与
  `git diff --check`。

- [ ] 清理前保存 Compose `ps`/health、bounded logs、Gateway state、migration receipt 和已有 Playwright artifacts，且输出脱敏。
- [ ] Setup failure 与 Ctrl+C 仍清理 exact project；cleanup failure 改变最终 exit code。
- [ ] 恢复只接受明确 descriptor/project，不扫描模糊前缀、不做全局 prune、不承诺 SIGKILL 后自动恢复。
- [ ] 只有 Gateway 暴露 browser-visible origin；Worker 等内部 readiness 不新增 host port。
