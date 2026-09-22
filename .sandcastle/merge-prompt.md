# 合并本批已完成分支

这是 Sandcastle AFK Merger 阶段，已获得本批本地普通合并、issue 交接与关闭权限。
读取 `AGENTS.md`、`docs/agents/workflow.md` 的 AFK 规则和 `docs/agents/issue-tracker.md`。
GitHub 仓库 `{{REPO}}`，当前合入分支必须是 `{{INVOCATION_BRANCH}}`，本批起点 `{{BASE_SHA}}`。

本批实施者提交完成标记的分支及固定候选 SHA，交付条件由你根据实际交接核对：

{{BRANCHES}}

对应 tickets：

{{ISSUES}}

每次迭代先读取 Git 当前状态和相关 issue 的最新恢复记录，从未完成步骤继续。核对候选是否已合入、是否有待完成的
合并或修复，以及实际关票状态；保留既有工作，避免重复合入、评论或关闭。基线用于核对候选来源，不要求恢复时 HEAD 仍等于基线。

若列表为空，这是队列耗尽前的恢复收尾：分页查询 open `ready-for-agent` issues，只核对已有 implementation tickets 且
所有子票已关闭、代码已在当前分支、整体验收有证据的父 Spec。父 Spec 上次关票失败不需要重新实施子票。
有未满足的验收或未合入代码时保持父 Spec open 并报告阻碍；没有符合收尾条件的父 Spec 时直接报告完成。
对于可以收尾的父 Spec，按下面相同的最终验证和记录规则完成关闭。

1. 核对当前分支和工作区，读取每票的验收评论和两轴真实最终报告，按工作流确认报告对应本批基线与本票固定候选，
   无未解决 findings 且必需验证有效。材料缺失、结论冲突、评审未通过或候选不符时保留现场并报告恢复点，停止合并。
   只合并本列表中的固定候选 SHA。
2. 按依赖顺序逐个执行 `git merge <candidate-sha> --no-edit`。沿用普通 merge，不 squash/rebase。
   遇到冲突，读取 `.agents/skills/resolving-merge-conflicts/SKILL.md`，追溯双方需求并修复。
3. 必要时追加集成修复提交。若合入改变依赖、Umi 配置或路由，先在容器运行 `sh scripts/sandcastle/prepare-workspace.sh`，
   确认成功后再验证。所有本批分支合入后，按工作流“验证节奏”在最终树上运行一次 `pnpm verify`，
   并将本批 tickets/Spec 所需的额外 Integration、E2E 或 Gateway 检查去重后执行；分支测试结果不能替代合并后的验证。
   专用 PostgreSQL/Redis URL 已注入。类型检查或测试失败时先诊断，在本批授权范围内自行修复并继续验证；
   补齐缺失检查，修复后重跑失效的检查，通过后继续收尾。无法自行解决或需要范围外决策时保留现场并报告阻碍。
   不自动 reset，不关闭尚未验收的票，也不能靠删除测试、缩小验收或忽略失败换取通过。
4. 全部必需检查通过后，为已实际合入的每张 ticket 写入候选/合入 SHA、真实验证与评审摘要，再关闭该 ticket。
   所有 `gh issue` 命令显式使用 `--repo {{REPO}}`，多行评论使用 `--body-file`。
5. 若父 Spec 的全部切片和整体验收因此完成，分页核对其所有关联 tickets 与整体验收要求，记录最终验收及本地合入 SHA 后
   关闭父 Spec。不能仅凭本批列表或 Planner 的最多 100 条候选列表判定整个 Spec 已完成。
6. 检查工作区干净，将 ticket 分支留给宿主 runner：它在核对本批全部候选已合入、tickets 已关闭后删除这些本地分支。
   本次仅本地合入，不 push、发布 PR 或部署。

完成所有本批合并、必需验证及实际可关闭票据的更新后输出：

<promise>COMPLETE</promise>

本次迭代结束仍有未完成事项时，在相关 issue 留下已合入的 SHA、修复与验证进展、实际 issue 状态和下一恢复动作，
并在最终回复中报告；issue 更新失败时明确说明。只有满足完成条件才输出完成标记，后续迭代按实际状态继续。
