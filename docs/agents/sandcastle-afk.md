# Sandcastle AFK 工作流

本页定义 Sandcastle AFK 的交接门禁、分支工作区、评审与验证契约及 PR 交付流程，只在准备交接 AFK、运行 AFK 或排障回流时读取。
宿主环境搭建、启动参数、GitHub Projects 看板配置与执行器资源恢复见[AFK 运维与启动手册](../../.sandcastle/README.md#启动与诊断)。

维护者运行 `pnpm sandcastle` 或明确要求启动该路径，即授权本次运行处理全仓 `ready-for-agent` backlog、
推送 Spec 集成分支到远端、创建 Pull Request、评论交接、移除已交付 PR 的 `ready-for-agent` 标签并同步 GitHub Projects 看板；
不包含合入调用分支、关闭 issues 或部署。配置执行器本身不等于启动它。

## 设计与执行交接

在 T3 Code 完成分析设计、准备为 Spec 与 tickets 标记 `ready-for-agent` 并交接给 Sandcastle AFK 前，按顺序完成以下门禁与 Git 准备：

1. **`ready-for-agent` 轻量门禁** 标记 `ready-for-agent` 前，由当前主会话启动一个**同引擎的新鲜只读 subagent**
   （Antigravity 用原生 `research`，Codex 用原生 `code_researcher`）独立核查四项：
   - 每张 ticket 的验收条件客观可测，且已明确测试 seam 与所需验证层级（Unit / Integration / E2E / Gateway）；
   - GitHub 原生父子关系（`--parent`）与阻塞边（`--blocked-by`）完整、无环且覆盖全部前置依赖；
   - 阻塞实现的 `ADR`、`GLOSSARY.md` 与设计决策均已提交到候选集成分支；
   - Spec 正文与本地 Git 状态满足下方 AFK 分支契约。
2. **AFK 候选集成分支契约**（与 [`scripts/sandcastle/core/git.ts`](../../scripts/sandcastle/core/git.ts) 对齐）：
   - **唯一分支声明**：存在设计产物分支时，在 Spec 正文仅声明一行 `集成分支：feat/<feature-slug>`（runner 据此确定唯一归属）；
   - **祖先关系成立**：确保候选集成分支包含当前调用分支（满足 `git merge-base --is-ancestor main feat/<feature-slug>`）；若期间
     `main` 前进，交接前先将最新 `main` 合入候选集成分支；
   - **切回调用分支、对齐远端且工作区干净**：启动 `pnpm sandcastle` 前，将主仓库工作区切回目标调用分支（如 `main`）、保持工作区干净且与远端
     `github/<branch>` 对齐（无未推送本地提交、未落后远端）；设计阶段若使用独立 worktree，必须先移除该外部 worktree（保留分支，避免被 runner 拒绝接管）。
3. **AFK 异常回流（`Needs Attention`）** Sandcastle 因设计歧义或难解失败暂停时，切回 T3 Code 处理：
   - 读取对应 Spec/ticket 的交接评论与集成分支现场；
   - 复杂问题交给 `deep_researcher` 定位根因（见[代码调查与双引擎编排](code-investigation.md)）；
   - 补齐 Spec 或修复阻塞点并重新满足上述分支契约后继续运行 AFK，或经用户确认在 T3 单会话完成收口并走[完成与 PR 交付](workflow.md#完成与-pr-交付)。

## 分支与工作区

AFK 在启动时固定调用分支（如 `main`）并保持本地调用分支**全程只读**。启动和恢复均先 fetch 并校验本地调用分支与远端零偏差。
每个 Spec 使用独立的集成分支，优先复用正文唯一声明的分支，默认使用 `sandcastle/spec-<N>`。每张 ticket 使用独立分支，默认 `sandcastle/issue-<N>`。
可在仓库配置中修改 `workflow.branchPrefix`。原生 `createWorktree()` 管理 `.sandcastle/worktrees/` 下的工作树，例如
`sandcastle-spec-<N>` 和 `sandcastle-issue-<N>`。遇到外部 checkout、锁定或归属不明的路径时停止并保留现场。
票级实施从当前 Spec 集成内容开始，交接前整合最新集成分支，随后由宿主串行合入。
容器内的模型会话始终禁止写调用分支、push、创建 PR 或部署。

## 双轴评审与集中修复

正式双轴评审在整个 Spec 的全部必要 tickets 已完成实施并普通合入集成分支后执行。部分集成、空子票列表、
issue 的 closed 状态或单票成功声明均不能代替完整集成证据。宿主核对每票交接和 Git 祖先关系，固定本次
review base 与集成 candidate SHA；评审期间工作区和候选保持不变。

1. **并行只读评审**。本仓启用双轴评审。宿主通过 `Promise.all` 直接启动独立的 Standards 和 Spec 会话，以同一固定 base/candidate 提供上下文。
   两轴遵循 [`code-review` skill](../../.agents/skills/code-review/SKILL.md) 对应轴的要求。宿主确认两轴均完成、各有非空报告且固定候选未变后，再进入集中修复。
2. **集中修复、最终验证与 `$pr` 描述起草**。由一个实施者会话阅读两轴报告，按票级集成索引、GitHub Spec 与 tickets 核对必要上下文，集中处理全部 findings、提交修复，并按[验证节奏](#验证节奏)执行最终验证。
   集中修复后按失效范围重跑验证。Planner 标记高风险或恢复已有部分或全部票级集成的 Spec 时，最终验证使用 deep 档。
   全部修复提交与必需验证通过且工作区干净后，该会话读取 [`.agents/skills/pr/SKILL.md`](../../.agents/skills/pr/SKILL.md) 与 [`GLOSSARY.md`](../../GLOSSARY.md)，基于最终 diff 和真实证据生成 `<pr-body>` 草稿
   （包含 `## Summary`、`## Evidence`、`## Merge Danger`）。
3. **交接记录**。修复者逐项说明 findings 处置、实际命令结果与未执行项，必需检查全部通过、最终工作树干净时，给出非空 `<pr-body>`，并以完成标记收尾。
   宿主用原生 `Output.string()` 提取草稿，章节由 `$pr` skill 指引。只有已确认完成标记、整个草稿标签缺失且 Provider 支持续接时，才允许补发一次草稿，期间候选须保持不变。
   宿主核对 Git 祖先关系后将两轴报告、修复交接及草稿按最终候选保存到本地状态目录。

## 批量实施

仓库配置为各阶段绑定原生 `AgentProvider`，本仓使用 Docker 中的 Codex CLI。宿主驱动原生任务图。

1. **Planner**。宿主分页读取全仓 open `type:spec` 候选、完整原生子票及 blocking 关系，校验父子类型、准入（父 Spec 与待派发子票均须带 `ready-for-agent`）和认领，
   将可信任务图、`ready` / `plannable` 切片与阻塞原因传给 Planner。缺失/冲突类型、关系矛盾、循环依赖或未满足前置条件阻止受影响切片，独立切片仍可推进。
   Planner 每次只选一个 Spec，为本轮可执行及前置集成后解锁的全部计划切片指定实施者（`implementer_light` / `implementer_standard` / `implementer_deep`）并评估是否需要共享只读代码探索（`explore.needed`）。
   宿主用原生 `Output.object()` 校验计划，支持会话续接的 Provider 最多自动修正两次输出格式。前置票集成后按已校验的计划继续派发。
   调用分支与远端对齐后，Spec 外部 blocker 以 GitHub `CLOSED` 为解阻依据；Spec 内前置票以 Git 集成为依据。
2. **可选 Explorer（共享代码探索）**。配置启用探索且 `explore.needed` 为 `true` 时，在首批实施前运行只读 `code_researcher` 会话。
   宿主校验工作树干净且 `HEAD` 未变，将笔记保存到 `.sandcastle/state/spec-<N>-exploration-<base>.md` 并随上下文传给实施者。
   重启时复用同一 Spec 与基线的笔记；普通探索失败时告警并继续。
3. **Implementer**。每票在独立分支、worktree 和全新会话中读取 `AGENTS.md`、ticket、父 Spec 与相关评论，并利用已提供的共享探索笔记定位代码与验证入口。
   认领后按 `tdd` 实施、运行完整受影响范围的聚焦验证并提交。报告完成前将最新集成分支 tip 合入本票分支，引入新提交时重跑失效检查并确认工作区干净。
   不逐票运行正式双轴评审、独立验收会话或固定全仓静态检查；必需检查失败或未执行时保持未完成并保留分支与工作树。
4. **Spec 集成与最终验收**。宿主串行执行 `git merge --no-ff`，生成含 `Sandcastle-Ticket: #<N>` trailer 的双亲合并提交。
   仅遇真实合并冲突时先 `git merge --abort` 并在本票 worktree 启动一次按需冲突解决会话（遵循 `resolving-merge-conflicts` 并重跑受影响验证）。
   Spec 内依赖以票已集成为解锁依据，ticket 保持 open。单票失败后继续独立切片；所有必要票集成后，按上一节执行集中双轴评审、单实施者修复、最终验证与 `$pr` 正文起草。

GitHub Issues 保存需求与任务图，评论记录供人工查阅的交接与审计信息。未完成成果留在原分支与工作树，等候续做。

## Spec 交付与清理

恢复从 Git 与本地状态开始。宿主在启动基线到 Spec HEAD 的 first-parent 历史中查找有效的双亲合并提交和 `Sandcastle-Ticket: #<N>` trailer，
并校验残留票分支 tip 是该合并第二父提交的祖先。这样可区分已集成票和只留下分支（含零提交）的未完成票。
归属明确的未合入工作树原位复用，已认领时须为当前 GitHub 执行者本人。遇到归属不明或未完成的 Git 操作时保留现场。

`.sandcastle/state/spec-<N>.json` 记录最终验证结果与已确认的 PR，并以精确的最终 HEAD SHA 核对记录。
推送或建 PR 中断后，匹配 HEAD 且验证基线和评审候选祖先关系仍有效时，宿主复用验证结果继续交付。
发现同分支、同目标且 head SHA 匹配的 Open PR 时，可直接续办交付收尾。GitHub 评论用于查阅交接，恢复从 Git、缓存与 PR 核验取得状态。

宿主按以下顺序执行交付。

1. **非强制推送 Spec 集成分支**。核对远端分支。若远端已有同名分支且非 `finalCandidate` 祖先，报错保留现场。推送后核验远端 SHA 精确等于 `finalCandidate` 并绑定 upstream。
2. **幂等创建并核验 PR**。若 `<specBranch> -> <invocationBranch>` 已存在 `headRefOid === finalCandidate` 的 Open PR 则复用，
   否则以 `$pr` 正文为主干、确定性追加逐行 `Closes #<number>`、Integrated Tickets 表及折叠的评审/验证详情，创建 Ready for Review PR（`--draft` 时为 Draft），随后二次读取核验 `state === "OPEN"`、分支与 `headRefOid`。
3. **写交付评论、移出队列并更新看板**。向父 Spec 与全部子票写入含 PR 链接与候选验证摘要的交付评论，核验移除全部 `ready-for-agent` 标签，并在启用看板时同步 `PR Open`。交付期间 issues 保持 open，由维护者在 GitHub 合并 PR 后触发自动关票。
4. **清理临时工作树与 ticket 分支**。再次核对远端 SHA 等于 `finalCandidate`，再回收路径与候选均核验通过的托管工作树。
   通过带预期 tip 的 `git update-ref -d` 删除已集成的本地票分支，保留本地 Spec 分支 ref 供人工验收。

任一步骤失败均停止后续收尾并保留现场。下次启动会从本地待交付状态发现已移出队列的 Spec。核验匹配的 Open PR 后，宿主幂等补完后续步骤。
若调用分支已前进，先同步调用分支，再核验集成分支和验证基线。出现候选或 PR 不匹配时，保留工作树、状态和 PR，按输出的 Git 核验错误检查。

## 验证节奏

通用的聚焦验证、提交 Hook、修复后的结果复用和基线失败处理按[工作流补充](workflow.md#验证节奏)执行。

- **票级实施与冲突解决** 票级实施（以及遇合并冲突时的按需冲突解决）运行完整受影响范围的行为测试、typecheck 和适用文档检查，以及 `git diff --check`。
- **Spec 最终验证** 最终集中修复者以固定 review base 为合入目标，按[验证节奏](workflow.md#验证节奏)为整个 Spec 的最终候选选择基础门禁。
  按父 Spec 与全部 tickets 的风险、验收和已确认测试决策补齐所需 Integration、E2E、Gateway 等检查，重复覆盖按范围去重。
  各票分支结果不替代最终组合验证。
- **Container Smoke 门禁** 集中修复提交后，在候选工作树执行 `pnpm verify:container-smoke --base <review-base-sha>`。
  该命令对比固定 review base 与当前 HEAD，按[命令入口](../engineering/commands.md#container-smoke)的打包路径与生产镜像闭包 `package.json` 语义规则判定命中时，串行追加一次 `pnpm test:e2e:container-smoke`。
  无命中时记录跳过，Git 比较失败时门禁失败。同一最终候选已通过 `pnpm verify:release` 时复用其中的冒烟结果。
  启动分支提供最终验证 prompt，执行器在候选工作树读取本页和运行门禁，因此本次 Spec 引入的门禁也在本次生效。
- **E2E Runtime 门禁** 编排器 Integration 由独立入口 `pnpm --filter @iam/e2e-system test:integration` 运行。集中修复提交后，在候选工作树执行
  `pnpm verify:e2e-runtime --base <review-base-sha>`，按[命令入口](../engineering/commands.md#full-system-e2e)的路径规则串行调用独立入口。
  同一最终候选已通过 `pnpm verify:release` 时可复用对应结果。此要求以候选工作树中的本页为准。
- 后续修复重跑失效检查，仍有效的通过证据可复用。普通交接记录实际命令、结果、对应候选与未执行项；必需检查失败或
  未执行、findings 尚未解决时保持未完成。本轮不通过反复新开会话重试，也不以清理成功或进程正常退出代替验收。
