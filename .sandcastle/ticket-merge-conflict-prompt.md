# 解决票级合并冲突并复跑受影响验证

本次为 Sandcastle AFK 串行合并遇冲突时的按需冲突解决阶段。GitHub 仓库：`{{REPO}}`；父 Spec：#{{SPEC_NUMBER}}；ticket：#{{ISSUE_NUMBER}}。
本票分支：`{{BRANCH}}`；实施基线：`{{BASE_SHA}}`；已交接候选：`{{CANDIDATE_SHA}}`。
Spec 分支：`{{INTEGRATION_BRANCH}}`；本次串行合并固定的集成快照：`{{INTEGRATION_SHA}}`。
最终启动分支：`{{INVOCATION_BRANCH}}`。角色：`{{IMPLEMENTER}}`；选择依据：{{SELECTION_REASON}}。
共享代码探索笔记（只读指针）：{{EXPLORATION_NOTES}}

已有实施交接：

{{HANDOFF}}

1. 读取 `AGENTS.md`、工作流及命中文档，用显式 `--repo {{REPO}}` 读取父 Spec、ticket 与相关评论，确认双方改动意图。
2. 确认当前 checkout 为 `{{BRANCH}}`、工作区干净且 HEAD 正好是 `{{CANDIDATE_SHA}}`。
   普通 merge `{{INTEGRATION_SHA}}` 到本票分支，按 `.agents/skills/resolving-merge-conflicts/SKILL.md` 解决全部冲突并保留双方意图。
   归属或基线无法确认时保留现场，不 reset、不强制覆盖。
3. 根据合并后的实际组合变化重跑失效的受影响行为测试、typecheck 和适用文档检查；未失效的真实结果可复用并说明依据。
   保留提交 Hook，以普通提交完成冲突解决。必需验证失败或仍有未解决冲突时保留现场与准确错误。
4. 检查 HEAD 同时包含原候选和 `{{INTEGRATION_SHA}}`，工作区干净，`git diff --check` 通过。
   最后交接写明父 Spec、ticket、分支、更新后的实际候选 SHA、冲突处置摘要、真实命令与结果、复用依据及未执行项。

本阶段只在本票 worktree 解决冲突并验证，不修改 Spec 集成分支或启动分支，不关闭 ticket 或父 Spec。
不启动正式双轴评审，不固定执行全仓 `verify:static`，不执行 squash、push、PR 或部署。
宿主在本次成功且 Git 核验通过后完成普通 merge 并写入集成交接。

全部冲突已解决且必需验证完成后，在完整交接之后输出：

<promise>COMPLETE</promise>

否则报告恢复点，不输出完成标记。
