# 真实 Redis 测试迁移

## 问题陈述

API、OIDC Provider、Admin API、Worker 与 API Core cleanup 的部分 process/external 覆盖依赖测试自持的最小 RESP server。
这些测试能够模拟命令响应，却会把 Redis key、serialization、TTL、Lua dispatch 和 command ordering 复制到测试代码中；它们
既不能证明真实 Redis 的 Lua/CAS/TTL/transaction/index 语义，也容易把内部命令排列误当成公开 contract。

维护者需要在不丢失现有 HTTP/OIDC/CLI 安全覆盖的前提下，将全部 RESP-dependent 场景迁到调用方提供的真实测试 Redis 和
production owner Module interface，并在 destructive legacy cleanup 的删除边界可证明后安全退役协议替身。

## 方案

本 feature 在 [Canonical Collection 与命令迁移](../test-collection-migration/spec.md) 完成后，沿已经稳定的
`redis`/`process`/`composition` collections 逐 consumer 提高 fidelity。Fixture 只形成领域输入；production owner
负责所有 persistence 语义。普通 namespace-isolated Redis tests 与 destructive cleanup 的独占 disposable Redis 使用
不同资源 contract。

本 feature 与 [Full-system E2E](../full-system-e2e/spec.md) 在同一先行依赖后可以并行；Full-system E2E 复用相同 production
owner 原则，但不依赖本 feature 的测试迁移实现。最终聚合由 [测试 Gate 发布](../test-gate-rollout/spec.md) 拥有。

## 实施决策

### Production-owner 造数 seam

- Principal Session、Client Binding、Credential 与 Protocol Artifact 通过真实测试 Redis 和 production
  `createSessionKernel` 创建。Fixture 只提供 `subject`、`authContext`、binding/credential input 等领域输入。
- Subject Access 使用 `createSubjectAccessBootstrap`；Subject Facts 使用 `createSubjectFactsRedisPublisher`；Custom SSO
  runtime cache、OIDC Provider Session 与 Admin client cache 使用各自 production owner 的公开 seam。
- Kernel namespace、lookup HMAC、TTL 与 cleanup adapters 必须与被测 production entry 同源；需要 Principal Access
  fence 时先由 Subject Access owner 建立真实状态。
- `createSessionKernelForTesting` 继续只服务 Unit/component；它以内存 artifact consumer 替代 production Redis Lua，
  不能作为 Redis Integration fidelity seam。
- Fixture 不生成或导出 Redis key、serializer、TTL、index、Lua、raw seed、command observer 或可编程 adapter。
- 只有 API external 与 OIDC external 等至少两个真实调用方完成局部迁移后，确实重复同一段非平凡 resource lifecycle，
  才允许提取窄 testing export；该 export 仍只 composition production owners。

### 资源隔离

普通 Redis Integration 读取各 owner 的 caller-provided 专用测试 URL，每次运行使用随机 namespace，只清理 owned prefix 并
关闭自己的 clients。禁止 `FLUSHDB`、`FLUSHALL` 和无范围清理；缺少 URL 时在测试前明确非零退出，不回退 runtime Redis、
不 silent skip，也不由测试启动 Docker。

Legacy cleanup 会扫描固定历史 allowlist，不能与普通 namespace-isolated tests 共享资源。它只读取
`IAM_API_CORE_CLEANUP_TEST_REDIS_URL`；该 URL 必须由 caller 提供并指向独占、可销毁的 Redis logical DB 或 instance，
不得回退 `IAM_API_CORE_TEST_REDIS_URL` 或 runtime Redis。安全验收同时要求：

1. ACL 从能力上禁止 `FLUSHDB`/`FLUSHALL` 等危险命令；
2. non-target sentinel 在 apply 后仍存在；
3. 独立 client 的完整 before/after inventory 精确等于预期 target 删除集合，所有 non-target 保持且没有意外新增。

### 断言与删除顺序

迁移后的 entry/process/cleanup 测试通过公开 HTTP/OIDC response、CLI exit/摘要与独立 client 观察到的真实状态验收。删除
RESP command 顺序、次数、`MULTI/EXEC` 排列、Lua comment dispatch 与 legacy key read command-log assertions。

真实 Redis owner contracts 继续证明只有真实 Redis 才能证明的 Lua 单赢家、CAS、Redis TIME/TTL、transaction/index 原子
变化、并发线性化、fail-closed 和 cleanup 精确 effect。每个旧 RESP 场景只在对应 production-owner 替代覆盖通过后删除；
RESP shim 本体、相关 testing exports 与专属 tests 最后统一退役。

### 文档所有权

