# Sandcastle AFK 工作流

本页定义 Sandcastle AFK 的交接门禁、极简核心库边界、分支工作区、评审与验证契约及有序幂等 PR 交付流程，只在准备交接 AFK、运行 AFK 或排障回流时读取。
宿主环境搭建、启动参数与执行器资源恢复见[AFK 运维与启动手册](../../.sandcastle/README.md#启动与诊断)，架构取舍见 [ADR-0059](../adr/0059-converge-sandcastle-afk-on-minimal-extractable-core.md)。

维护者运行 `pnpm sandcastle` 或明确要求启动该路径，即授权本次运行处理全仓 `ready-for-agent` backlog、
推送 Spec 集成分支到远端、创建或复用 Pull Request、在失败时为 Spec 添加 `needs-attention` 标签与原因评论，并在交付完成后移除关联议题的 `ready-for-agent` 标签；
不包含合入目标分支、关闭 issues 或部署。配置或检查执行器本身不等于启动它。

## 核心库与本仓装配边界

AFK 编排按“库而不是框架 + 约定优于配置”拆分：

- **极简可拆分核心库**（[`scripts/sandcastle/core/`](../../scripts/sandcastle/core/index.ts)）：无模块级可变全局状态，导出 `runAfk`、`checkAfk`、`readonlySandbox` 与只读任务图查询 `readSpecGraph`；仅依赖 `node:*`、自身模块与 `@ai-hero/sandcastle`（由 `pnpm check:architecture` 的 `sandcastle-core-dependency-boundary` 规则长期守卫）。
- **本仓极薄装配入口**（[`.sandcastle/run.mts`](../../.sandcastle/run.mts)）：注入 `cyy1998/shgas-iam`、6 个 Codex `AgentSlot`（读自 `.codex/agents/*.toml`）、原生 `docker()` 沙箱工厂（含 `stageCodexAuth`、`withTestResources` 与 `.sandcastle/hooks/`）及仓库专属 [`.sandcastle/prompts/`](../../.sandcastle/prompts/)；启动命令由外层 `flock -n .sandcastle/runner.lock` 保证单实例互斥。

## 设计与执行交接

在 T3 Code 完成分析设计、准备为 Spec 与 tickets 标记 `ready-for-agent` 并交接给 Sandcastle AFK 前，按顺序完成以下门禁与分支准备：

1. **`ready-for-agent` 轻量门禁** 标记 `ready-for-agent` 前，由当前主会话启动一个**同引擎的新鲜只读 subagent**
   （Antigravity 用原生 `research`，Codex 用原生 `code_researcher`）独立核查四项：
   - 每张 ticket 的验收条件客观可测，且已明确测试 seam、所需验证层级（Unit / Integration / E2E / Gateway）与设计期实施档位标签（`agent:light` / `agent:deep`，缺省为 standard，严禁同时打两个档位标签）；
   - GitHub 原生父子关系（`--parent`）与阻塞边（`--blocked-by`）完整、无环且覆盖全部前置依赖；
   - 阻塞实现的 `ADR`、`GLOSSARY.md` 与设计决策均已提交到候选集成分支；
   - Spec 正文与分支占用状态满足下方分支契约。
2. **AFK 候选集成分支契约**：
   - **唯一分支声明**：存在设计产物分支时，在 Spec 正文仅声明一行 `Integration branch: <branch>` 或 `集成分支：<branch>`（未声明时默认 `sandcastle/spec-<N>`）；同一集成分支被多个带 `ready-for-agent` 的 open Spec 声明时会暂停涉及的 Spec。
   - **不要求本地 checkout 对齐或工作区干净**：runner 启动时直接 `git fetch <remote> <baseBranch>`，不读取也不校验本地当前所在分支或工作树状态；维护者可停留在任意分支继续交互开发。
   - **避免外部 worktree 占用集成分支**：若设计阶段曾在独立 worktree 中检出该候选集成分支，交接前先移除该外部 worktree（保留本地分支 ref），避免 runner 拒绝接管已被外部检出的分支。
3. **AFK 异常回流（`needs-attention`）** Sandcastle 因分支冲突、票失败、验证未通过或交付异常暂停时，会给 Spec 添加 `needs-attention` 标签并评论具体阶段与原因，同时保留本地工作树与分支。切回 T3 Code 处理：
   - 读取对应 Spec 的暂停评论、集成分支 `git log --first-parent` 合并交接与本地工作树现场；
   - 复杂问题交给 `deep_researcher` 定位根因（见[代码调查与双引擎编排](code-investigation.md)）；
   - 修复阻塞点并移除 Spec 的 `needs-attention` 后重新运行 `pnpm sandcastle` 续跑，或经用户确认在 T3 单会话完成收口并走[完成与 PR 交付](workflow.md#完成与-pr-交付)。

## 分支与工作区

AFK 启动时通过 `git fetch <remote> <baseBranch>`（默认 `origin` / `main`，可由 `SANDCASTLE_GIT_REMOTE`、`SANDCASTLE_BASE_BRANCH` 覆盖）获取最新远端基线作为新 Spec 分支起点，并保持本地目标分支与当前 checkout **全程不读取、不修改**。双轴评审与已集成票扫描的基线始终由 `git merge-base <specBranch> <remote>/<baseBranch>` 动态推导；运行期间远端 `main` 前进不会导致交付失败、恢复卡死或评审全量重跑，潜在合入冲突交由 GitHub PR 处理。

每个 Spec 使用独立集成分支（正文声明的 `Integration branch:` / `集成分支：` 优先，默认 `sandcastle/spec-<N>`），并在 `.sandcastle/worktrees/` 下维护单一持久 Spec worktree，依次承载串行合并、并行双轴只读评审与集中修复。每张 ticket 使用固定票分支 `sandcastle/ticket-<N>`，其独立工作树由 SDK 原生 `run({ branchStrategy: { type: "branch", branch, baseBranch } })` 管理。遇外部 checkout、锁定或归属不明的路径时停止并保留现场。

安全边界由宿主预检与只读包装保证：预检在启动任何沙箱前拒绝 `.sandcastle/.env` 中出现 `GH_TOKEN` / `GITHUB_TOKEN`（含空值）与 `.git/config` 中的内嵌凭据；只读评审使用核心 `readonlySandbox()`（基于 SDK 公开 `createBindMountSandboxProvider` 将挂载统一设为 `readonly: true`）且不挂载 `docker.sock` 与可写 hooks。容器内模型会话始终禁止写目标分支、push、创建 PR、修改 GitHub 议题或部署。

## 批量实施

本仓为 6 个核心角色槽位绑定原生 Codex `AgentProvider`（`implementLight`、`implementStandard`、`implementDeep`、`reviewStandards`、`reviewSpec`、`repair`，其中 `repair` 固定复用 `implementer_deep`）。宿主直接驱动确定性任务图，**不使用 LLM Planner、Explorer、GitHub Projects 看板或 assignee 认领**。

1. **任务图与候选选择**。宿主经有界两段 `first:100` GraphQL 查询（`readSpecGraph`，先列 open `type:spec` 编号再逐 Spec 读子票、评论与阻塞边以规避 GitHub 50 万节点上限，检测 `pageInfo.hasNextPage` 溢出即显式报错，并经 `retryGhRead` 对瞬断退避重试），先校验集成分支声明并暂停冲突或非法的 `ready-for-agent` Spec，再按编号从小到大选择首个存在就绪票或已完成全部集成的候选 Spec（跳过带 `needs-attention` 的 Spec）。
2. **前沿计算与档位路由**。`specFrontier` 仅判定 `OPEN ∧ type:ticket ∧ ready-for-agent ∧ !needs-attention ∧ 原生父 Spec 匹配 ∧ 无局部环 ∧ 阻塞已满足`（Spec 内前置看 Git 合并提交 trailer，Spec 外前置直接信任 GitHub `CLOSED`）。运行期间给 Spec 新增子票不会暂停整个 Spec。每张票的实施档位直接由设计期标签确定：`agent:light` → `implementLight`、`agent:deep` → `implementDeep`、无档位标签 → `implementStandard`；同时存在 `agent:light` 与 `agent:deep` 时显式报错并暂停 Spec。
3. **宿主注入上下文与并行实施**。所有阶段使用原生 `promptFile` + `promptArgs`，由宿主直接将父 Spec、ticket、评论、阻塞状态、基线 SHA 与角色指令注入 Prompt（本仓在 `.sandcastle/prompts/<phase>.md` 覆写默认模板），沙箱无需联网调用 GitHub API。宿主按 `maxParallel` 并行派发 `ready` tickets；派发每张新票前读取一次 Spec 标签作为软停止开关（移除 `ready-for-agent` 或加上 `needs-attention` 后停止继续派发，保留已完成的进度）。实施者按 `tdd` 实施、运行完整受影响范围的聚焦验证并提交，保持工作树干净并在最终输出中给出验证交接与完成标记 `<promise>COMPLETE</promise>`。
4. **信任边界断言与串行合并**。每次票会话结束后，宿主在串行队列中仅核对两项信任边界断言：（1）票分支 candidate 包含派发基线；（2）Spec 分支 tip 与远端基线跟踪 ref 未被 Agent 移动。校验通过后执行 `git merge --no-ff`，合并提交正文记录票级验证交接并以 `Sandcastle-Ticket: #<N>` trailer 结尾（不再写票级 GitHub 交接评论）。遇真实合并冲突时先 `git merge --abort`，在票分支触发一次 `resolve-conflict` 会话（遵循 `resolving-merge-conflicts`，重跑受影响验证并补充交接），确认包含冲突基线后再合并。单票失败不阻断其他在途独立切片，全部在途任务收尾后若有失败票或未完成前沿则暂停 Spec 并保留现场。

## 双轴评审与集中修复

当 Spec 全部必要 tickets 已完成集成、Spec 工作树干净且前沿完整后，宿主按 `git merge-base <specBranch> <remote>/<baseBranch>` 计算本次 `reviewBase` 并锁定 `candidateSha`，进入集中评审与修复：

1. **并行只读双轴评审与 SHA 缓存**。宿主先查 `.sandcastle/state/review-cache.json` 是否已缓存该 `candidateSha` 的双轴报告；未命中时，在持久 Spec worktree 上以 `branchStrategy: { type: "head" }` 和 `readonlySandbox()` 通过 `Promise.all` 并发运行 `review-standards` 与 `review-spec`（遵循 [`code-review` skill](../../.agents/skills/code-review/SKILL.md) 对应轴要求）。两轴均完成、各有非空报告且 Spec 工作树 `HEAD` 与远端跟踪 ref 未变化后，按 `candidateSha` 写入单文件缓存；后续修复或验证抖动重启时若候选未变即可直接复用报告。
2. **单次集中修复、最终验证与 `$pr` 正文起草**。宿主固定使用 `repair`（`implementer_deep`）角色在持久 Spec worktree 启动单次 `repair-and-verify` 会话，注入双轴评审报告、父 Spec 与全部 tickets，修复者通过 `git log --first-parent` 读取合并提交正文中的票级验证交接，集中处理全部 findings、提交修复并按[验证节奏](#验证节奏)完成最终验证。全部必需检查通过且工作树干净后，按 [`.agents/skills/pr/SKILL.md`](../../.agents/skills/pr/SKILL.md) 与 [`GLOSSARY.md`](../../GLOSSARY.md) 在 `<pr-body>...</pr-body>` 中输出 PR 正文草稿，并以 `<promise>COMPLETE</promise>` 结束。
3. **宿主校验与回退正文**。宿主核对最终工作树干净、最终候选 `finalCandidateSha` 包含评审候选 `candidateSha` 且远端跟踪 ref 未被移动。若会话输出中缺少 `<pr-body>` 草稿，宿主直接拼装包含摘要、`Closes #<number>`、Integrated Tickets 表与分支/SHA 元数据的确定性回退正文，不再补发续接会话。

## Spec 交付与清理

恢复只依赖 Git、GitHub 与单文件评审缓存，不维护额外的本地交付状态机：

- 已集成票集合始终从 `<mergeBase>..<specBranch>` 的 `--first-parent --merges` 双亲合并提交与 `Sandcastle-Ticket: #<N>` trailer 推导；
- 评审报告按 `candidateSha` 缓存在 `.sandcastle/state/review-cache.json`；
- 已创建的 PR 通过 GitHub Open PR 查询（匹配 `headBranch`、`baseBranch` 与 `headRefOid`）发现。

修复与验证通过后，宿主按以下**固定顺序**执行交付（顺序本身即崩溃恢复协议）：

1. **非强制推送 Spec 集成分支**。执行非强制 `git push`（拒绝改写非祖先远端分支），并通过 `git ls-remote` 核验远端 SHA 精确等于 `finalCandidateSha`。
2. **幂等复用或创建 PR**。若 `<specBranch> -> <baseBranch>` 已存在 `headRefOid === finalCandidateSha` 的 Open PR 则直接复用；否则以 `<pr-body>` 草稿（或宿主回退正文）为主干、确定性追加逐行 `Closes #<number>` 与 Integrated Tickets 表，创建 Ready for Review PR（`--draft` / `SANDCASTLE_PR_DRAFT` 时为 Draft），再读取一次 PR 核验 `OPEN` 状态、分支与 `headRefOid`。
3. **移除已集成子票的 `ready-for-agent`**。逐张移除已集成 tickets 的 `ready-for-agent` 标签；issues 保持 open，待维护者在 GitHub 合并 PR 时自动关票。
4. **清理临时工作树与本地票分支**。非强制移除各票及 Spec 的托管工作树（`removeWorktreeSafe`），以带预期 tip 的 CAS 方式（`git update-ref -d`）删除已集成的本地票分支，**保留本地 Spec 分支 ref** 供维护者本地验收。
5. **最后移除父 Spec 的 `ready-for-agent`**。前四步全部成功后才将父 Spec 移出队列。

若在第 5 步之前任意环节中断，父 Spec 仍保留 `ready-for-agent` 留在队列中；下次启动时若检测到所有票已集成且存在 `headRefOid === specTip` 的匹配 Open PR，直接走幂等快路径补完第 3–5 步。任意步骤抛错时，宿主保留现场、给 Spec 添加 `needs-attention` 标签并评论失败原因。

## 验证节奏

通用的聚焦验证、提交 Hook、修复后的结果复用和基线失败处理按[工作流补充](workflow.md#验证节奏)执行。

- **票级实施与冲突解决** 票级实施（以及遇合并冲突时的按需冲突解决）运行完整受影响范围的行为测试、typecheck、适用文档检查与 `git diff --check`。
- **Spec 最终验证** 最终集中修复者以动态计算的固定 `reviewBase`（`merge-base`）为合入目标，按[验证节奏](workflow.md#验证节奏)为整个 Spec 的最终候选选择基础门禁：纯文档差异运行 `pnpm verify:docs --base <review-base-sha>`，其余改动运行 `pnpm verify` 并按父 Spec 与全部 tickets 的风险、验收和已确认测试决策补齐所需 Integration、E2E、Gateway 检查（重复覆盖按范围去重；各票分支结果不替代最终组合验证）。
- **Container Smoke 门禁** 集中修复提交后，在候选工作树执行 `pnpm verify:container-smoke --base <review-base-sha>`。按[命令入口](../engineering/commands.md#container-smoke)的路径与生产镜像闭包规则判定命中时，串行追加一次 `pnpm test:e2e:container-smoke`；同一最终候选已通过 `pnpm verify:release` 时复用其中结果。
- **E2E Runtime 门禁** 集中修复提交后，在候选工作树执行 `pnpm verify:e2e-runtime --base <review-base-sha>`，按[命令入口](../engineering/commands.md#full-system-e2e)的路径规则按需运行编排器 Integration；同一最终候选已通过 `pnpm verify:release` 时复用对应结果。
- 后续修复重跑失效检查，仍有效的通过证据可复用。交接记录实际命令、结果、对应候选与未执行项；必需检查失败或未执行、findings 尚未解决时保持未完成，不输出 `<promise>COMPLETE</promise>`。
