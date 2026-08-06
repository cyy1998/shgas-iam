# 验证 Specs 的可执行性与 Ticket 粒度

Type: prototype

Status: resolved

Blocked by: 06 — 裁定最终 Feature Spec 边界与依赖

Prototype: [四份 Specs 的可执行性与 Ticket 形状](../prototypes/07-executable-spec-and-ticket-shape/README.md)

## Question

已裁定的 `test-collection-migration`、`real-redis-test-migration`、`full-system-e2e` 与 `test-gate-rollout` 四份 spec，
其范围、行为、迁移不变量、验收和 out-of-scope 是否足以让 fresh-context implementation agent 无需重新设计，且其 tickets
是否足够小、按依赖排序、每票保持仓库可工作并有最高层相关验证？

本 ticket 应按已裁定的“Canonical Collection 与命令迁移先行，真实 Redis 测试迁移和 Full-system E2E 并行，最后汇合到
测试 Gate 发布”依赖图，为每份 spec 制作低保真 outline 和 ticket tree，与维护者共同检查：

- 每项需求只在一个正式来源中拥有，跨 spec 只链接不复制；
- ticket 是可观察的端到端行为或安全迁移步，而不是按文件、层或机械重命名切片；
- 每票包含明确 blocker、验收与聚焦验证，且不要求反复运行全仓 `pnpm verify`；
- compatibility、回滚、文档和 ADR 更新落在最接近其行为变更的 ticket；
- 基础 `verify` 属于 Canonical Collection 与命令迁移，`verify:ci` 与 `verify:release` 属于测试 Gate 发布，且不发布
  缺少依赖能力的占位命令；
- 没有为了“完整计划”而加入当前没有调用方、证据或风险依据的框架、标签、guard、matrix 或平台能力。

该答案确认路线清晰后，才进入 `request-refactor-plan`/本地 tracker 发布阶段，创建最终 specs、`delivery.md` 和 implementation tickets；
仍不进入代码实现。

## Answer

维护者确认四份 feature specs 的 outline、正式来源 ownership、迁移不变量和候选 ticket tree 已足以进入后续
`request-refactor-plan`/本地 tracker 发布阶段。低保真讨论资产为
[四份 Specs 的可执行性与 Ticket 形状](../prototypes/07-executable-spec-and-ticket-shape/README.md)；它仍不是正式
`spec.md`、`delivery.md` 或 implementation tickets。

### Feature ownership 与依赖

依赖图保持既有裁定：

```text
test-collection-migration
├── real-redis-test-migration ─┐
└── full-system-e2e ──────────┴─> test-gate-rollout
```

- `test-collection-migration` 独占三层/profile 语言、canonical paths、Unit/Integration collections、package/root commands、
  Turbo graph、永久 Collection Guard、基础 `verify`、旧入口退役、ADR 和对应 Current docs。
- `real-redis-test-migration` 独占真实 Redis fidelity、production-owner fixture seam、destructive cleanup safety、RESP shim/
  testing exports/command-order assertions 的退役和对应文档。
- `full-system-e2e` 独占 exact-project lifecycle、migrations、one-shot seed、readiness、diagnostics、cleanup、两条 journeys、
  `test:e2e` 和对应文档。
- `test-gate-rollout` 只拥有 `verify:ci`、`verify:release`、最终聚合 evidence 和三个 Gate 的文档收口；它链接而不复制
  owner commands 的资源与 cleanup contract。

每个 feature 是独立 merge/revert 边界。Implementation ticket 只是在同一 feature branch 上保持仓库可工作的安全步，
不要求半成品 feature 单独合入目标分支。若已有下游，feature rollback 继续按依赖图逆序执行。

### Canonical path、profile 与特殊入口

- Unit 保持 owner-local，通常使用 `src/**/*.test.ts[x]`；tooling owner 可以使用窄 `test/` 或
  `scripts/__tests__/`。
- 六个 Integration profiles 全部是 `test-integration/<profile>/` 下的 siblings：`component`、`process`、`redis`、
  `postgres`、`composition`、`browser`。非浏览器 Integration 使用 `*.integration.test.ts[x]`；Playwright browser 使用
  `test-integration/browser/**/*.spec.ts`。