本 feature 只更新真实 Redis fidelity、普通 namespace 隔离、destructive cleanup 和 RESP shim 退役对应的 Current 测试架构、
命令或相关 runbook 段落。三层/profile、canonical paths/commands、Full-system lifecycle 和上层 Gate 只链接各自 owner，
不在本 spec 复制。

## 迁移不变量

- Fixture 只形成领域输入；key、serialization、TTL、index 与 Lua 始终由 production owner Module 实现。
- 普通测试只清 owned namespace；destructive cleanup 只作用于 caller-owned exclusive disposable Redis。
- 每个 RESP consumer 的真实替代覆盖先通过，再删除该 consumer 的旧 import/assertions；不得先删 shim 再补覆盖。
- Process profile 只验证 entry/readiness/exit/cleanup；Redis-dependent 业务语义迁入 `redis` 或 `composition`。
- 新 interface 必须有至少两个真实调用方并通过删除测试；单调用方 helper 保持局部。
- 本 feature 不改变三层/profile、目录、root commands 或 Gate 结构。

## 验收标准

- API、OIDC、Admin/API Core 等现有 RESP-dependent 行为保留公开协议、entry 与安全覆盖。
- 真实 Redis tests 通过 production owners 建立状态，不复制 persistence implementation。
- 只保留真实 Redis 才能证明的低层 contract，不锁定等价实现的命令排列。
- Cleanup 的 ACL、sentinel 与完整 inventory 同时通过；错误资源配置在连接/删除前 fail closed。
- 仓库不再导入或执行 RESP shim，专属 tests/testing exports/command-log assertions 删除。
- 缺少任何专用 Redis URL 时 owner command 明确非零退出，不 fallback、skip 或自行管理 Docker。
- Redis fidelity、隔离、cleanup 与 shim 退役文档同步；其他 feature-owned contract 未被复制或改写。

## 测试决策

- 每个 consumer ticket 运行其最高层公开 entry/protocol/CLI 行为与真实 Redis owner contract，并由独立 client 观察状态。
- 使用 import/caller inventory 证明 RESP 依赖逐步归零；不以内部 helper tests 替代公开行为。
- 资源测试使用调用方提供的专用 URL、随机 namespace 或明确独占 disposable Redis；所有 cleanup 结果都必须可观察。
- 每票运行受影响 workspace lint/typecheck、相关 `redis`/`process`/`composition` profile 与 `git diff --check`，不反复运行
  全仓 `pnpm verify`。
- 最后一票运行所有受影响 profiles、文档检查和完整 shim/command observer inventory；feature 准备合入时再按 workflow
  执行最终范围验证。

## 交付切片

1. [用 API External Entry 证明 Production-owner Seed](issues/01-prove-api-production-owner-seed.md)
2. [让 OIDC External Entry 复用同一 Owner Pattern](issues/02-migrate-oidc-owner-seed.md)
3. [收窄 API 与 Admin API Process 覆盖](issues/03-narrow-api-admin-process-coverage.md)
4. [移除 OIDC、Worker 与 API Core 的 Process Shim 依赖](issues/04-remove-process-shim-dependencies.md)
5. [证明 Legacy Cleanup 的精确删除边界](issues/05-prove-legacy-cleanup-boundary.md)
6. [删除 RESP Shim 并收口 Redis 文档](issues/06-remove-resp-shim.md)

## 回滚

只在新 canonical collections 下恢复 RESP shim 与原覆盖，不回滚三层命令和目录。若 `test-gate-rollout` 已合入，先回滚
Gate；`full-system-e2e` 不依赖本 feature，可独立保留。

## 范围外

- 通用 Redis test framework、raw seed interface、serializer/key builder export、可编程 command observer 或第二套
  persistence；
- 改变 canonical profile/command/Gate、建设 Full-system E2E 或提高 Redis 并发；
- 让普通 Redis tests 管理 Docker、共享 cleanup 资源或执行无范围清理；
- 修改 production Redis contract、无关业务行为、数据库 schema、`CONTEXT.md` 或冻结的 `openspec/`；
- CI provider、Linux runner adoption、coverage/JUnit/flaky 平台。

## 决策来源

正式实现以本 spec 为 feature 范围来源；背景裁定见 [Wayfinder map](../test-architecture-refactor-wayfinding/map.md)、
[真实 Redis 最小 seam](../test-architecture-refactor-wayfinding/issues/03-minimize-real-redis-test-seam.md)、
[Feature 边界](../test-architecture-refactor-wayfinding/issues/06-decide-feature-spec-boundaries.md)和
[最终 ticket shape](../test-architecture-refactor-wayfinding/issues/07-validate-executable-spec-and-ticket-shape.md)。当前基线见
[测试编排架构](../../docs/architecture/testing-architecture.md)。
