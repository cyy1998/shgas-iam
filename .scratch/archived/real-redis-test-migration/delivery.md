# 真实 Redis 测试迁移开发记录

## 当前状态

- 正式范围：[spec.md](spec.md)。
- 目标分支：`main`；功能分支：`codex/real-redis-test-migration`。
- 已归档的先行 Feature
  [test-collection-migration](../archived/test-collection-migration/spec.md) 已完成。
- [Ticket 01 — 用 API External Entry 证明 Production-owner Seed](issues/01-prove-api-production-owner-seed.md)、
  [Ticket 02 — 让 OIDC External Entry 复用同一 Owner Pattern](issues/02-migrate-oidc-owner-seed.md)、
  [Ticket 03 — 收窄 API 与 Admin API Process 覆盖](issues/03-narrow-api-admin-process-coverage.md) 与
  [Ticket 04 — 移除 OIDC、Worker 与 API Core 的 Process Shim 依赖](issues/04-remove-process-shim-dependencies.md)、
  [Ticket 05 — 证明 Legacy Cleanup 的精确删除边界](issues/05-prove-legacy-cleanup-boundary.md) 与
  [Ticket 06 — 删除 RESP Shim 并收口 Redis 文档](issues/06-remove-resp-shim.md) 均已 `resolved`，各票 Standards/Spec
  双轴评审最终均为 0 findings。
- RESP shim、专属 tests/testing export 与 command-order assertions 已退役；API Core Redis contract 与 API composition
  复用统一的 destructive cleanup testing harness，公开 logout、legacy fail-closed、payload 保留和零 client notification
  均由 production owner、公开 HTTP 与独立 observer 覆盖。
- 下一安全动作是主会话向维护者提出一次性本地收尾授权：在最终内容上运行 `pnpm verify`、调用 `archive-feature`、以
  `git merge --squash` 合入 `main`，验证单一聚合提交后删除本地功能分支。本次 handoff 不执行上述动作，也不执行
  merge、push、PR、deploy、archive 或分支删除。

## 验收与验证计划

- 每票运行 ticket 声明的最高层公开 entry/protocol/CLI 行为、对应真实 Redis owner contract、caller inventory、受影响
  workspace lint/typecheck 与 `git diff --check`。
- 普通测试只使用 caller-provided 专用 Redis 与随机 namespace；Ticket 05 只使用明确独占的
  `IAM_API_CORE_CLEANUP_TEST_REDIS_URL`，核对 ACL、sentinel、完整 inventory 与 cleanup exit code。
- Ticket 06 运行全部受影响 `redis`/`process`/`composition` profiles、文档检查和 shim/command observer 退役盘点。
- 每票不反复运行全仓 `pnpm verify`；准备本地合入时仍按仓库 workflow 另行取得一次性收尾授权并执行最终验证。

## 事件

- 2026-08-03 — Authorization：维护者明确授权发布四份正式 specs、delivery journals 与 24 张 implementation tickets；
  未授权代码实现或外部资源测试。
- 2026-08-03 — Publication：本 feature 的 spec、delivery 与 6 张 tickets 已发布；所有 tickets 保持
  `ready-for-agent`，production/test/tooling 尚未修改。
- 2026-08-05 — Authorization：维护者授权实现 Ticket 01，使用功能分支 `codex/real-redis-test-migration`；未授权
  merge、push、PR、deploy、archive 或分支清理。
- 2026-08-05 — Implementation：API composition entry 已改用 production Session Kernel、Subject Access、Subject Facts
  与 Custom SSO owners 建立状态，并通过随机 owner marker 做精确 Redis 清理；API consumer 的三个 RESP seed helpers、
  raw `mset` 与 shim import 已删除，shim 本体和后续 ticket 调用方保留。
- 2026-08-05 — Review：Standards/Spec 双轴评审最终均为 0 findings，Ticket 01 已标记 `resolved`。
- 2026-08-05 — Validation：API lint、typecheck、`git diff --check` 与 RESP seed/raw `mset` inventory 通过。
  `IAM_API_TEST_DATABASE_URL` 与 `IAM_API_TEST_REDIS_URL` 未提供；composition 命令只确认缺参时明确非零退出，真实
  PostgreSQL/Redis 正向语义未运行且不宣称通过。
- 2026-08-05 — Implementation：Ticket 02 通过四个聚焦提交完成并收敛：`7cfa99f2` 把 OIDC composition seed 迁到
  production owners；`7618f083` 复用共享 owner-marker cleanup 并恢复 Custom SSO 隔离；`fc3a7c4e` 让不安全 marker
  fail closed，并建立非默认 Custom SSO sentinel；`1e97638c` 将 cache 观察收回 OIDC 测试局部，以独立 Redis reader
  和禁止回源的 source 防止 read-through 遮蔽破坏。
- 2026-08-05 — Review：以 `79fe07b428eac968ee1c6477c4baff4ec6b31beb` 为 fixed point 的 Standards/Spec 完整双轴
  复审最终均为 0 findings，Ticket 02 已标记 `resolved`。
- 2026-08-05 — Validation：API Core 与 Custom SSO reader 聚焦 behavior tests、api-core/API/OIDC lint 与 typecheck、
  `git diff --check` 及 raw seed、testing helper、persistence detail inventory 通过。OIDC 两项专用资源 URL 均未提供；
  composition 只确认首个缺失数据库 URL 时 fail-fast，真实 PostgreSQL/Redis 正向语义未运行且不宣称通过。
- 2026-08-05 — Authorization：维护者授权 Ticket 03 使用本机临时独占 PostgreSQL 与 Redis 容器完成真实资源验证；
  PostgreSQL 先通过正式 `db:migrate` 初始化。该授权不包含 merge、push、PR、deploy、archive 或分支清理。
