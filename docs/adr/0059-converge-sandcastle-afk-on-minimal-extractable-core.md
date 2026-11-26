---
status: accepted
---

# 收敛 Sandcastle AFK 至原生 SDK 与极简可拆分核心库

在 [ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md) 将开发、测试与 AFK 编排运行面统一收敛为纯 Linux 后，围绕 `@ai-hero/sandcastle@0.12.0` 与跨平台兼容堆叠的第三方编译产物补丁、匿名卷/命名卷管理、`remount` 循环与中文评论反序列化状态机已失去存在前提；而首轮重写中基于“框架 + 声明式配置 + LLM Planner + 本地双写恢复 + Projects 看板”堆出的 3,200+ 行实现也暴露了大量人为复杂性与 `main` 前进导致的交付卡死缺陷。

决定将 `@ai-hero/sandcastle` 升级至 `0.14.0`（或更高稳定版）、**彻底移除第三方补丁包并保留无补丁原生 `docker()` 沙箱**，同时采用**“库而不是框架 + 约定优于配置”**将 AFK 编排收敛为**零仓库耦合的极简可拆分核心库**（`scripts/sandcastle/core/`）与**极薄仓库装配入口**（`.sandcastle/run.mts`），仅保留 Git 与 GitHub 两处持久事实，以原生 SDK 原语和确定性步骤顺序取代冗余本地状态机与防御性包装。

> _Contradicts [ADR-0004](0004-adopt-upstream-first-matt-skills.md) (`采用上游工作流与仓库薄适配`) — 取代其中 AFK 以 GitHub Projects `Status` 列同步看板进度、启动前要求调用分支与远端零偏差对齐以及跨 Spec 依赖核验 PR `mergeCommit` / 历史 squash 的条款；改用 `needs-attention` 标签加暂停评论、`origin/<base>` 与 `merge-base` 动态基线，以及直接信任外部阻塞票 `CLOSED`。_

