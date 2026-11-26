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

AFK 在启动时固定调用分支（如 `main`）并保持本地调用分支**全程只读**。每个 Spec 使用位于 `.sandcastle/worktrees/spec-<N>` 的独立集成工作树
与集成分支（复用正文唯一声明的 `feat/<feature-slug>` 或默认 `codex/sandcastle/spec-<N>`）；若该分支已被 `.sandcastle/worktrees/`
之外的外部 worktree 检出，runner 会直接拒绝启动以防干扰外部工作区。每张 ticket 在自己的分支与 worktree 中，
从当前 Spec 集成内容开始实施，交接前整合最新集成内容，并以普通 `git merge` 进入 Spec 集成分支。
容器内的模型会话始终禁止写调用分支、push、创建 PR 或部署。

## 双轴评审子代理生命周期

正式双轴评审在整个 Spec 的全部必要 tickets 已完成实施并普通合入集成分支后执行。部分集成、空子票列表、
issue 的 closed 状态或单票成功声明均不能代替完整集成证据。宿主核对每票交接和 Git 祖先关系，固定本次
review base 与集成 candidate SHA；评审期间工作区和候选保持不变。

1. **并行只读评审**。最终评审协调会话按 [`.agents/skills/code-review/SKILL.md`](../../.agents/skills/code-review/SKILL.md) 新建相互独立的只读 Standards 与 Spec 子代理，
   通过稀疏上下文指针提供同一固定 base/candidate、diff 命令、提交列表与规范来源。两轴都实际结束并取得真实报告才完成评审收集，任一报告缺失、失败或候选不符均保持未完成。
