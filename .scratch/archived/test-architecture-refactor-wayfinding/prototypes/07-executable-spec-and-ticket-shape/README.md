# PROTOTYPE — 四份 Specs 的可执行性与 Ticket 形状

这是 ticket「验证 Specs 的可执行性与 Ticket 粒度」的可丢弃讨论草图。它不是正式 `spec.md`、`delivery.md` 或
implementation tickets，也不授权修改 production、test 或 tooling。

## Question

已裁定的四份 feature specs 能否让 fresh-context implementation agent 只做实现选择而无需重新设计？候选 tickets 是否按
可观察行为或安全迁移步纵切，且每票结束后仓库仍可工作、验证范围聚焦、最终 feature 可以独立 merge 与 rollback？

## Run

```text
node .scratch/archived/test-architecture-refactor-wayfinding/prototypes/07-executable-spec-and-ticket-shape/prototype.mjs
```

非交互快照：

```text
node .scratch/archived/test-architecture-refactor-wayfinding/prototypes/07-executable-spec-and-ticket-shape/prototype.mjs --snapshot
```

交互键：`1`/`2`/`3`/`4` 切换 feature，`n` 切换 ticket，`l` 切换观察镜头，`q` 退出。每次切换都会完整重绘当前
spec outline、ticket blocker、验收、聚焦验证和保持仓库可工作的理由。

## Discussion baseline

- 正式需求只允许一个 owner：Canonical Collection 拥有三层/profile、Unit/Integration collection、公开命令面、永久
  Collection Guard 与基础 `verify`；真实 Redis 拥有 fidelity 与 RESP shim 退役；Full-system E2E 拥有固定系统 lifecycle、
  两条 journey 与 `test:e2e`；测试 Gate 拥有 `verify:ci`、`verify:release` 和最终聚合证据。
- 跨 spec 只链接 owner，不复制其 contract。`test-gate-rollout` 直接依赖真实 Redis 与 Full-system E2E，Canonical Collection
  是传递依赖。
- Feature 是独立 merge/revert 边界；ticket 是同一 feature branch 上的可验证安全步。每票必须保持仓库可工作，但不要求把
  半成品 feature 单独 merge 到目标分支。
- 新 canonical command 只有在对应 collection 完整时才出现。`test:e2e`、`verify:ci`、`verify:release` 尤其不得先发布
  placeholder、silent skip 或 warning-only 实现。
- Canonical Collection 的推荐迁移形状是：先冻结旧 collection 与目标归属；再用 Vitest/OIDC 与 Bun/API Core 两个纵切验证
  migration shape，按 owner group 建立完整 package commands；所有 package surfaces 完整后才发布 root commands 与永久
  Guard；最后在一个 cutover ticket 中切换 `test`/`verify` 并删除旧入口和迁移期对照物。
- 每张正式 implementation ticket 至少要写清：可观察行为、blockers、保持可工作的 invariant、验收、最高层相关聚焦验证，
  以及仅在该票改变 rollback 形状时才写的回滚说明；不要求逐票运行全仓 `pnpm verify`。
- 已确认：近规模 Subject Projection rehearsal 保留为测试模型外的专项操作命令（候选名
  `subject-projection:rehearsal`），移出 `*.test` 与 Collection Guard 候选范围；它不进入 `test:integration` 或
  `verify:ci`，也不形成第七个 profile。
- 已确认：API/OIDC 的真实 entry 联合 PostgreSQL/Redis 测试归 `composition`；child process harness 是内部执行手段。
  `process` 只拥有 entry、readiness、退出、timeout 与进程树清理，不重复 production adapter/protocol 行为。
- 已确认：Canonical Collection 的 implementation tickets 按完整 owner/package surface 纵切；OIDC/Vitest 与 API Core/Bun
  先验证迁移形状，再逐 owner 推进。不会用一张 profile-wide ticket 横跨全仓约 217 个 ordinary tests；root commands、
  永久 Guard 和默认入口 cutover 只在所有 package surfaces 完整后发生。
- 已确认：Unit 保持 owner-local（通常为 `src/**/*.test.ts[x]`，tooling owner 可使用窄 `test/` 或
  `scripts/__tests__/`）；全部 Integration profiles 是 `test-integration/<profile>/` 下的 siblings。非浏览器 Integration
  使用 `*.integration.test.ts[x]`，Playwright browser 使用 `test-integration/browser/**/*.spec.ts`；只有 Full-system 使用
  `e2e/system/**/*.spec.ts`。
- 已确认：destructive legacy cleanup Integration 只读取独立的 `IAM_API_CORE_CLEANUP_TEST_REDIS_URL`。该 URL 必须由
  caller 提供并指向独占、可销毁的 Redis DB/instance；不得回退 `IAM_API_CORE_TEST_REDIS_URL` 或 runtime Redis，也不由
  测试管理 Docker。完整 `test:integration` preflight 会在启动任何 profile 前检查它。
- 已确认：真实 Redis feature 依次完成 API external、OIDC external、API/Admin API process 收窄、OIDC/Worker/API Core
  process 脱离 shim、destructive cleanup safety，最后才删除 RESP shim/testing exports/command-order assertions 并收口文档。
  每个旧场景只在对应 production-owner 真实 Redis 覆盖通过后移除。
- 已确认：Full-system E2E 依次建立 exact-project infra/migration lifecycle、repo runtimes/Gateway routes/diagnostics、
  one-shot seed/single origin，再交付可独立验收的 Admin Custom SSO 与 OIDC PKCE journeys；只有两条 journey 汇合后才公开
  root `test:e2e`。中间只使用 `@iam/e2e-system` workspace-local 入口，每票必须精确清理本 run Compose project。
