# Canonical Collection 与命令迁移

## 问题陈述

仓库当前同时使用普通测试、process smoke、external、PostgreSQL、Redis 和 mock Playwright 等历史通道。相同层级在不同
workspace 中使用不同目录、runner 与 script 名称，根命令也不能直接证明每个测试文件是否被唯一、完整地收集。现有
`pnpm verify` 还包含 process smoke，使默认环境无关验证与显式资源验证混在同一个入口。

维护者需要把这些入口一次收敛为 Unit、Integration、E2E 三层和唯一 canonical collection，同时保留现有业务断言与
Redis fidelity，避免迁移期间先删后补、静默漏收、重复收集或发布尚不完整的公开命令。

## 方案

本 feature 是四项测试架构重构的先行依赖，在尽量不改变测试语义的前提下完成 collection、路径、命名、package/root
commands、Turbo task graph、永久 Collection Guard 和基础 `verify` 的原子迁移。

依赖关系：无，可以首先实施。下游 [真实 Redis 测试迁移](../real-redis-test-migration/spec.md) 与
[Full-system E2E](../full-system-e2e/spec.md) 只在本 feature 完成后开始；上层 Gate 由
[测试 Gate 发布](../test-gate-rollout/spec.md) 独立拥有。

## 实施决策

### 稳定测试语言

公开层级只有 Unit、Integration、E2E。Integration 保留六个 sibling profiles：

- `component`：进程内多个 module 协作，真实出站依赖由 fake 或 in-memory adapter 替代；
- `process`：真实子进程、端口、readiness、退出、timeout 与进程树清理；
- `redis`：真实 Redis 与 production Redis adapter 的行为；
- `postgres`：真实 PostgreSQL schema、transaction 或 repository；
- `composition`：production composition wiring 与多个真实 adapter 的协作；
- `browser`：真实浏览器 harness，但允许替代 journey 不经过的系统 seam。

多资源测试按测试重点和 harness owner 唯一归属，不建立 profile 全局优先级，也不把 profile 当成新层级、速度标签或 gate。
API/OIDC 的真实 entry 联合 PostgreSQL/Redis 测试归 `composition`；child process 只是内部执行手段。

### Canonical 路径与命名

- Unit 保持 owner-local，通常使用 `src/**/*.test.ts[x]`；tooling owner 可以使用窄 `test/` 或
  `scripts/__tests__/`。
- 六个 Integration profiles 都位于 `test-integration/<profile>/`。非浏览器文件使用
  `*.integration.test.ts[x]`；browser 使用 `test-integration/browser/**/*.spec.ts`。
- Full-system E2E 独占 `e2e/system/**/*.spec.ts`；本 feature 只建立路径契约，不创建其 collection 或执行入口。
- 近规模 Subject Projection rehearsal 改为测试模型外的 `subject-projection:rehearsal` 操作入口。它保留 10,002 行
  合成数据、专用 PostgreSQL/Redis、串行、JSON 摘要与精确清理，但不使用 `*.test` 命名，不进入 Collection Guard、
  `test:integration` 或 `verify:ci`，也不形成第七个 profile。

### Canonical 命令

Package 与 root 使用同一命令语法。本 feature 负责发布的长期 root interface 为：

```text
pnpm test:unit
pnpm test:integration
pnpm test:integration:component
pnpm test:integration:process
pnpm test:integration:redis
pnpm test:integration:postgres
pnpm test:integration:composition
pnpm test:integration:browser
```

`test:integration` 在启动任一 profile 前一次性列出全部缺失资源并 fail closed。所有资源任务保持 `cache:false`，专用 URL
不得回退 runtime 配置。`test` 永久代理 `test:unit`；基础 `verify` 固定为
`static -> typecheck -> test:unit -> build`，不读取真实 PostgreSQL/Redis，也不启动浏览器或 Full-system stack。

本 feature 不发布 `test:e2e`、`verify:ci` 或 `verify:release` 占位命令。除永久 `test -> test:unit` 外，旧
`test:smoke`、`test:external`、package-local `test:redis`/`test:postgres`、frontend `e2e` 等入口在替代 collection
完整后直接删除，不保留 compatibility alias。

### Collection Guard 与迁移证据

迁移先从当前 runner list、Turbo dry-run 和 Bun 窄目录声明生成固定 baseline，再逐文件记录唯一目标归属。Baseline、映射和
临时例外只属于本 feature；例外必须记录原因、清除 ticket 和清除条件，不能整体刷新 baseline 来吞掉差异。

长期入口 `pnpm check:test-collection` 只验证：

1. 每个符合路径/命名约定的候选文件被一个 canonical collection 收集；
2. 每个候选文件只被收集一次；
3. 文件路径、命名与唯一归属一致；
4. root command 经 Turbo dry-run 可达持有 collection 的 package task。

Vitest 与 Playwright 使用稳定的机器 list 输出；Bun 只观察 command 明确指定的窄目录与命名，不复制完整发现算法。Guard
不分析断言、资源调用、AST、type 或 data flow，不保存历史兼容映射，也不并入 `check:architecture`。任何漏收、重收、
归属不一致、task 不可达、adapter 失败或输出不可解析都必须给出可定位诊断并非零退出。

当唯一收集成立、例外归零且旧 config 删除后，baseline、映射和 live 对照逻辑必须整体删除；永久 Guard 不吸收迁移资产。

### 文档与 ADR 所有权

本 feature 在旧通道模型首次不再反映当前仓库时新增 ADR supersede `ADR-0003`，并更新三层/profile、collection、路径、
task graph、永久 Guard、基础 `verify` 对应的 Current 测试架构、命令文档、仓库地图、README、frontend/runbook 引用与
文档索引。Historical records 与冻结 `openspec/` 保留原命令作为历史事实。

