---
status: accepted
---

# 收敛 Sandcastle AFK 至原生 SDK 能力并解耦通用引擎与仓库配置

在 [ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md) 将开发、测试与 AFK 编排运行面统一收敛为纯 Linux 后，过去围绕跨 Windows/Linux 与 `@ai-hero/sandcastle@0.12.0` 缺陷堆叠的 300+ 行编译产物补丁、匿名卷/命名卷管理、自动 `remount` 循环、中文评论反序列化状态机与 ~2,000 行自研 smoke 脚本已失去存在前提。决定将 `@ai-hero/sandcastle` 升级至 `0.14.0`（或更高稳定版）、**彻底移除第三方补丁包并保留无补丁原生 `docker()` 沙箱**，同时将本地 AFK 编排器逻辑解耦为**面向异构技术栈与多 `AgentProvider` 的通用引擎核心**（`scripts/sandcastle/core/`）+ **极薄仓库配置层**（`.sandcastle/config.ts`），并将状态恢复与双轴评审全面收敛至确定性 Git/GitHub 事实与原生 SDK 原语。本决定修订 [ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md) 中临时保留 [patches/@ai-hero__sandcastle@0.12.0.patch](../../patches/@ai-hero__sandcastle@0.12.0.patch) 其余 7 处改动与保留 [workspace-dependencies.mts](../../scripts/sandcastle/workspace-dependencies.mts) 的过渡条款，并针对即将独立复用的 Sandcastle 编排引擎核心修订 [ADR-0009](0009-adopt-canonical-test-collections.md#收集检查与-root-工具链) 中“根工具链不建常驻单测集合”的条款。

我们拒绝直接切换至上游 `bwrap()` 无容器沙箱——尽管纯 Linux/WSL2 下 `bwrap()` 可运行，但保留无补丁 `docker()` 镜像隔离可继续锁死 Agent 侧的运行时与浏览器版本，避免受宿主工具链漂移影响；我们拒绝移除 `@ai-hero/sandcastle` 改为全自研 Docker CLI 封装，因为 `0.14.0` 原生已提供 `createWorktree()`、`onSandboxReady` 严格退出码检查、`protectGitMounts` 只读 `.git` 保护、`Output.object`/`Output.string` 结构化重试、`sandboxId` 与 Codex `turn.failed` 流错误解析；我们也拒绝继续通过正则反序列化 GitHub 中文评论来维持“无本地状态文件”的表象，因为这种隐式协议脆弱、难跨仓库复用且放大了数百行防御性代码。由此接受的代价是：保留 `.sandcastle/Dockerfile` 镜像构建步骤；在 `SIGINT`/`SIGTERM` 强杀时不再由 SDK 补丁拦截信号等待异步清理，若中断恰好发生在集成/E2E 测试容器存活期间，需依赖单次执行器清理或运维命令 `pnpm test:resources:cleanup` 回收残留测试容器；另需在 `.sandcastle/state/` 维护仅用于断点加速的临时本地缓存文件。

## 原生 `docker()` 零补丁运行时与 Crash-Only 生命周期

- **彻底移除 `patches/` 补丁包**。升级至 `@ai-hero/sandcastle@0.14.0` 后，Codex `turn.failed` 流错误解析、`sandboxId` 暴露与 `.git` 控制路径只读保护（`config`/`hooks`/`info` 只读而不阻断 worktree 内 `git commit`/`merge`）均由上游原生提供；纯 Linux 下 `/var/run/docker.sock` 为真实宿主路径，通过原生 `docker({ mounts, groups, network: "host" })` 挂载，不再需要 `daemonSocket` 补丁。
- **退役匿名卷、具名卷与 `remount` 机制**。纯 Linux 宿主与容器同为 UID/GID `1000`，不再存在跨 OS `node_modules` 二进制污染。通过原生 `mounts` 挂载宿主 pnpm store 缓存目录至 `/home/agent/.pnpm-store`，各独立 worktree 直接在自身目录下运行 `pnpm install --frozen-lockfile`，随 worktree 回收一并销毁；彻底删除 `workspace-dependencies.mts`、匿名卷 ID 归属追踪与新增 workspace 自动 `remount` 循环。
- **原生 Worktree 与零 `buildPrintCommand` 魔改**。Spec 集成 worktree 与并行 ticket worktrees 统一交回原生 `createWorktree()` 创建、复用与回收（原生拒绝外部 worktree 冲突并保留本地分支 ref），宿主 Git 薄层只保留 Spec 分支声明解析、串行 `git merge --no-ff`、按需冲突调度、祖先校验与非强制 `git push`。依赖安装与容器内 Git hooks 启用全部走原生 `hooks.sandbox.onSandboxReady`；其中 `hooksCommand` 写入容器临时 `/home/agent/.gitconfig`（`git config --global core.hooksPath /tmp/sandcastle-hooks`），不碰宿主 `.git/config`，不再对 `AgentProvider.buildPrintCommand` 做命令行拼接包装。
- **Crash-Only 信号与单执行器资源隔离**。移除 `SANDCASTLE_HOST_HANDLES_SIGNALS=1` 补丁、临时 HTTP loopback 探针与 `executor.json` 停机审计状态机；`.sandcastle/run.lock` 改为基于 PID 存活探测的 stale lock 自动接管；多 ticket 并行时的集成测试资源隔离由仓库配置通过 `beforeExecutor`/`afterExecutor` 生命周期钩子为每次执行器分配独立 `IAM_TEST_RESOURCE_REGISTRY`，正常退出时仅回收该次登记的 Compose 资源，避免误杀并发中的兄弟票测试环境。

## 通用引擎与仓库配置解耦（异构技术栈与多 Provider）

- **单向依赖边界与守卫**。将 `scripts/sandcastle/` 拆分为纯通用引擎 `scripts/sandcastle/core/`、薄 CLI 入口 `scripts/sandcastle/main.mts` 与本仓适配配置 `.sandcastle/config.ts`。`core/` 严禁引用任何仓库专属标识（`shgas-iam`、`iam-*`、`docker.xuanyuan.run`）、JS/TS 工具链假设（`pnpm`、`bun`、`turbo`、`husky`、`biome`、`playwright`）、[managed-resources.mjs](../../scripts/test-resources/managed-resources.mjs) 或 `.codex/agents/` 私有格式，并由边界单测/守卫持续防止耦合回流，为后续独立拆包多仓复用奠定基础。
- **`defineSandcastleConfig()` 仓库契约**。仓库配置覆盖五类可插拔边界：
  - `repo`：默认从 `git remote get-url` 自动解析 `owner/repo`，支持显式覆盖；
  - `sandbox`：`image`、`dockerfile`、可选 `dockerAccess`（默认 `false`，仅需拉起测试容器的仓库开启）、通用 `mounts`/`env` 与不限定域名的 `dockerAuth`（支持自定义允许的 registry 列表）；
  - `lifecycle`：语言无关的可选钩子 `prepareCommand`、`prepareTimeoutMs`、`hooksCommand`、`beforeExecutor`、`afterExecutor`；
  - `workflow`：引擎无关默认分支前缀 `sandcastle`（`sandcastle/spec-<N>`、`sandcastle/issue-<N>`，Spec 正文声明的 `feat/<slug>` 仍优先）、阶段开关（`explore`、`review`、`projects`）、按阶段可配 `maxIterations`（默认均开启且为 `1`）、可覆写的 GitHub Projects `fieldName`/`stageMap`（未映射阶段静默跳过，不再因缺列阻断 `--check`）；
  - `roles` 与 `authAdapters`：角色直接映射到 Sandcastle 原生 `AgentProvider`（支持 `codex()`、`claudeCode()`、`opencode()`、`pi()` 等，并支持不同阶段或双轴评审混用不同 Provider）与通用指令文本；角色指令统一注入 Prompt 头部，认证适配器按实际配置的 Provider 插件化加载（本仓在 `.sandcastle/config.ts` 中提供 `.codex/agents/*.toml` 薄读取器与 Codex ChatGPT `auth.json` 适配器）。
- **两层 Prompt 与 Skill 优雅回退**。通用流程骨架 Prompt 内置于 `scripts/sandcastle/core/prompts/`，只定义阶段协议、Git/GitHub 护栏与输出契约，统一引导 Agent 阅读 `AGENTS.md`，并在引用 `tdd`、`code-review`、`pr`、`resolving-merge-conflicts` 时遵循“目标仓库 `.agents/skills/` 优先、缺失时回退内置精简规范”。本仓专属验证命令与约束（`verify:container-smoke`、`verify:e2e-runtime`、Bun await 规则、`GLOSSARY.md`、`deep` 档判定标准）统一经 `.sandcastle/config.ts` 的 `promptExtras`（或整份覆盖）注入。

## 宿主并行双轴评审、原生 `Output` 与无评论恢复

- **宿主 `Promise.all` 并行双轴评审**。取消“评审协调会话 + Codex 实验性 `features.multi_agent`/`multi_agent_v2` + 临时角色 TOML 挂载 + `codexConfigProbe`”，改为宿主在固定只读 `reviewCandidate` 上直接并行运行 `standards_reviewer` 与 `spec_reviewer` 两个只读会话，确定性汇集两份原始报告交由集中修复会话；省去协调会话开销并彻底解除对 Codex 私有子代理实现的绑定。
- **原生结构化输出与安全重试边界**。`plan` 阶段采用原生 `Output.object({ tag: "plan", schema, maxRetries: 2 })` 实现格式错误自动 `resume` 修正；`repair-and-verify` 阶段结合 `completionSignal: "<promise>COMPLETE</promise>"` 与原生 `Output.string({ tag: "pr-body", maxRetries: 0 })`（仅在确认收到完成标记却漏包 `<pr-body>` 时才允许补发，绝不催促验证失败的会话伪造 PR 正文）。PR 交付层不对 `<pr-body>` 章节结构做代码级硬校验，仅保证非空提取并按 `$pr` skill 引导生成，由宿主确定性追加 `Closes #<N>` 与元数据。
- **确定性 Git/GitHub 恢复与跨 Spec 解锁**。全面删除中文评论反序列化逻辑与历史本地 squash 交付兼容路径，GitHub Issue 评论退回纯人类可读交接日志：
  - **Spec 内部 ticket 集成事实**：宿主串行 `git merge --no-ff` 固定在 merge commit 中写入确定性 Git trailer `Sandcastle-Ticket: #<M>`；重启恢复时仅当 `<invocationBase>..<specBranch>` 存在带该 trailer 的 merge commit（且若票分支尚存，其 tip 为该提交祖先）才判为已集成，杜绝 0 提交崩溃分支误判；未合入的残留票 worktree 原位复用交给 Implementer 续做并完成验证；
  - **Spec 外部前置依赖**：对当前 Spec 之外的 `blocked_by` 前置，结合启动前的 `git fetch` 与本地调用分支和远端零偏差校验，直接信任 GitHub `state === "CLOSED"`，解决人工关票导致 AFK 永久阻塞的问题；
  - **Finalization 与 Explore 本地缓存**：`explore` 笔记统一缓存于 `.sandcastle/state/spec-<N>-exploration-<base>.md`；`repair-and-verify` 完成后将 `reviewReport`、`repairSummary`、`prBody` 写入按精确 `HEAD` SHA 索引的 `.sandcastle/state/spec-<N>.json`，若推分支/建 PR 期间断网崩溃，重启后校验 SHA 一致即可免重跑评审直接续推；若 Open PR 已存在且 `headRefOid` 匹配，则直接幂等补完交付评论、移出 `ready-for-agent`、更新看板与回收临时 worktrees。

## 测试收敛与文档影响

- **测试与 Smoke 替换**。整体退役 ~2,000 行旧重型 smoke 脚本（`workflow-smoke.mts`、`docker-smoke.mts`、`docker-smoke-service.cjs`、`resource-smoke.mts`、`hook-smoke.mts` 及 `runtime.mts` 内嵌 `smoke()`），替换为三层高价值 Seam：纳入常规 `pnpm test:unit` / `pnpm verify` 的 `scripts/sandcastle/core/` 常驻快速单测（修订 [ADR-0009](0009-adopt-canonical-test-collections.md) 仅针对该编排核心的常驻集豁免，覆盖 DAG 与环检测、Git trailer 恢复、SHA 缓存命中与失效、宿主并行评审、PR 幂等交付与 `Output` 边界）、复用现有 `pnpm check:architecture` 的 `core/` 零反向依赖永久规则，以及一个约 80 行的单容器真 Docker `pnpm sandcastle:smoke`（验证 `onSandboxReady` 依赖安装、容器内 `.husky/pre-commit` 不污染宿主 `.git/config`、`docker.sock` 连通与假 `AgentProvider` 端到端链路）。
- **文档与词表范围**。实施落地时同步更新 [Sandcastle AFK 工作流](../agents/sandcastle-afk.md)、[AFK 运维手册](../../.sandcastle/README.md)、[测试与验证](../engineering/testing.md) 与 [仓库地图](../engineering/repository-map.md)；本决策属于工程工具链与编排架构，不涉及 IAM 业务领域概念，不修改 `GLOSSARY.md`。

[纯 Linux 运行面](0058-standardize-development-and-runtime-tooling-on-linux.md) · [测试集合规范](0009-adopt-canonical-test-collections.md) · [上游优先技能与 AFK 工作流](0004-adopt-upstream-first-matt-skills.md)
