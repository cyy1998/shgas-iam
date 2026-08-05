# 测试 Gate 发布

## 问题陈述

基础 `verify`、六个 Integration profiles 与 Full-system E2E 分属不同能力 owner。若在这些能力完成前先发布
`verify:ci`/`verify:release`，容易出现 placeholder、silent skip 或 warning-only success；若 Gate 自己重新检测资源、采集
诊断或管理 cleanup，又会复制 owner commands 的 contract 并随时间漂移。

维护者需要在全部 owner capabilities 完整后，以最浅的 provider-neutral composition 发布两级上层 Gate，并在最终候选树上
取得真实、无 retry、可人工阅读的聚合证据，同时准确保留 Linux/真实 CI 为 `pending`。

## 方案

本 feature 只在 [真实 Redis 测试迁移](../real-redis-test-migration/spec.md) 与
[Full-system E2E](../full-system-e2e/spec.md) 都完成后开始；[Canonical Collection 与命令迁移](../test-collection-migration/spec.md)
是二者的传递依赖，不增加冗余直连 blocker。

在同一 root orchestration change 中发布：

```text
pnpm verify:ci
  verify -> test:integration

pnpm verify:release
  verify:ci -> test:e2e
```

两个命令严格按顺序 fail fast，只组合已存在的 owner commands 并透传原始非零结果。第二张 ticket 在最终候选树运行约定的
Windows、本地全资源和干净 E2E 聚合 evidence，再收口三个 Gate 的 Current docs/adoption 状态。

## 实施决策

### Provider-neutral Gate interface

`verify:ci` 表达验证目的，不代表仓库已经接入任何 CI provider；`verify:release` 同样不代表部署或发布授权。两个 Gate 不读取
PostgreSQL/Redis URLs、不检查 browser/Docker、不解释 profile failure，也不复制 descriptor、diagnostics 或 cleanup。

资源和失败所有权保持在 owner commands：

- 基础 `verify`、`test:integration` 与一次性 resource preflight 由 `test-collection-migration` 拥有；
- 真实 Redis fidelity 与 destructive cleanup safety 由 `real-redis-test-migration` 拥有；
- `test:e2e`、descriptor、diagnostics 与 exact-project cleanup 由 `full-system-e2e` 拥有。

Gate 只验证顺序、fail-fast、未启动下游和 exit/signal propagation。`verify` 失败时不启动 Integration；`verify:ci` 失败时不创建
E2E project；`test:e2e` 或 cleanup failure 必须保留 owner 诊断并使顶层非零。

### 发布与证据

两个 Gate 在依赖能力完整前不得出现。最终候选树无 retry 地取得：

1. Windows 本地 `pnpm verify` 连续 3/3；
2. 调用方提供全套专用资源时 `pnpm verify:ci` 1/1；
3. 干净 E2E 环境中 `pnpm verify:release` 1/1。

证据只记录实际平台、命令、次数、是否 retry 与资源清理结果；不提交完整日志、JSON receipt、manifest、transcript 或机器证据
状态，也不记录 URLs、credentials、tokens 或 secrets。任一组失败都阻止 feature 合入，不能通过重跑筛选绿色样本。

Windows 本地结果不能表述为 Linux/CI runner 已验收。真实 provider workflow、runner 选择、观察运行、branch gate 与平台启用
阈值属于未来独立工作，不阻塞 provider-neutral 命令发布。

### 文档所有权

本 feature 只更新 `verify`、`verify:ci`、`verify:release` 的最终组合、聚合 evidence 和 adoption 状态，并对 Current 测试架构与
命令文档做一致性收口。Collection、资源 preflight、Redis、E2E lifecycle 与 cleanup 的详细 contract 只链接各 owner spec，
不在 Gate 文档复制。

## 迁移不变量

- `verify:ci` 与 `verify:release` 在同一 ticket 一次发布，且依赖能力开始前已经完整。
- Gate 只顺序组合 owner commands 并透传失败，不复制任何资源、diagnostics 或 cleanup 规则。
- 不允许 placeholder、silent skip、warning-only success、retry-to-green 或失败后继续下游。
- Windows 本地通过不表述为 Linux/CI adoption；命令名不授权 provider workflow、merge、release 或部署。
- 不建立 resource detector、receipt/manifest/transcript、evidence state machine 或通用 Gate framework。

## 验收标准

- Root orchestration 外部行为覆盖三个 Gate 的完整顺序、success、各阶段 failure、下游未启动和 cleanup failure propagation。
- `verify:ci` 只执行 `verify -> test:integration`；`verify:release` 只执行 `verify:ci -> test:e2e`。
- 两个命令不读取资源配置、不复制 preflight/descriptor/diagnostics/cleanup，也不解释 owner failure。
- Windows `verify` 3/3、全资源 `verify:ci` 1/1、干净 E2E `verify:release` 1/1 均无 retry，且 cleanup 结果明确。
- Evidence 摘要不包含 sensitive configuration 或完整日志；Linux/真实 CI 明确保持 `pending`。
- Current docs 的三个 Gate 语义、证据与 adoption 状态一致，并只链接 owner contracts。

## 测试决策

- 使用受控 child commands 从 root orchestration 的公开行为验证完整顺序、fail-fast、未启动下游与 exit/signal propagation。
- 聚焦测试覆盖基础 `verify` failure、Integration failure、E2E 未启动、E2E assertion failure 与 cleanup failure。
- Ticket 01 只运行可控 orchestration tests、受影响 tooling lint/typecheck 与 `git diff --check`，不提前运行实际聚合 evidence。
- Ticket 02 在最终候选树上按约定运行三组真实 evidence；每组均无 retry，并运行 `pnpm check:docs` 与 `git diff --check`。
- Gate spec 不复测 owner feature 的全部细节；失败诊断仍由对应 owner command 提供。

## 交付切片

1. [发布完整 Provider-neutral Gate Interface](issues/01-publish-provider-neutral-gates.md)
2. [取得最终聚合证据并收口 Current Docs](issues/02-capture-final-evidence-and-docs.md)

## 回滚

只撤回 `verify:ci`、`verify:release` 与最终 evidence/docs 收口；保留基础 `verify`、canonical Unit/Integration、真实 Redis 与
`test:e2e` owner features。

## 范围外

- GitHub Actions、GitLab CI 或其他 provider workflow，Linux/CI runner 启用、branch protection 或强制 gate；
- Resource detector、通用 preflight Module、machine receipt/manifest/transcript、evidence state machine 或 retry framework；
- 提高 Redis/PostgreSQL/browser/E2E 并发，建立 coverage/JUnit/flaky 平台；
- 修改 owner commands 的 collection、resource、diagnostics、cleanup 或 journey contract；
- 修改无关业务行为、数据库 schema、`CONTEXT.md` 或冻结的 `openspec/`。

## 决策来源

正式实现以本 spec 为 feature 范围来源；背景裁定见 [Wayfinder map](../test-architecture-refactor-wayfinding/map.md)、
[Gate 与兼容发布契约](../test-architecture-refactor-wayfinding/issues/05-set-gate-and-compatibility-evidence.md)、
[Feature 边界](../test-architecture-refactor-wayfinding/issues/06-decide-feature-spec-boundaries.md)和
[最终 ticket shape](../test-architecture-refactor-wayfinding/issues/07-validate-executable-spec-and-ticket-shape.md)。当前基线见
[测试编排架构](../../docs/architecture/testing-architecture.md)与[构建、测试与开发命令](../../docs/development/commands.md)。
