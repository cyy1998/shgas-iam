# 01 — 用 API External Entry 证明 Production-owner Seed

**What to build:** 把 API external entry 作为第一个 composition tracer bullet：删除三个 RESP seed helpers 与 raw
`mset`，通过 production Session Kernel、Subject Access Bootstrap、Subject Facts/Custom SSO owners 建立状态，再从真实
API HTTP 行为与独立 Redis observer 验证结果。

**Blocked by:** Feature [test-collection-migration](../../test-collection-migration/spec.md) 完成

**Status:** ready-for-agent

**Repository invariant:** 该 consumer 的真实 entry coverage 先通过，再移除它的 shim import；shim 本体仍服务其他未迁调用方。

**Focused verification:**

- 运行 `pnpm --filter @iam/api test:integration:composition`，以独立 Redis client 观察公开 state/effect。
- 盘点 RESP seed/raw `mset` imports，并运行 package lint/typecheck 与 `git diff --check`。

- [ ] 保留 Independent Custom SSO、gateway projection、Subject Access、rotation/disable 等现有公开行为覆盖。
- [ ] Fixture 只形成领域输入，不手写 Subject Access、Subject Facts、client cache 或 Session key/payload。
- [ ] 测试使用真实 process、PostgreSQL 与 Redis，因此唯一归属 `composition`；process 只是内部 harness。
