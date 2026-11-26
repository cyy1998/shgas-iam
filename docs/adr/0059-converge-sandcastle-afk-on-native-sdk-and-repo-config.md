---
status: accepted
---

# 收敛 Sandcastle AFK 至原生 SDK 能力并解耦通用引擎与仓库配置

在 [ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md) 将开发、测试与 AFK 编排运行面统一收敛为纯 Linux 后，过去围绕跨 Windows/Linux 与 `@ai-hero/sandcastle@0.12.0` 缺陷堆叠的 300+ 行编译产物补丁、匿名卷/命名卷管理、自动 `remount` 循环、中文评论反序列化状态机与 ~2,000 行自研 smoke 脚本已失去存在前提。决定将 `@ai-hero/sandcastle` 升级至 `0.14.0`（或更高稳定版）、**彻底移除第三方补丁包并保留无补丁原生 `docker()` 沙箱**，同时将本地 AFK 编排器逻辑解耦为**面向异构技术栈与多 `AgentProvider` 的通用引擎核心**（`scripts/sandcastle/core/`）+ **极薄仓库配置层**（`.sandcastle/config.ts`），并将状态恢复与双轴评审全面收敛至确定性 Git/GitHub 事实与原生 SDK 原语。本决定修订 [ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md) 中临时保留 `patches/@ai-hero__sandcastle@0.12.0.patch` 其余 7 处改动与保留 `workspace-dependencies.mts` 的过渡条款，并针对即将独立复用的 Sandcastle 编排引擎核心修订 [ADR-0009](0009-adopt-canonical-test-collections.md#收集检查与-root-工具链) 中“根工具链不建常驻单测集合”的条款。

保留 `docker()` 镜像隔离可以固定 Agent 侧的运行时与浏览器版本，采用 `bwrap()` 则仍受宿主工具链漂移影响。`0.14.0` 原生提供 `createWorktree()`、`onSandboxReady` 严格退出码检查、`protectGitMounts` Git 元数据保护、`Output.object()` 结构化重试、`sandboxId` 与 Codex `turn.failed` 流错误解析，继续使用 SDK 可省去自研 Docker CLI 封装。以 Git 事实和本地缓存恢复执行，能去除 GitHub 中文评论反序列化的隐式协议。保留镜像隔离需继续构建 `.sandcastle/Dockerfile`。运行中断后可能需要通过 `pnpm test:resources:cleanup` 回收残留测试容器，也需保留 `.sandcastle/state/` 中用于恢复的本地缓存。

## 原生 `docker()` 零补丁运行时与 Crash-Only 生命周期

- **彻底移除 `patches/` 补丁包**。升级至 `@ai-hero/sandcastle@0.14.0` 后，Codex `turn.failed` 流错误解析、`sandboxId` 暴露与 `.git` 控制路径只读保护（`config`/`hooks`/`info` 只读而不阻断 worktree 内 `git commit`/`merge`）均由上游原生提供；纯 Linux 下 `/var/run/docker.sock` 为真实宿主路径，通过原生 `docker({ mounts, groups, network: "host" })` 挂载，不再需要 `daemonSocket` 补丁。
- **退役匿名卷、具名卷与 `remount` 机制**。纯 Linux 宿主与容器同为 UID/GID `1000`，不再存在跨 OS `node_modules` 二进制污染。通过原生 `mounts` 挂载宿主 pnpm store 缓存目录至 `/home/agent/.pnpm-store`，各独立 worktree 直接在自身目录下运行 `pnpm install --frozen-lockfile`，随 worktree 回收一并销毁；彻底删除 `workspace-dependencies.mts`、匿名卷 ID 归属追踪与新增 workspace 自动 `remount` 循环。
- **原生 Worktree 与阶段准备**。Spec 和 ticket worktree 由原生 `createWorktree()` 创建和复用，宿主核对归属并负责回收、串行集成、冲突调度及非强制推送。可写阶段通过原生 `onSandboxReady` 安装依赖并用 `hooksCommand` 创建临时提交 Hook wrapper，再通过该阶段的 `GIT_CONFIG_*` 环境变量设置 `core.hooksPath`。宿主 Git 配置保持不变。GitHub 认领和写入均在宿主执行，沙箱使用公开 API 读取任务信息。只读阶段跳过专用 Hook 环境、Docker socket 与可写准备。
- **Crash-Only 信号与单执行器资源隔离**。进程排他由 `.sandcastle/locks/runner` 上的内核 `flock` 提供，PID 只供诊断，强杀后锁随文件描述符关闭而释放。并行 ticket 通过仓库配置的 `beforeExecutor`/`afterExecutor` 为每次执行器分配独立 `IAM_TEST_RESOURCE_REGISTRY`，正常返回并确认沙箱关闭后只回收该次登记的资源。

## 通用引擎与仓库配置解耦（异构技术栈与多 Provider）

- **单向依赖边界与守卫**。将 `scripts/sandcastle/` 拆分为纯通用引擎 `scripts/sandcastle/core/`、薄 CLI 入口 `scripts/sandcastle/main.mts` 与本仓适配配置 `.sandcastle/config.ts`。`core/` 严禁引用任何仓库专属标识（`shgas-iam`、`iam-*`、`docker.xuanyuan.run`）、JS/TS 工具链假设（`pnpm`、`bun`、`turbo`、`husky`、`biome`、`playwright`）、[managed-resources.mjs](../../scripts/test-resources/managed-resources.mjs) 或 `.codex/agents/` 私有格式，并由边界单测/守卫持续防止耦合回流，为后续独立拆包多仓复用奠定基础。
- **`defineSandcastleConfig()` 仓库契约**。仓库配置覆盖五类可插拔边界：
  - `repo`：默认从 `git remote get-url` 自动解析 `owner/repo`，支持显式覆盖；
  - `sandbox`：`image`、`dockerfile`、可选 `dockerAccess`（默认 `false`，仅需拉起测试容器的仓库开启）、通用 `mounts`/`env` 与不限定域名的 `dockerAuth`（支持自定义允许的 registry 列表）；
  - `lifecycle`：语言无关的可选钩子 `prepareCommand`、`prepareTimeoutMs`、`hooksCommand`、`beforeExecutor`、`afterExecutor`；
  - `workflow` 提供默认分支前缀 `sandcastle`，Spec 正文的显式声明优先。核心识别英文声明，仓库可用 `branchDeclarationKeywords` 增加字面关键字。配置还提供默认开启的 `explore`、`review` 和 `projects` 开关、按阶段配置的 `maxIterations`（默认 `1`）、Draft 默认值和可覆写的 GitHub Projects `fieldName`/`stageMap`（跳过未映射阶段）；
  - `roles` 将角色直接绑定到原生 `AgentProvider` 及其指令。高风险修复使用可选的 `repairerDeep`，省略时使用 `repairer`。本仓仅读取 AFK 实际使用的 TOML，按模型与推理档位复用 Codex Provider。预检仅调用匹配已启用 Provider 的 `authAdapters`，本仓的 Codex 文件适配器每轮预检只校验一次共享的 `auth.json`。
- **两层 Prompt**。通用骨架在 `scripts/sandcastle/core/prompts/` 定义阶段协议、Git/GitHub 护栏与输出契约。本仓通过 `promptExtras` 追加或覆盖各阶段指引，注入 `AGENTS.md`、`.agents/skills/`、Bun await 规则、`GLOSSARY.md` 与本仓验证入口。

## 宿主并行双轴评审、原生 `Output` 与无评论恢复

- **宿主 `Promise.all` 并行双轴评审**。宿主在固定只读候选上直接并行运行 Standards 和 Spec 两个独立会话。两轴完成并校验候选未变后，宿主按 review base 与 review candidate 的 SHA 保存报告并交给集中修复。后续恢复可复用同一对 Git 身份的报告。
- **原生结构化输出与重试边界**。`plan` 从当前 Spec HEAD 规划剩余切片（首次使用调用基线），用原生 `Output.object()` 校验结构，支持续接的 Provider 最多自动修正两次格式。`repair-and-verify` 在确认收到完成标记后从 `stdout` 提取非空 `<pr-body>`。若整个标签缺失且有可续接的会话 ID，宿主启动一次只读续接补发草稿，该会话跳过依赖安装和 Hook。章节由仓库 Prompt 约定，宿主确定性追加 `Closes #<N>`、Integrated Tickets 表及限长的折叠详情。
- **聚合任务图与交付校验**。宿主通过分页 GraphQL 聚合 Spec、原生子票、父子关系与 blockers。幂等 GitHub 读取可在临时连接错误后有限退避重试。创建 PR 后按返回编号读取一次进行核验，移出队列时使用议题状态读取，避免逐票重复查 blocker。
- **确定性 Git/GitHub 恢复与跨 Spec 解锁**。全面删除中文评论反序列化逻辑与历史本地 squash 交付兼容路径，GitHub Issue 评论退回纯人类可读交接日志：
  - **Spec 内部 ticket 集成事实**。宿主收到非空验证交接并写入 ticket 评论后，串行执行 `git merge --no-ff`，提交消息只含主题和 `Sandcastle-Ticket: #<M>` trailer。按 `<invocationBase>..<specBranch>` 的 first-parent 双亲合并提交识别已集成票，若票分支尚存，其 tip 须为合并第二父提交的祖先。未合入的票 worktree 原位复用，交给 Implementer 续做和验证。
  - **Spec 外部前置依赖**：对当前 Spec 之外的 `blocked_by` 前置，结合启动前的 `git fetch` 与本地调用分支和远端零偏差校验，直接信任 GitHub `state === "CLOSED"`，解决人工关票导致 AFK 永久阻塞的问题；
  - **Finalization 与 Explore 本地缓存**：`explore` 笔记统一缓存于 `.sandcastle/state/spec-<N>-exploration-<base>.md`；`repair-and-verify` 完成后将 `reviewReport`、`repairSummary`、`prBody` 写入按精确 `HEAD` SHA 索引的 `.sandcastle/state/spec-<N>.json`，若推分支/建 PR 期间断网崩溃，重启后校验 SHA 一致即可免重跑评审直接续推；若 Open PR 已存在且 `headRefOid` 匹配，则直接幂等补完交付评论、移出 `ready-for-agent`、更新看板与回收临时 worktrees。

## 测试收敛与文档影响

- **测试与 Smoke**。纳入常规 `pnpm test:unit` 和 `pnpm verify` 的 Sandcastle 单测覆盖任务图、Git trailer 与 SHA 缓存恢复、并行评审、幂等交付和执行器契约，适用 [ADR-0009](0009-adopt-canonical-test-collections.md) 的局部豁免。`pnpm check:architecture` 检查核心的依赖边界。`pnpm sandcastle:smoke` 使用本地探测 Provider 经真实 Docker 验证只读和可写沙箱的环境隔离、依赖准备、Git 保护、真实提交 Hook、socket、host network 与资源回收。
- **文档与词表范围**。实施落地时同步更新 [Sandcastle AFK 工作流](../agents/sandcastle-afk.md)、[AFK 运维手册](../../.sandcastle/README.md)、[测试与验证](../engineering/testing.md) 与 [仓库地图](../engineering/repository-map.md)；本决策属于工程工具链与编排架构，不涉及 IAM 业务领域概念，不修改 `GLOSSARY.md`。

[纯 Linux 运行面](0058-standardize-development-and-runtime-tooling-on-linux.md) · [测试集合规范](0009-adopt-canonical-test-collections.md) · [上游优先技能与 AFK 工作流](0004-adopt-upstream-first-matt-skills.md)
