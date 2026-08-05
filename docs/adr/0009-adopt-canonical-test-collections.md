---
status: accepted
supersedes: 0003-adopt-layered-test-lanes-and-resource-budgets
---

# 采用 Canonical Test Collections 与默认验证切换

仓库采用 Unit、Integration、E2E 三层公开测试语言。Integration 下设六个平级 profile：`component`、`process`、
`redis`、`postgres`、`composition` 与 `browser`。profile 表达资源模型与 harness owner，不是新的测试层级、速度标签或
发布 Gate。

Unit 保留 owner-local 路径，通常是 `src/**/*.test.ts[x]`；Integration 使用
`test-integration/<profile>/**/*.integration.test.ts[x]`，browser 使用
`test-integration/browser/**/*.spec.ts`；Full-system E2E 独占 `e2e/system/**/*.spec.ts`。当前仓库只保留这一路径契约，
不发布 `test:e2e` 占位命令。

Root 长期接口是 `test:unit`、`test:integration` 与六个 `test:integration:<profile>`。`test` 永久代理
`test:unit`；有 Unit collection 的 package 采用相同代理，无 Unit collection 的 package 不发布空 `test`。旧
`test:smoke`、`test:external`、`test:postgres`、`test:redis` 与 frontend `e2e` collection aliases 均删除。
Subject Projection rehearsal 继续作为 `subject-projection:rehearsal` 操作命令，不属于测试 collection。

基础 `verify` 固定按 `static -> typecheck -> test:unit -> build` fail fast。它不读取调用方 PostgreSQL/Redis，
不启动 browser 或 Full-system stack。资源测试由 canonical Integration profile 显式运行；聚合
`test:integration` 在启动任何 profile 前一次性列出所有缺失的 caller-owned resources。

`pnpm check:test-collection` 是永久 Collection Guard。它只观察路径与命名、package canonical task、runner list 和
Turbo dry-run，证明候选文件被唯一收集且 root command 可达 owner task；它不分析断言、资源使用、AST、type 或 data flow。
迁移完成后，旧 baseline、逐文件 mapping、临时 exceptions 与 live equality verifiers 全部退役，永久 Guard 不吸收这些
迁移资产。

本决策取代 [ADR-0003](0003-adopt-layered-test-lanes-and-resource-budgets.md) 的旧普通/smoke/external 通道模型。
ADR-0003 保留为 Historical，记录当时的资源预算与渐进迁移事实；当前可执行契约见
[测试编排架构](../architecture/testing-architecture.md)和[构建、测试与开发命令](../development/commands.md)。