- 已确认：Gate feature 不把 `verify:ci` 与 `verify:release` 人为拆票；同一票发布完整 provider-neutral Gate interface 与
  fail-fast orchestration tests，第二票只运行最终 `verify 3/3`、`verify:ci 1/1`、`verify:release 1/1` evidence 并收口文档。

## Candidate dependency tree

```text
test-collection-migration
  冻结旧 collection 与目标归属
    -> OIDC/Vitest tracer -> API Core/Bun tracer
    -> API -> Admin API/Worker -> DB/read-model owners
    -> pure shared/Gateway -> frontend Unit/mock-browser
    -> root Unit/Integration commands + 永久 Collection Guard
    -> 原子切换 test/verify、删除旧入口、ADR/Current docs

test-collection-migration
  ├─> real-redis-test-migration
  │     API external -> OIDC external -> API/Admin process -> OIDC/Worker/API Core process
  │       -> destructive cleanup -> remove RESP shim/docs
  └─> full-system-e2e
        infra/migration lifecycle -> runtimes/routes/diagnostics -> seed/origin -> Admin journey ─┐
                                                    OIDC journey  ───┴─> publish test:e2e/docs

real-redis-test-migration ─┐
full-system-e2e ───────────┴─> test-gate-rollout
                              verify:ci + verify:release -> final evidence/docs
```

这棵树已获维护者确认，但仍只是 Wayfinder 的低保真讨论资产，不是已发布的正式 specs/tickets。详细 outline、每票验收与
聚焦验证以 prototype 的交互输出为准，权威决议以对应 Wayfinder ticket 的 `## Answer` 为准。

## Fixed-point facts used by the prototype

- 当前固定点共有 267 个 candidate `test`/`spec` files：包括 4 个 root tooling tests、唯一 MJS test、1 个近规模
  rehearsal、14 个 smoke、15 个 PostgreSQL、8 个 Redis、2 个 external 与 6 个 mock Playwright files；目标树会把
  rehearsal 转成测试模型外的操作入口，因此永久 Guard 不再把它视为 test candidate。
- 当前没有 `test:unit`、任何 `test:integration:*`、`test:e2e`、`check:test-collection`、`verify:ci` 或
  `verify:release`；现有 root `e2e` 只 fan out Admin/SSO mocked Playwright。
- OIDC 的四套 Vitest list 可机器证明 18/5/1/1 文件互斥；API Core 提供 Bun ordinary/process/redis 与共享 process
  harness 的第二种 runner tracer。
- Bun 没有 files-only list；永久 Guard 必须依据窄 command 目录与文件命名观察，且不能把 Admin API 被 spawn 的
  `client-cache-invalidation.composition-smoke.ts` 当作 runner test。
- `scripts/__tests__/test-orchestration.test.ts` 精确保护当前 scripts、Turbo graph、runner budgets 与 `verify` 顺序；每个迁移
  ticket 都必须同步它。测试路径变化还必须同步 lint paths、tsconfig include 与相对 imports。
- 当前 Full-system E2E lifecycle、descriptor、migration/seed、动态 Gateway manifest 和 cleanup 闭环均不存在；dev Compose
  只有拓扑/部分 healthchecks，没有 migration/init/seed step。

## Cross-spec audit

- 候选树共 24 张 implementation tickets：Canonical Collection 10、真实 Redis 6、Full-system E2E 6、测试 Gate 2；每张
  都有具名 blocker、可观察行为或安全迁移步、验收、聚焦验证和保持仓库可工作的理由。
- 正式来源唯一：collection/command/Guard/base verify、Redis fidelity、E2E lifecycle/journeys、upper Gates 分属四个 owner；
  下游只链接 owner，不复制其资源、cleanup 或证据规则。
- 不存在 incomplete public command：root Unit/Integration 在 package surfaces 完整后发布；`test:e2e` 在两条 journey 完整后
  发布；`verify:ci`/`verify:release` 在两个并行 feature 都完成后发布。
- 每个 feature 是独立 merge/revert 边界；ticket 只承担同一 feature branch 上可验证、可恢复的安全推进。
- 所有 Current architecture/commands/frontend/runbook 中的旧命令引用由最接近行为的 owner 更新；Historical release records
  保留原命令作为历史事实，不回写。

## Evidence pointers

- ticket 与完整问题：`../../issues/07-validate-executable-spec-and-ticket-shape.md`
- map 与已确认路线：`../../map.md`
- feature 边界与依赖：`../../issues/06-decide-feature-spec-boundaries.md`
- 公开测试 interface：`../../issues/01-minimize-public-test-language.md`
- Collection Guard：`../../issues/02-rightsize-collection-guard.md`
- 真实 Redis seam：`../../issues/03-minimize-real-redis-test-seam.md`
- Full-system E2E 边界：`../../issues/04-scope-full-system-e2e-mvp.md`
- Gate 证据：`../../issues/05-set-gate-and-compatibility-evidence.md`
- 当前测试架构：`../../../../docs/architecture/testing-architecture.md`
- 当前命令：`../../../../docs/development/commands.md`
- Architecture Guard 准入：`../../../../docs/architecture/architecture-guard.md`
- 原始调查：`%TEMP%/iam-service-testing-architecture-handoff-1e181eee.md`
- 外部审阅：`%USERPROFILE%/Downloads/test-architecture-review.md`
