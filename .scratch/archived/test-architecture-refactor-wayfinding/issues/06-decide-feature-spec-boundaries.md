# 裁定最终 Feature Spec 边界与依赖

Type: grilling

Status: resolved

Blocked by: 02 — 决定 Collection Guard 的最小职责与退出策略；03 — 收敛真实 Redis 迁移的最小测试 seam；04 — 收敛 Full-system E2E 的最小系统边界；05 — 决定 Gate 与兼容发布的证据契约

## Question

经过前述决策后，哪些交付边界值得拥有独立 feature spec，才能各自提供可观察价值、独立验收与安全回滚，而不会把紧密耦合的
改动人为拆散，或把纯文档/纯命名工作包装成独立工程项目？

本 ticket 需要比较交接建议的五份候选 specs：

1. 测试架构契约与 collection baseline/guard；
2. 测试集布局与命令迁移；
3. 真实 Redis 覆盖迁移与 RESP shim 删除；
4. Full-system E2E；
5. Gate 与兼容策略切换。

对每个候选项应用 split/merge test：是否有独立用户价值、不同风险或资源所有权、清晰的 merge/rollback 点、可在合理会话数内完成，
以及是否必须等待另一项全部完成。输出最终 tracker slugs、spec 数量、依赖图和明确 out-of-scope；四份、五份或其他数量都可以，
不以保留原建议数量为目标。

## Answer

维护者确认最终发布四份 feature specs。原候选“测试架构契约与 collection baseline/guard”和“测试集布局与命令迁移”
合并为同一 feature；其余真实 Redis、Full-system E2E 与 Gate 发布分别保留独立 feature。

### 最终 Feature 集合与依赖图

最终 tracker slugs 为：

1. Canonical Collection 与命令迁移：`test-collection-migration`
2. 真实 Redis 测试迁移：`real-redis-test-migration`
3. Full-system E2E：`full-system-e2e`
4. 测试 Gate 发布：`test-gate-rollout`

依赖图采用先收敛 collection、再并行、最后汇合的形状：

```text
test-collection-migration
├── real-redis-test-migration ─┐
└── full-system-e2e ──────────┴─> test-gate-rollout
```

真实 Redis 测试迁移与 Full-system E2E 互不阻塞。测试 Gate 发布只直接依赖这两个并行 feature；Canonical Collection 与
命令迁移已是它们的传递依赖，不增加冗余直连边。

### Canonical Collection 与命令迁移

`test-collection-migration` 负责一次原子的收集面迁移：

- 建立 Unit、Integration、E2E 三层中当前已有测试的 canonical collection，以及六个 Integration profiles 的目录、
  runner、package/root commands 和 Turbo task graph；
- 机械迁移全部现有测试的路径和唯一归属，包括现有 Redis、PostgreSQL 与 mock Playwright 测试，同时尽量保持测试语义不变；
- 建立永久 `pnpm check:test-collection`，只保护当前文件的唯一收集、路径/命名一致性与 root task 可达性；
- 以 feature-local baseline、覆盖映射和临时例外证明 collection equality；切换完成后清除 live 例外和迁移期机器对照逻辑，
  不把它们升级为永久 Guard；
- 在同一次可回滚切换中删除除永久 `test -> test:unit` 外的旧入口，并把 `verify` 改为最终的
  `static -> typecheck -> test:unit -> build`；
- 新增 ADR supersede `ADR-0003`，并同步更新当时已经成立的 Current 测试架构、命令文档、仓库地图和文档索引。

该 feature 不改变 Redis fidelity，不删除 RESP shim，不建设 Full-system E2E，也不发布不能完整工作的 `test:e2e`、
`verify:ci` 或 `verify:release` 占位命令。把契约/Guard 与布局/命令拆成两份 specs 会迫使前一份保护即将消失的旧结构，
或为尚不存在的新结构维护临时例外；删除这道人为 feature seam 后复杂度不会重新分散，因此合并。

### 真实 Redis 测试迁移

`real-redis-test-migration` 在稳定的 canonical collections 内改变 Redis 测试 fidelity：

- 把所有依赖 RESP shim 的覆盖迁到调用方提供的真实测试 Redis；
- 通过 production Session Kernel 与各状态 owner Module 的公开 interface 建立领域状态，不复制 key、serializer、TTL、
  index 或 Lua，不预先新增通用 Redis test scope；
- 普通场景使用专用 URL 与随机 namespace；cleanup CLI 使用独占、可销毁的 Redis，并以 ACL、sentinel 和完整
  before/after inventory 证明精确删除；
- 删除 RESP shim、相关 testing exports、专属测试和 Redis command-order assertions，改以公开 HTTP/OIDC/CLI 结果及
  独立 client 观察的真实状态验收；
- 只更新真实 Redis、cleanup 隔离和 RESP shim 退役相关的 Current 文档段落。

该 feature 不改变三层/profile、目录、root command 或 Gate 结构，不建设通用 Redis harness 平台，也不进入
Full-system E2E 或真实 CI/Linux 启用。它具有不同的外部资源、安全与覆盖迁移风险，以及独立的合并和回滚点，因此不并入
Canonical Collection 与命令迁移。