- Full-system E2E 独占 `e2e/system/**/*.spec.ts`。Browser Integration 不是额外层级，也不得放入 E2E 路径。
- API/OIDC 真实 entry 联合 PostgreSQL/Redis 测试归 `composition`；child process harness 是内部执行手段。
  `process` 只拥有 entry、readiness、退出、timeout 和进程树清理。
- 近规模 Subject Projection rehearsal 改为测试模型外的 `subject-projection:rehearsal` 操作入口，保留 10,002 行合成
  数据、专用 PostgreSQL/Redis、串行、JSON 摘要和精确清理；它不使用 `*.test` 命名、不进入 Collection Guard、
  `test:integration` 或 `verify:ci`，也不形成第七个 profile。Historical records 保留旧命令作为历史事实。

### Canonical Collection 与命令迁移：10 tickets

该 feature 按完整 owner/package surface 纵切，不按 profile 横切约 217 个 ordinary tests：

1. 「锁定旧 Collection 基线与目标归属」固定当前 267 个 candidate test/spec files、root tooling、MJS、rehearsal、
   runner lists/Turbo dry-run 与目标 mapping；例外必须具名 owner 和清除条件。
2. 「用 OIDC 纵切验证 Vitest 多 Profile 迁移」以 OIDC 的 ordinary/process/composition/redis 四套 collection 验证
   Vitest migration shape。
3. 「用 API Core 纵切验证 Bun 与 Process Harness 迁移」验证 Bun 窄目录 adapter、transit/cache/resource contract，
   并区分 harness 普通测试与真实 child-process tests。
4. 「迁移 API 的完整 Canonical Package Surface」一次完成 API 的 package-local Unit/process/composition/postgres/redis
   commands 及其 lint/tsconfig/import/config 配套。
5. 「迁移 Admin API 与 Worker 的 Canonical Package Surfaces」完成两个 owner surfaces，并排除被 spawn 的非测试 fixture。
6. 「迁移 Database 与 Read-model 资源 Owners」完成 DB、Role Assignment、User Profile 的 Unit/postgres/redis surfaces，
   同时交付测试模型外的 `subject-projection:rehearsal`。
7. 「迁移 Pure Shared Packages 与 Gateway Unit Surfaces」处理无目录参数 Bun packages、唯一 MJS test 与 Unit/component
   归属。
8. 「迁移 Frontend Unit 与 Mock-browser Surfaces」保持 Admin/SSO Vitest 与 mocked Playwright 行为，并迁入 browser
   Integration。
9. 「用 Root Commands 与永久 Guard 封闭 Collections」只在全部 package surfaces 完整后发布 root `test:unit`、六个
   profiles、`test:integration` 统一 preflight 与 `check:test-collection`。
10. 「原子切换默认命令并退役旧入口」在 collection equality、唯一收集和例外归零后，同一次切换
    `test -> test:unit`、基础 `verify`，删除其他旧入口/live migration artifacts，并更新 ADR、README 和全部 Current
    architecture/commands/frontend/runbooks；Historical records 不回写。

永久 Guard 只观察路径/命名、package task、runner list 与 Turbo dry-run。Bun 使用窄目录/命名 adapter；Playwright 使用
JSON list。它不分析断言、资源使用或 AST/data flow，也不吸收 baseline、mapping 或临时例外。

### 真实 Redis 测试迁移：6 tickets

顺序固定为：

1. 「用 API External Entry 证明 Production-owner Seed」删除 API external 的 RESP seed/raw `mset`，通过 production
   Session Kernel、Subject Access、Subject Facts 和 Custom SSO owners 建立状态并验证公开 HTTP 行为。
2. 「让 OIDC External Entry 复用同一 Owner Pattern」保留 discovery、PKCE、token、UserInfo 与 logout 的真实
   composition 行为；只有两个调用方确实重复非平凡 lifecycle 后才允许提取窄 testing export。
