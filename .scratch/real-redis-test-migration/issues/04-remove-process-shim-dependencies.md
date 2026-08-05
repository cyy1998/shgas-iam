# 04 — 移除 OIDC、Worker 与 API Core 的 Process Shim 依赖

**What to build:** OIDC process 只保留 discovery/readiness；Redis lifecycle/fail-closed 留在真实 owner contracts。Worker
PG failure/command smokes 使用不可达 Redis 并断言 not-ready/no-consumption，而非 RESP command ordering；API Core 保留
process harness，不保留 Redis server 作为 process dependency。

**Blocked by:** 03 — 收窄 API 与 Admin API Process 覆盖

**Status:** ready-for-agent

**Repository invariant:** 非破坏性 consumers 全部先脱离 shim；cleanup 专属 RESP case 留给下一票以真实 disposable Redis
替换。

**Focused verification:**

- 运行 OIDC/Worker/API Core process 与真实 Redis contracts 的最高层相关命令。
- 盘点 RESP callers，并运行三个 workspace lint/typecheck 与 `git diff --check`。

- [ ] OIDC Provider Session 的 atomic claim、generation CAS、TTL 与 lifecycle fence 继续由现有真实 Redis contract 覆盖。
- [ ] Worker assertions 锁定外部安全属性，不固化 PostgreSQL-first 顺序或 Redis command count。
- [ ] 除 cleanup CLI 专属场景外，所有 process-smoke RESP callers 已有真实 owner 替代或有证据删除。
