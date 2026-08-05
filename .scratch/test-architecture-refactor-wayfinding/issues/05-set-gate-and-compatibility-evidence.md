# 决定 Gate 与兼容发布的证据契约

Type: grilling

Status: resolved

Blocked by: 01 — 收敛公开测试语言与最小命令面；02 — 决定 Collection Guard 的最小职责与退出策略；03 — 收敛真实 Redis 迁移的最小测试 seam；04 — 收敛 Full-system E2E 的最小系统边界

## Question

在默认 `pnpm verify = static → typecheck → test:unit → build` 且所有 Integration 显式运行的目标不变时，怎样定义最小、
provider-neutral 的本地、CI 和 release gate 合约，以及旧入口至少一个发布周期保持原语义的切换证据，才能避免 silent skip
又不构建一套尚无 CI 消费者的门禁框架？

本 ticket 需要与维护者共同决定：

- `verify:ci`、`verify:release` 是否是必要的稳定入口，以及它们只组合哪些已存在的 canonical commands；
- 旧 `test:smoke/external/postgres/redis` 与前端 `e2e` aliases 如何提示弃用但维持原 collection；
- collection equality、Windows 连续运行、Linux/CI pending/通过和 Full-system E2E 证据分别阻断哪一步；
- gate 切换如何保持可回滚，且失败时不会留下“新旧入口都漏跑”的空窗；
- 哪些证据属于 feature 验收，哪些必须等具体 CI 平台建立后再收集。

不得创建 provider workflow、机器 evidence 状态机、通用 receipt/transcript 系统，或把尚未运行的跨平台脚本兼容性写成已验收。

## Answer

维护者确认把 Gate 命令契约、命令发布和真实平台启用分开。本 ticket 只决定 provider-neutral 的命令契约、在当前
Windows 本地环境可取得的发布证据，以及旧入口的原子切换；不讨论或设计真实 CI、Linux runner、观察运行、平台强制门禁
或其启用阈值。

### 长期 Gate interface

长期 root Gate 只有：

```text
pnpm verify
  static -> typecheck -> test:unit -> build

pnpm verify:ci
  verify -> test:integration

pnpm verify:release
  verify:ci -> test:e2e
```

`verify:ci` 是 provider-neutral 的验证目的名称，不表示仓库已经接入或验收任何 CI。真实 CI/Linux runner 的选择、证据和
强制门禁启用属于未来独立工作；本计划不得把 Windows 本地通过写成 CI 通过，也不以尚不存在的平台证据阻断上述命令发布。

三个 Gate 都按所列顺序 fail fast，后续阶段不会在前序非零退出后继续执行。它们只组合 canonical commands，不引入新的测试
层级、run-set taxonomy、provider workflow 或 Gate framework。

### 发布条件与证据分工

不发布尚未完整工作的占位 Gate，不允许缺能力时返回成功、silent skip 或只打印 warning：

1. `verify` 只有在 Unit 与 Integration collection 已分离、全部测试文件都有唯一 canonical collection，且迁移期 collection
   equality 通过后才切换为新语义。最终候选树上的 Windows 本地聚合证据为 `verify` 连续 `3/3` 通过。
2. `verify:ci` 只有在六个 Integration profiles 均有可运行的 canonical command、资源预检与非零失败行为，且各自的 owner
   feature 已完成验收后才发布。最终候选树在调用方提供全部专用资源时运行一次完整 `verify:ci` 并通过。
3. `verify:release` 只有在 Full-system E2E 的两条首期 journey、干净启动、诊断和精确清理均由其 owner feature 验收后才
   发布。最终候选树从干净 E2E 环境运行一次完整 `verify:release` 并通过。

各 owner feature 负责证明自己的详细能力：collection 迁移证明不漏收、不重收；process Integration 在 Windows 连续
`20/20` 且无残留进程、端口或临时目录；Redis/PostgreSQL/browser 等资源 profile 证明有专用资源时通过、缺资源时明确失败；
Full-system E2E 证明两条 journey、失败诊断、中断路径和 project-scoped cleanup。Gate rollout 不复制这些细节，只在最终树上
运行上述聚合证据。所有连续或聚合证据都不得依赖 retry，也不得把 cleanup 失败降级为 warning。

### 缺资源时的失败所有权

资源规则留在真正拥有资源生命周期的 command，不建立第二套统一预检 Module：

- `test:integration` 在启动任何 profile 前一次性检查全部必需的 PostgreSQL、Redis 与 browser 条件，列出所有缺项后非零退出；
- `test:e2e` 在创建任何 project resource 前检查 Docker、browser 和必要配置，缺项时非零退出；
- `verify:ci` 与 `verify:release` 只调用上述 command 并透传非零结果，不复制 URL、browser、Docker 或 cleanup 规则；
- cleanup 本身失败时，所属 command 及上层 Gate 都必须失败。

删除测试表明，资源预检若从 owner command 移出，会在 Gate 与 profile 间产生重复规则；删除独立 Gate/evidence framework 后，
复杂度不会分散，因为三个 root Gate 只需固定顺序组合现有 canonical commands。因此不建设通用 resource detector、receipt
collector 或 evidence orchestrator。

### 旧入口的原子切换与回滚

本答案遵守「收敛公开测试语言与最小命令面」：除永久 `test -> test:unit` 外，不保留 `test:smoke`、`test:external`、
package-local `test:postgres`/`test:redis` 或前端 `e2e` 的 migration aliases，也不恢复“至少保留一个发布周期”的旧假设。

每个旧入口只能在其替代 collection 已完整时删除：迁移 feature 先从固定旧树取得 runner collection 基线，在候选树证明对应新
canonical collections 的并集与基线相等、每个文件恰好出现一次，再在同一次可回滚变更中启用新入口并删除旧入口。验证失败则
该切换不得合并；切换后发现回归时整体 revert 该次变更，使旧 command 与旧 collection config 一同恢复。不得先删后补，也不得
让新旧入口同时漏收。

迁移基线、映射与例外继续只由相关迁移 feature tracker 持有；达到唯一 canonical collection、例外归零和旧 config 删除条件后，
按「决定 Collection Guard 的最小职责与退出策略」整体删除。长期只保留 `check:test-collection` 的当前 collection contract。

### 证据记录

验证结果只在未来各 feature 的 ticket 或 `delivery.md` 中保存简短、人类可读的摘要，说明实际平台、命令、通过次数、是否重试
以及资源清理结果，例如 Windows `verify 3/3`、带专用资源的 `verify:ci 1/1` 和干净 E2E 环境的
`verify:release 1/1`。不提交完整日志、JSON receipt、manifest、transcript 或机器 evidence 状态，不记录 URL credential、
Token、Secret 等敏感配置。

后续若实质修改对应 collection、runner、Gate 顺序、资源预检或 lifecycle，重新运行受影响的验收；无关改动不自动使全部证据
失效。本计划不建立 candidate SHA schema、证据新鲜度计算或持久状态机。