- 2026-08-05 — Implementation：API/Admin process 收窄到 entry、env、docs、readiness 与进程树清理；Redis-dependent
  public HTTP、client cache 与 projection 行为由真实 `redis`/`composition` profiles 接管。真实 API composition 首次运行
  暴露 Subject Access 状态转换漏掉 `prepareRepair`，使非幂等 readiness probe 在首次 mutation 后重试并以误导性的
  client error 表现；修正为 `beginBlocking → prepareRepair → finalize` 后稳定通过。
- 2026-08-05 — Repair：Admin full composition 的 BullMQ queue 最初需要显式等待 readiness；进一步资源所有权复审发现
  固定 queue metadata 会残留在 caller-owned Redis。最终 Redis fixture 改为使用 production Admin runtime 的
  `clientCache` seam，不初始化无关 queue，并通过独立 Redis inventory 断言 owned-prefix cleanup 后 key 集合零差异；
  未复制 cache key、version、serializer 或 mutation ordering。
- 2026-08-05 — Validation：API composition 在真实 PostgreSQL/Redis 上最终连续两次通过，每次 1/1、41 assertions；
  API Redis 4/4、32 assertions；Admin Redis 最终 4/4、17 assertions；API process 2/2；Admin process 1/1；聚焦
  component 57/57。API/Admin lint 与 typecheck、test collection/docs/env-name/architecture guards、编排守卫和
  `git diff --check` 全部通过。
- 2026-08-05 — Review：Ticket 03 Standards/Spec 完整双轴复审最终均为 0 findings；Ticket 03 已标记 `resolved`。
  Ticket 05 拥有的 legacy cleanup RESP gate 保留，等待独占 disposable Redis contract 替换。
- 2026-08-05 — Implementation：按正式 [spec](spec.md) 与
  [Ticket 04](issues/04-remove-process-shim-dependencies.md) 收窄 OIDC process entry 到 discovery/readiness，将使用
  in-memory adapter 的 OIDC protocol/lifecycle tests 归入 component；Worker entry 与 commands 改用不可达存储并只断言
  not-ready、no-consumption、退出与 shutdown。OIDC/Worker process 的 RESP callers 已归零；cleanup 专属 callers、共享
  process harness 及仍被 cleanup 使用的 shim 保留给后续 tickets。
- 2026-08-05 — Validation：OIDC component/process、Worker process 与 API Core process 均通过，三个 workspace 的
  lint/typecheck、Test Collection/编排/Architecture/Env naming guards、root lint 与 `git diff --check` 全部通过。
  `IAM_OIDC_PROVIDER_TEST_REDIS_URL`、`IAM_API_CORE_TEST_REDIS_URL` 与 `IAM_USER_PROFILE_TEST_REDIS_URL` 未提供；对应
  owner commands 只验证缺参时明确非零退出且不允许 fallback，真实 Redis 正向语义未运行且不宣称通过。
- 2026-08-05 — Review：Ticket 04 Standards/Spec 完整双轴复审最终均为 0 findings，验收项已勾选并标记 `resolved`；
  依赖前沿进入 Ticket 05，开始实现前仍需新的明确授权与 implementation 子代理。
- 2026-08-05 — Implementation：按正式 [Ticket 05](issues/05-prove-legacy-cleanup-boundary.md) 将 cleanup CLI contract 迁入
  API Core Redis Integration，以 CLI-local harness 在连接前封闭 caller-owned/runtime Redis identity、歧义 URL 与资源
  fallback，并通过公开 package command 保留结构化事件及人类可读摘要；旧 RESP compatibility cases 留给最终退役票。
- 2026-08-05 — Validation：使用调用方授权的临时独占 Redis 与受限 ACL 完成真实 cleanup contract，dry-run、阻断 verify、
  apply、重复 apply、clean verify、sentinel 和完整 before/after inventory 全部通过；API Core lint/typecheck、相关
  process/component、API compatibility、Test Collection/Env Name/Docs guards 与 `git diff --check` 均通过，所有临时资源
  已精确删除。
- 2026-08-05 — Review：Ticket 05 Standards/Spec 完整双轴复审最终均为 0 findings，四项验收已勾选并标记 `resolved`；
  依赖前沿进入 Ticket 06，开始实现前仍需新的明确授权与全新的 implementation 子代理。
- 2026-08-05 — Implementation：Ticket 06 删除 process-smoke RESP server、专属 tests/testing export 与命令排列断言，
  将被删 cleanup compatibility 场景迁到 API composition 的 production Session Kernel、公开 HTTP 和独立 Redis observer；
  API Core Redis contract 与 API composition 共同复用 owner-owned cleanup harness，统一执行 URL query/identity preflight、
  初始 inventory、ACL、CLI lifecycle 与 teardown。Current testing/commands docs 已同步 shim 退役和资源边界。
- 2026-08-05 — Validation：API Core Unit、component 与 process、根 process 和编排测试、API/API Core lint/typecheck、root
  lint、Test Collection/Docs/Architecture/Env Name guards、consumer inventory 与 `git diff --check` 均通过。最终环境未提供
  本票所需的专用 PostgreSQL/Redis URL；相关 `redis`/`composition` 正向 profile 未运行且不宣称通过，只确认缺参、query
  或重复 logical DB identity 在连接/删除前明确非零退出且不 fallback。此前 Ticket 05 的真实独占 Redis 结果保持有效。
- 2026-08-05 — Review：Ticket 06 Standards 完整复审为 0 findings（hard 0、judgement 0），Spec 完整复审为 0 findings；
  四项验收已勾选并标记 `resolved`，Ticket 01–06 全部完成。