真实 Redis fidelity/RESP shim、Full-system lifecycle/journeys/`test:e2e`、`verify:ci`/`verify:release` 由各自 feature
拥有；本 spec 只链接，不复制这些 contract。测试架构词汇不写入 IAM 业务领域 `CONTEXT.md`。

## 迁移不变量

- 固定点上的每个现有候选文件都有且只有一个经人工确认的目标归属。
- 旧入口在替代 collection 完整前继续工作；不得先删后补，也不得让新旧入口同时漏收。
- 每个新 package/root command 从第一次出现起即代表完整 collection，不允许 placeholder、silent skip 或 warning-only
  success。
- 迁移只改变归属、命名和 orchestration；Redis fidelity、业务断言与 Full-system E2E 不在本 feature 顺带重写。
- Tickets 按完整 owner/package surface 纵切，不用单票横跨全仓某个 layer/profile。
- 每个 ticket 完成后仓库保持可工作；半成品 feature 不要求单独合入目标分支。

## 验收标准

- 每个候选测试文件恰由一个 canonical collection 收集，路径、命名与归属一致。
- 每个 canonical root command 经 Turbo 可达完整 package task；runner adapter 失败时非零退出并给出可定位诊断。
- `pnpm test` 永久等价 `pnpm test:unit`；基础 `pnpm verify` 不读取真实 PostgreSQL/Redis、不启动 browser/E2E。
- `test:integration` 在启动 profiles 前一次性验证全部 owner resources，缺项时明确非零失败。
- 迁移例外归零，旧 collection config/commands 与 live 对照逻辑删除；不留下未经批准的 alias 或占位 Gate。
- ADR 与所有受影响 Current docs 同步，Historical/冻结来源未被回写。

## 测试决策

- Baseline 与目标 mapping 使用文件集合双向 diff；每个 owner ticket 运行对应 runner list、canonical command、lint、
  typecheck 和根 orchestration 聚焦测试。
- Collection Guard 通过公开 interface 覆盖允许与违规 fixtures；不测试内部 adapter helper 或扫描顺序。
- Turbo dry-run 证明 root task 可达性和 transit/cache/resource contract；Playwright 使用 JSON list，Bun 使用窄目录适配。
- Root `test:integration:process` 发布后在 Windows 本地无 retry 连续运行 20/20，并逐轮核对没有 owner process、port 或
  temp directory 残留。
- 每票只运行最高层相关验证，不反复运行全仓 `pnpm verify`。最终 cutover ticket 在候选内容上运行一次新的
  `pnpm verify`，并运行 `pnpm check:docs` 与 `git diff --check`。
- 外部资源验证只在对应 ticket 明确需要时使用调用方提供的专用资源；缺失资源必须如实报告，不能 fallback 或伪造通过。

## 交付切片

1. [锁定旧 Collection 基线与目标归属](issues/01-lock-legacy-collection-baseline.md)
2. [用 OIDC 纵切验证 Vitest 多 Profile 迁移](issues/02-prove-vitest-profiles-with-oidc.md)
3. [用 API Core 纵切验证 Bun 与 Process Harness 迁移](issues/03-prove-bun-process-with-api-core.md)
4. [迁移 API 的完整 Canonical Package Surface](issues/04-migrate-api-canonical-surface.md)
5. [迁移 Admin API 与 Worker 的 Canonical Package Surfaces](issues/05-migrate-admin-worker-surfaces.md)
6. [迁移 Database 与 Read-model 资源 Owners](issues/06-migrate-db-read-model-owners.md)
7. [迁移 Pure Shared Packages 与 Gateway Unit Surfaces](issues/07-migrate-shared-gateway-surfaces.md)
8. [迁移 Frontend Unit 与 Mock-browser Surfaces](issues/08-migrate-frontend-browser-surfaces.md)
9. [用 Root Commands 与永久 Guard 封闭 Collections](issues/09-publish-root-collections-and-guard.md)
10. [原子切换默认命令并退役旧入口](issues/10-cut-over-default-commands.md)

## 回滚

整体恢复旧目录、runner、命令、`verify`、Guard 与文档。若下游 feature 已合入，必须先按依赖图逆序回滚
`test-gate-rollout`、`real-redis-test-migration`/`full-system-e2e`，再回滚本 feature。

## 范围外

- 改变 Redis 测试 fidelity、删除 RESP shim 或建设通用 Redis test framework；
- 建立 Full-system E2E、额外 journey、通用 orchestrator 或发布 `test:e2e`；
- 发布 `verify:ci`、`verify:release`、CI provider workflow 或 Linux/CI adoption；
- 建立 run-set taxonomy、运行标签、coverage/JUnit/flaky 平台或通用 runner framework；
- 让 Collection Guard 分析断言、资源、AST/type/data flow；
- 修改无关业务行为、数据库 schema、`CONTEXT.md` 或冻结的 `openspec/`。

## 决策来源

正式实现以本 spec 为 feature 范围来源；背景裁定见 [Wayfinder map](../test-architecture-refactor-wayfinding/map.md)、
[公开测试 interface](../test-architecture-refactor-wayfinding/issues/01-minimize-public-test-language.md)、
[Collection Guard](../test-architecture-refactor-wayfinding/issues/02-rightsize-collection-guard.md)、
[Gate 与原子切换](../test-architecture-refactor-wayfinding/issues/05-set-gate-and-compatibility-evidence.md) 和
[最终 ticket shape](../test-architecture-refactor-wayfinding/issues/07-validate-executable-spec-and-ticket-shape.md)。当前基线见
[测试编排架构](../../docs/architecture/testing-architecture.md)与[构建、测试与开发命令](../../docs/development/commands.md)。
