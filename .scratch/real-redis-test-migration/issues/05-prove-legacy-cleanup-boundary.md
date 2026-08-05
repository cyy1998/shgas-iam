# 05 — 证明 Legacy Cleanup 的精确删除边界

**What to build:** 把 legacy cleanup CLI contract 迁到独占、可销毁的 Redis logical DB/instance；以受限 ACL、non-target
sentinel 和完整 owned-key inventory 验证 dry-run/apply/verify、幂等与误删保护。

**Blocked by:** 04 — 移除 OIDC、Worker 与 API Core 的 Process Shim 依赖

**Status:** ready-for-agent

**Repository invariant:** 破坏性 contract 在 shim 删除前独立成立；普通共享测试资源永不承受固定 legacy allowlist 扫描。

**Rollback:** 若真实 cleanup contract 未完整通过，保留现有 shim 场景，不进入 Ticket 06。

**Focused verification:**

- 通过 `IAM_API_CORE_CLEANUP_TEST_REDIS_URL` 在明确标识的 disposable Redis 上运行 API Core cleanup Integration。
- 由独立 client 获取完整 before/after inventory；运行 package lint/typecheck 与 `git diff --check`。

- [ ] 测试资源不与普通 namespace-isolated Redis tests 或其他 owner 共享。
- [ ] 缺少 `IAM_API_CORE_CLEANUP_TEST_REDIS_URL` 时在连接前明确非零退出；不得回退普通 test URL 或 runtime Redis。
- [ ] ACL 禁止 `FLUSHDB`/`FLUSHALL`；sentinel 保持；before/after inventory 精确等于预期 target 删除集合。
- [ ] CLI exit code 与人类可读摘要覆盖 dry-run/apply/verify、幂等和失败路径；cleanup failure 非零退出。