2. **集中修复、最终验证与 `$pr` 描述起草**。由一个实施者会话阅读两轴报告，按票级集成索引与 GitHub Issue 评论核对必要上下文，集中处理全部 findings、提交修复，并按[验证节奏](#验证节奏)执行最终验证。
   沿用手动 `implement-spec` 节奏，不默认循环双轴全量复审；涉及 deep 票时使用 deep 档，其余使用 standard 档。
   全部修复提交与必需验证通过且工作区干净后，该会话读取 [`.agents/skills/pr/SKILL.md`](../../.agents/skills/pr/SKILL.md) 与 [`GLOSSARY.md`](../../GLOSSARY.md)，基于最终 diff 和真实证据生成 `<pr-body>` 草稿
   （包含 `## Summary`、`## Evidence`、`## Merge Danger`）。
3. **交接记录**。宿主校验 `<pr-body>` 结构，并将 review base、评审 candidate、修复后最终 candidate、两轴报告、修复验证材料与 `<pr-body>` 草稿写入父 Spec 评论。
   最终门禁通过只授予推送并创建 PR 的资格，tickets 与父 Spec 在整个 AFK 交付期间保持 open。

整个评审与修复流程只使用一层子代理调用（评审协调者启动两轴子代理，集中修复者作为后续独立根会话运行）。
宿主不解析自然语言 findings 判断通过；修复者逐项说明处置、实际命令结果与未执行项，只有 findings 妥善处理且必需检查全部通过才输出完成标记。会话失败或工作未完成时本轮不重开重试。

## 批量实施

本机 runner 调用 Docker 中的 Codex CLI，按原生 Spec 任务图动态调度，主要阶段如下：

1. **Planner**：宿主分页读取全仓 open `type:spec` 候选、完整原生子票及 blocking 关系，校验父子类型、准入（父 Spec 与待派发子票均须带 `ready-for-agent`）和认领，
   将可信任务图、`ready` / `plannable` 切片与阻塞原因传给 Planner。缺失/冲突类型、关系矛盾、循环依赖或未满足前置条件阻止受影响切片，独立切片仍可推进。
   Planner 每次只选一个 Spec，一次性为本轮可执行及前置集成后解锁的全部计划切片指定实施者（`implementer_light` / `implementer_standard` / `implementer_deep`）并评估是否需要一次共享只读代码探索（`explore.needed`）。
   宿主二次校验计划；后续前置票集成后直接按本次计划确定性派发解锁切片，不重复启动 Planner。
2. **可选 Explorer（共享代码探索）**：仅当 `explore.needed` 为 `true` 时，在准备 Spec 集成工作树后、启动首批 Implementer 前运行一次只读
   `code_researcher` 会话（宿主校验工作树干净且 `HEAD` 未变），将紧凑笔记写入 `.sandcastle/resources/spec-<N>-exploration-<base>.md` 并只读挂载给所有 Implementer，同时写入父 Spec 评论供恢复复用。探索失败时告警跳过，不阻断实施。
3. **Implementer**：每票在独立分支、worktree 和全新会话中读取 `AGENTS.md`、ticket、父 Spec 与相关评论（有共享探索笔记指针时优先读取），
   认领后按 `tdd` 实施、运行完整受影响范围的聚焦验证并提交，报告完成前将最新集成分支 tip 合入本票分支，引入新提交时重跑失效检查并确认工作区干净。
   不逐票运行正式双轴评审、独立验收会话或固定全仓静态检查；必需检查失败或未执行时保持未完成并保留分支与工作树。
4. **Spec 集成与最终验收**：宿主在串行队列中将已完成候选直接普通 merge 到 Spec 集成分支；仅遇真实合并冲突时先 `git merge --abort` 并在本票 worktree 启动一次按需冲突解决会话（遵循 `resolving-merge-conflicts` 并重跑受影响验证）。
   Spec 内依赖以票已集成为解锁依据，ticket 保持 open。单票失败后继续独立切片；所有必要票集成后，按上一节执行集中双轴评审、单实施者修复、最终验证与 `$pr` 正文起草。

GitHub Issues 保存需求与恢复说明，Git 提交保存实现历史；日志和本地分支辅助恢复，不替代 issue 事实。
未完成成果保留在 Spec 集成分支，不自动 reset 或反复挑回失败项；正常进程退出、存在提交或模型宣称完成均不能替代真实验证证据。

## Spec 交付与清理

最终验收交接只授予交付资格。宿主再次核对调用分支、启动基线、评审候选、修复后候选、`<pr-body>` 草稿与各票普通合入的祖先关系，
调用与集成工作树必须干净且创建者已确认停止。调用分支前进、候选变化或交接缺失时保留现场，先整合新基线并更新失效验证（影响评审依据时重评）。

交付由宿主按顺序完成：

1. **非强制推送 Spec 集成分支**：核对远端分支（若远端已有同名分支且非 `finalCandidate` 祖先，立即报错保留现场，绝不强推），推送后核验远端 SHA 精确等于 `finalCandidate` 并绑定 upstream。
2. **幂等创建并核验 PR**：若 `<specBranch> -> <invocationBranch>` 已存在 `headRefOid === finalCandidate` 的 Open PR 则复用，
   否则以 `$pr` 正文为主干、确定性追加逐行 `Closes #<number>`、Integrated Tickets 表及折叠的评审/验证详情，创建 Ready for Review PR（`--draft` 时为 Draft），随后二次读取核验 `state === "OPEN"`、分支与 `headRefOid`。
3. **写交付评论、移出队列并更新看板**：向父 Spec 与全部子票写入含 PR 链接与验证摘要的交付评论，核验移除全部 `ready-for-agent` 标签，并将 GitHub Project `Status` 更新为 `PR Open`。AFK 不关闭 issues，也不改动本地调用分支；维护者在 GitHub 合并 PR 后由 GitHub 自动关票、将看板移入 `Done` 并删除远端分支。
4. **清理临时工作树与 ticket 分支**：再次核对远端 SHA 等于 `finalCandidate` 且待清理路径位于 `.sandcastle/worktrees/` 内并干净未锁后，非强制移除所有 ticket worktrees、CAS 删除本地 `codex/sandcastle/issue-*` 分支、移除 Spec 集成 worktree，**保留本地 Spec 分支 ref** 供人工切出验收调试。

任一步骤失败均停止后续收尾、保留现场并在父 Spec 记录恢复点；下次启动时 runner 扫描残留工作树与 Open PR 状态，对已建 PR 且 `headRefOid` 匹配的现场幂等补完剩余步骤。

跨 Spec 前置交付支持双路径核验：

- **PR 交付记录（现行）**：读取前置交付评论中的 PR 编号与分支，核验 PR 为 `MERGED`、目标分支与调用分支一致且本地调用分支已包含 `mergeCommit.oid`；PR 仍 `OPEN` 时保持阻塞，远端已合入但本地未同步时提示先 `git pull`。
- **本地 squash 记录（历史兼容）**：对历史已通过本地 squash 合入的 Spec，保留原有单一 parent、trailers 与祖先关系核验。

`CLOSED` 状态本身不构成交付证明。恢复按当前 runner 作者、认领与严格 Git 对象核验保护归属，不接管他人工作树。

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