本决定同时修订 [ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md) 中临时保留 `patches/@ai-hero__sandcastle@0.12.0.patch` 与 `workspace-dependencies.mts` 的过渡条款，并针对独立可拆分的 Sandcastle 核心库及其安全/恢复边界回归保护修订 [ADR-0009](0009-adopt-canonical-test-collections.md#收集检查与-root-工具链) 中“根工具链不建常驻单测集合”的条款。

## 原生 `docker()` 零补丁运行时与最小安全边界

- **彻底移除 `patches/` 补丁包与卷重建机制**。升级至 `@ai-hero/sandcastle@0.14.0` 后，Codex `turn.failed` 流错误解析、`sandboxId` 暴露与 `.git` 控制路径只读保护（`protectGitMounts`）由上游原生提供；纯 Linux 下通过原生 `docker({ mounts, groups, network: "host" })` 挂载 `/var/run/docker.sock` 与宿主 pnpm store 缓存目录，各独立 worktree 直接安装依赖并随 worktree 销毁，彻底删除 `workspace-dependencies.mts`、匿名/具名卷追踪与 `remount` 循环。保留 `docker()` 镜像隔离以固定 Agent 侧运行时与浏览器版本（代价是继续维护 `.sandcastle/Dockerfile`）。
- **只读评审与凭据隔离无猴补丁化**。由于 SDK 的 `resolveEnv()` 会将 `.sandcastle/.env` 中声明的 key 注入每次沙箱启动，预检必须继续拒绝 `.sandcastle/.env` 中的 `GH_TOKEN` / `GITHUB_TOKEN` 与 `.git/config` 中的内嵌凭据；据此删除运行期猴补丁 env 剥离。只读双轴评审通过公开 API `createBindMountSandboxProvider` 做极薄只读包装（将 `options.mounts` 统一置为 `readonly: true`），并在 Spec 持久 worktree 上 `Promise.all` 并发执行（避免并发 `branchStrategy` 提前移除同一 worktree）；可写阶段通过原生 `run({ branchStrategy: { type: "branch" } })` 管理票级 worktree。
- **外部内核排他锁与资源兜底**。删除自研 Node `flock` 封装，由外层启动命令直接通过 `flock -n .sandcastle/runner.lock` 保证单实例排他。本仓可写阶段挂载独立测试资源 registry，清理完成后一并回收空的 `executor-*` 目录；Codex 认证暂存回写遇并发刷新冲突时降级告警，不令已完成的票失败。

## 极简可拆分核心库（Library, not Framework）

- **单向依赖边界与未来独立演进**。`scripts/sandcastle/core/` 仅依赖 `node:*`、自身模块与 `@ai-hero/sandcastle`，严禁引用任何仓库专属标识、JS/TS 工具链假设、[managed-resources.mjs](../../scripts/test-resources/managed-resources.mjs) 或 `.codex/agents/` 私有格式，并由 `pnpm check:architecture` 的 `sandcastle-core-dependency-boundary` 规则长期守卫。暂不放入 `packages/*` 以避免卷入业务 Turborepo 构建链；未来拆分为独立 npm 包或仓库时可直接整体迁出。
- **反转控制与最小接口**。核心不再作为 CLI 框架去加载 `.sandcastle/config.ts`，而是导出无全局可变状态的库函数 `runAfk(options)`、`checkAfk(options)`、`readonlySandbox` 与只读图查询 `readSpecGraph`。彻底删除 `defineSandcastleConfig`、`AuthAdapter`、`LifecycleConfig`、`DockerAuthConfig`、`ProjectConfig`、`WorkflowConfig` 开关、`maxIterations` 与 `promptExtras`。仓库在 `.sandcastle/run.mts` 中直接传入 `repo`、6 个原生 `AgentProvider` 槽位（支持附带 `instructions`）以及单一 `sandbox`（静态 `BindMountSandboxProvider` 或按 `phase`/`readonly`/`runId` 返回 `{ sandbox, hooks, cleanup }` 的工厂函数）。核心无模块级可变单例并导出 `readSpecGraph`，为后续多项目 AFK 管理看板（聚合只读图、扩展 `onEvent` / `AbortSignal`）保留零重构演进空间。
- **固定工作流约定（不做可配置膨胀）**。
  - **标签与档位**：固定使用 `type:spec`、`type:ticket`、`ready-for-agent`、`agent:light`、`agent:deep`、`needs-attention`。实施档位由设计期 ticket 标签决定（无标签为 standard），修复固定使用 deep 角色；彻底删除 LLM Planner、Explorer、GitHub Projects 看板与 assignee 认领。
  - **Prompt 原生模板与宿主注入**：核心内置 5 个阶段默认模板（`implement`、`resolve-conflict`、`review-standards`、`review-spec`、`repair-and-verify`），仓库按 `.sandcastle/prompts/<phase>.md` 文件名约定覆写；所有阶段使用原生 `promptFile` + `promptArgs`，由宿主直接注入父 Spec、ticket、评论与角色指令（彻底消除沙箱匿名请求 GitHub REST 触发 60 次/小时/IP 限额的问题）。
  - **分支约定**：集成分支声明固定匹配 `Integration branch:` / `集成分支：`，同一集成分支冲突检查仅针对带 `ready-for-agent` 的 open Spec；票分支固定为 `sandcastle/ticket-<N>`。

## 确定性基线、Git/GitHub 双事实与有序交付

- **以 `origin/<base>` 与 `merge-base` 取代冻结调用分支**。runner 启动时通过 `git fetch <remote> <baseBranch>`（默认 `origin` / `main`）获取最新远端基线作为新 Spec 分支起点，不读取也不校验本地当前 checkout 分支或工作区状态；双轴评审基线始终由 `git merge-base <specBranch> <remote>/<baseBranch>` 动态推导。运行期间 `main` 前进不再造成交付失败、恢复卡死或评审全量重跑，潜在合并冲突由 GitHub PR 处理。
- **以边界断言与交付顺序取代本地双写状态**。
  - **集成事实与边界断言**：并行派发 `ready` tickets，宿主在串行队列中以 `git merge --no-ff` 合入 Spec 分支，提交消息包含 `Sandcastle-Ticket: #<N>` trailer 并将票级验证交接直接写入合并提交正文（删除票级 GitHub 交接评论与子票交付评论）；真实冲突交由一次冲突解决会话处理。Agent 会话结束时仅在信任边界执行两项断言：candidate 包含派发基线、Spec tip 未被 Agent 移动；派发新票前读一次 Spec 标签作为软停止开关。
  - **有界 GraphQL 与简化前沿**：任务图读取采用有界两段 `first:100` GraphQL 查询（先列 open Spec 编号，再逐 Spec 读子票、评论与阻塞边，规避 GitHub 50 万节点上限，任一连接溢出即显式报错）配瞬断重试 `retryGhRead`；`specFrontier` 简化为 `open ∧ ready-for-agent ∧ 未集成 ∧ 阻塞已满足`（Spec 外部前置直接信任 `CLOSED`）；运行中新增草稿子票不暂停整个 Spec，新增已批准 `ready-for-agent` 子票在评审前刷新纳入。
  - **交付顺序即恢复协议**：保留以 candidate SHA 为键的单文件评审缓存（避免修复/验证抖动时重跑双轴评审），删除探索缓存、交付证据缓存、`pendingDeliveries` 与 `recoveringDelivery`。修复并验证通过后，按固定顺序执行：**非强制 `git push` → 复用或创建 PR（缺失 `<pr-body>` 时回退宿主拼装正文，不做补发会话）→ 移除子票 `ready-for-agent` → 清理临时 worktrees 与票分支 → 最后移除 Spec `ready-for-agent`**。在最后一步之前崩溃，Spec 仍留在队列中，重启发现已有匹配 Open PR 即可幂等补完收尾；暂停失败时加 `needs-attention` 标签并在 Spec 评论原因。

## 测试收敛与文档影响

- **常驻回归保护与 Smoke**。`pnpm test:unit:sandcastle`（纳入 `pnpm test:unit` 与 `pnpm verify`）常驻覆盖核心任务图、Git trailer 恢复、边界断言、并行合并与冲突、双轴评审 SHA 缓存、有序幂等交付、只读沙箱包装，以及本仓 Codex 角色/认证回写降级与测试资源回收；`pnpm check:architecture` 守卫 `scripts/sandcastle/core/` 零反向依赖；`pnpm sandcastle:smoke` 经真实 Docker 验证只读与可写隔离、hook、socket 与资源回收。
- **文档与词表范围**。实施落地时同步更新 [Sandcastle AFK 工作流](../agents/sandcastle-afk.md)、[GitHub 议题跟踪](../agents/issue-tracker.md)、[Triage Labels](../agents/triage-labels.md)、[AFK 运维手册](../../.sandcastle/README.md)、[测试与验证](../engineering/testing.md)、[仓库地图](../engineering/repository-map.md) 与 [ADR-0004](0004-adopt-upstream-first-matt-skills.md)；本决策属于工程工具链与编排架构，不涉及 IAM 业务领域概念，不修改 `GLOSSARY.md`。

[纯 Linux 运行面](0058-standardize-development-and-runtime-tooling-on-linux.md) · [测试集合规范](0009-adopt-canonical-test-collections.md) · [上游优先技能与 AFK 工作流](0004-adopt-upstream-first-matt-skills.md)
