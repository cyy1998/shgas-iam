# 03 — 收窄 API 与 Admin API Process 覆盖

**What to build:** API process 只保留 entry/env/docs/readiness，把 Redis-dependent HTTP/cache/legacy 行为迁入真实
`redis`/`composition`；Admin API process 只保留 `/admin/doc` 等进程行为，client-cache invalidation 通过 production
cache owner 进入真实 Redis。

**Blocked by:** 02 — 让 OIDC External Entry 复用同一 Owner Pattern

**Status:** ready-for-agent

**Repository invariant:** 每个旧 case 只在对应真实行为通过后移除；共享 process harness 保留，RESP shim 尚未删除。

**Focused verification:**

- 运行 API/Admin API 的 process 与 redis/composition 聚焦命令，验证公开 HTTP 行为。
- 盘点 RESP imports/`redis.commands` assertions，并运行两个 workspace lint/typecheck 与 `git diff --check`。

- [ ] Process profile 不再承载 API/Admin API 的 Redis 语义或 command-log assertions。
- [ ] Admin client cache 使用 production `createCustomSsoClientRuntimeReader`/mutation seam，不复制 cache key/version。
- [ ] 真实 Redis scenarios 保留 HTTP/entry observable coverage；process scenarios 继续验证 child/readiness/tree cleanup。
