# 合并本批已完成分支

这是 Sandcastle AFK Merger 阶段，已获得本批本地普通合并、issue 交接与关闭权限。
读取 `AGENTS.md`、`docs/agents/workflow.md` 的 AFK 规则和 `docs/agents/issue-tracker.md`。
GitHub 仓库 `{{REPO}}`，当前合入分支必须是 `{{INVOCATION_BRANCH}}`，本批起点 `{{BASE_SHA}}`。

本批通过实施、评审与静态检查的分支及固定候选 SHA：

{{BRANCHES}}

对应 tickets：

{{ISSUES}}

若列表为空，这是队列耗尽前的恢复收尾：分页查询 open `ready-for-agent` issues，只核对已有 implementation tickets 且
所有子票已关闭、代码已在当前分支、整体验收有证据的父 Spec。父 Spec 上次关票失败不需要重新实施子票。
有未满足的验收或未合入代码时保持父 Spec open 并报告阻碍；没有符合收尾条件的父 Spec 时直接报告完成。
对于可以收尾的父 Spec，按下面相同的最终验证和记录规则完成关闭。

1. 核对当前分支和工作区，读取每票的验收/评审评论。只合并本列表中的固定候选 SHA。
2. 按依赖顺序逐个执行 `git merge <candidate-sha> --no-edit`。沿用普通 merge，不 squash/rebase。
   遇到冲突，读取 `.agents/skills/resolving-merge-conflicts/SKILL.md`，追溯双方需求并修复。
3. 必要时追加集成修复提交。所有本批分支合入后，在最终树上运行一次 `pnpm verify`，以及所有本票/Spec 要求的额外
   Integration、E2E 或 Gateway 检查。专用 PostgreSQL/Redis URL 已注入。必需检查缺失或失败时保留现场、报告恢复点并停止，
   不自动 reset，不关闭尚未验收的票。出现问题不能靠删除测试、缩小验收或忽略失败换取通过。
4. 全部必需检查通过后，为已实际合入的每张 ticket 写入候选/合入 SHA、真实验证与评审摘要，再关闭该 ticket。
   所有 `gh issue` 命令显式使用 `--repo {{REPO}}`，多行评论使用 `--body-file`。
5. 若父 Spec 的全部切片和整体验收因此完成，分页核对其所有关联 tickets 与整体验收要求，记录最终验收及本地合入 SHA 后
   关闭父 Spec。不能仅凭本批列表或 Planner 的最多 100 条候选列表判定整个 Spec 已完成。
6. 检查工作区干净。保留 ticket 分支作为恢复记录；本次仅本地合入，不 push、发布 PR 或部署。

完成所有本批合并、必需验证及实际可关闭票据的更新后输出：

<promise>COMPLETE</promise>

任一步失败时报告已合入的 SHA、实际 issue 状态和下一恢复动作，不输出完成标记。