### Full-system E2E

`full-system-e2e` 建立 root-owned、固定 IAM 拓扑的一次性 orchestrator：

- 持有唯一 Compose project、run descriptor、动态 Gateway port、migrations、E2E-local seed、readiness、诊断与幂等精确清理；
- 只在完整可运行时发布 `test:e2e`；
- 通过单一 `127.0.0.1` Gateway origin 交付 Admin Custom SSO 与独立 OIDC Authorization Code + PKCE 两条真实 journey；
- 保持 journey 经过的本仓库核心 runtime 全部真实，只关闭或替代 CAPTCHA、短信等明确不在 journey 内的第三方边界；
- 更新 E2E workspace、orchestrator、命令、资源和生成 artifact 边界相关的 Current 测试架构、命令文档与仓库地图。

该 feature 不建设通用编排平台、janitor、持久 run registry、可恢复 phase state machine、任意服务组合或额外 journeys，
也不绑定 CI provider。它直接使用真实 Redis 和 production owner seam，不依赖真实 Redis 测试迁移，因此两者在
Canonical Collection 与命令迁移之后可以并行。

### 测试 Gate 发布

`test-gate-rollout` 在两个并行 feature 完成后负责上层 Gate：

- 保留 Canonical Collection 与命令迁移已经发布的基础 `verify`；
- 发布 `verify:ci = verify -> test:integration` 与 `verify:release = verify:ci -> test:e2e`，均按顺序 fail fast；
- 不复制资源规则；缺失资源、诊断与 cleanup 失败继续由 `test:integration`、各 profile 和 `test:e2e` owner command 负责；
- 在最终候选树记录 Windows 本地 `verify 3/3`、调用方提供全套专用资源时 `verify:ci 1/1`、干净 E2E 环境中
  `verify:release 1/1` 的无 retry、人类可读摘要；
- 更新三个 Gate 的最终语义、证据与 adoption 状态，并对 Current 测试架构和命令文档做一致性收口。

该 feature 不建立 resource detector、receipt、manifest、transcript 或证据状态机，不创建 provider workflow，也不把
Windows 本地通过表述为 Linux/CI runner 已验收。独立保留该 feature 可避免 Canonical Collection 与命令迁移被真实 Redis
和 Full-system E2E 阻塞。

### 文档与 ADR ownership

文档采用“能力 owner 随实现同步更新，最终 Gate feature 只收口”的 ownership：

- Canonical Collection 与命令迁移在旧通道模型首次停止反映当前仓库时新增 ADR supersede `ADR-0003`，并主改三层/profile、
  collection、目录、task graph、永久 Guard 和基础 `verify` 对应文档；
- 真实 Redis 测试迁移只维护 Redis fidelity、资源隔离与 cleanup 段落；
- Full-system E2E 只维护 E2E workspace、orchestrator、两条 journey、命令与 artifact 边界；
- 测试 Gate 发布只维护上层 Gate、最终聚合证据与 adoption 状态，并收口文档一致性。

不创建纯文档 feature。测试层级、profile、collection 和 Gate 属于测试架构语言，不写入 IAM 业务领域 `CONTEXT.md`。

### 回滚边界

- 回滚 Canonical Collection 与命令迁移时，整体恢复旧目录、runner、命令、`verify`、Guard 与文档状态；若下游 feature
  已合并，必须先按依赖图逆序回滚下游。
- 回滚真实 Redis 测试迁移时，只在新 canonical collections 下恢复 RESP shim 与原覆盖，不回滚三层命令和目录；若测试
  Gate 已发布，先回滚测试 Gate 发布。
- 回滚 Full-system E2E 时，只移除 E2E workspace、`test:e2e`、Compose/Gateway 增量及相应文档；若测试 Gate 已发布，
  先回滚测试 Gate 发布。
- 回滚测试 Gate 发布时，只撤回 `verify:ci`、`verify:release` 与最终证据收口，保留基础 `verify` 和三个 owner feature。

### Out of scope

- 本 Wayfinder 决策不发布上述 specs 或 implementation tickets，不进入代码实现，也不细化 tracer-bullet、提交级顺序、
  聚焦验证或逐票验收；
- 不绑定 GitHub Actions、GitLab CI 等 provider，不创建平台 workflow，不定义或收集真实 Linux/CI runner 的启用证据；
- 不在迁移和目标 runner 验收前提高 Redis、PostgreSQL、Browser 或 E2E 并发；
- 不新增 compatibility aliases；永久 `test -> test:unit` 是唯一例外；
- 不建设覆盖率门槛、JUnit/趋势平台、通用 flaky quarantine、Redis 测试平台或 E2E 基础设施产品；
- 不增加已确认两条 journey 之外的 E2E 场景，不借测试架构迁移修改无关业务行为或数据库 schema；
- 不修改 IAM 业务领域 `CONTEXT.md` 或冻结的 `openspec/` 历史产物。
