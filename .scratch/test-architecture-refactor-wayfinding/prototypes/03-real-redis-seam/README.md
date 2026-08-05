# PROTOTYPE — 真实 Redis 迁移的最小测试 seam

这是 ticket「收敛真实 Redis 迁移的最小测试 seam」的可丢弃讨论草图，不是 production/test/tooling 实现。

## Question

删除 RESP/business shim 后，迁移是否只复用现有 production `createSessionKernel`，还是新增一个只拥有真实 Redis
namespace、writer/observer client 与 cleanup 的 test scope？无论选择哪项，fixture 都只形成领域输入，不生成 key、
serialized value、TTL、index 或 Lua 行为。

## Run

```text
node .scratch/test-architecture-refactor-wayfinding/prototypes/03-real-redis-seam/prototype.mjs
```
非交互快照：

```text
node .scratch/test-architecture-refactor-wayfinding/prototypes/03-real-redis-seam/prototype.mjs --snapshot
```

交互键：`1`/`2` 切换候选，`n` 切换场景，`q` 退出。每次切换都会完整重绘当前 interface、flow、删除测试与安全属性。

## Evidence pointers

- production Kernel：`packages/api-core/src/session/kernel/facade.ts`、`store.ts`、`keys.ts`、
  `artifact-consumption.ts`
- in-memory testing variant：`packages/api-core/src/session/kernel/testing.ts`
- 当前单调用方 scope：`packages/api-core/test-redis/redis-test-harness.ts`
- fixed-pattern cleanup：`packages/api-core/src/session/kernel/legacy-cleanup.ts`
- ticket 与完整问题：`../../issues/03-minimize-real-redis-test-seam.md`