3. 「收窄 API 与 Admin API Process 覆盖」让 process 只保留 lifecycle，把 Redis-dependent entry/cache/legacy 行为迁到
   真实 redis/composition。
4. 「移除 OIDC、Worker 与 API Core 的 Process Shim 依赖」保留真实 Redis owner contracts；Worker 断言外部
   not-ready/no-consumption 安全属性，不锁定初始化顺序或 command count。
5. 「证明 Legacy Cleanup 的精确删除边界」只读取 `IAM_API_CORE_CLEANUP_TEST_REDIS_URL`。该 URL 必须由 caller 提供并
   指向独占、可销毁的 Redis DB/instance；不得回退 `IAM_API_CORE_TEST_REDIS_URL` 或 runtime Redis，也不得由测试启动
   Docker。ACL、non-target sentinel 和完整 before/after inventory 共同证明精确删除。
6. 「删除 RESP Shim 并收口 Redis 文档」只在 consumer inventory、真实替代覆盖和 cleanup safety 全部成立后删除 shim、
   testing exports、专属 tests 与 command-order assertions。

每个旧 RESP 场景只在对应 production-owner 真实 Redis 覆盖通过后移除；fixture 不复制 key、serializer、TTL、index 或 Lua。

### Full-system E2E：6 tickets

依赖树固定为：

```text
建立 Exact-project Infra 与 Migration Lifecycle
→ 启动 Repo Runtimes 并封闭诊断清理路径
→ 建立 One-shot Seed 与单一 Gateway Origin
├─→ 交付 Admin Custom SSO 真实 Journey
└─→ 交付 OIDC Authorization Code + PKCE 真实 Journey
    → 两条 Journey 汇合后，发布完整 test:e2e 并同步 Owner 文档
```

- 中间 tickets 只提供 `@iam/e2e-system` workspace-local 入口；每票从空环境运行自己的完整 slice，并精确清理 exact
  Compose project。
- Descriptor 在创建资源前落盘且不含 secret。任何失败先保存 bounded、脱敏诊断，再精确 cleanup；cleanup failure 非零。
- 浏览器只使用 `http://127.0.0.1:<dynamic-gateway-port>`；issuer、SSO origin、redirect URI 与 RP callback 使用同一完整
  origin。
- 两条 journey 可独立验收，但同一 feature branch 默认顺序实施；只有两条都完整后才公开 root `test:e2e`。
- 不建设通用 orchestrator platform、janitor、run registry、可恢复 phase state machine、全局 prune 或额外 journey。

### 测试 Gate 发布：2 tickets

1. 「发布完整 Provider-neutral Gate Interface」在同一 root orchestration change 中发布
   `verify:ci = verify -> test:integration` 与 `verify:release = verify:ci -> test:e2e`，并用受控 child commands 覆盖完整
   顺序、fail-fast、未启动下游和 owner failure propagation。Gate 不复制任何资源检测、diagnostics 或 cleanup。
2. 「取得最终聚合证据并收口 Current Docs」在最终候选树无 retry 地取得 Windows `verify 3/3`、全套专用资源
   `verify:ci 1/1`、干净 E2E 环境 `verify:release 1/1`，只记录平台、命令、次数和清理结果。Linux/真实 CI 保持
   `pending`。

### Implementation ticket 出版规则

最终发布的每张 implementation ticket 必须写清：可观察行为或安全迁移步、具名 blockers、必须保持的仓库可工作
invariant、可观察验收、最高层相关聚焦验证，以及仅在该票改变 rollback 形状时需要的回滚说明。不得按文件列表或机械重命名
切票，不得要求每票反复运行全仓 `pnpm verify`。

Root command 只在对应 package/owner 能力完整后出现；`test:e2e`、`verify:ci` 和 `verify:release` 不得提前以 placeholder、
silent skip 或 warning-only success 发布。正式 specs 跨 feature 只链接上述 owner，不复制正文。

本答案只确认路线已经清晰。它不发布正式 tracker artifacts，不调用 `request-refactor-plan`，也不授权代码实现、完整/外部资源
测试、commit、merge、push 或部署。
