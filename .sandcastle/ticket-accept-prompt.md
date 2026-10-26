# 核对票级交接并整合集成基线

本次是成功实施后的票级验收。GitHub 仓库：`{{REPO}}`；父 Spec：#{{SPEC_NUMBER}}；ticket：#{{ISSUE_NUMBER}}。
本票分支：`{{BRANCH}}`；实施基线：`{{BASE_SHA}}`；已交接候选：`{{CANDIDATE_SHA}}`。
Spec 分支：`{{INTEGRATION_BRANCH}}`；本次串行验收固定的集成快照：`{{INTEGRATION_SHA}}`。
最终启动分支：`{{INVOCATION_BRANCH}}`。角色：`{{IMPLEMENTER}}`；选择依据：{{SELECTION_REASON}}。

实施者交接：

{{HANDOFF}}

1. 读取 `AGENTS.md`、工作流及命中文档，用显式 `--repo {{REPO}}` 读取父 Spec、ticket 与必要评论。
   核对交接中的验收、实际验证命令及结果、未执行项与候选。恢复时报告缺失，先核对普通 issue、真实 Git 和已有日志，
   补齐实际未完成的验收、检查与报告；不能仅凭祖先关系或旧成功文字补造通过。无法完成必需工作或仍有未解决事项时报告失败。
2. 确认当前 checkout 为 `{{BRANCH}}`、工作区干净且 HEAD 正好是 `{{CANDIDATE_SHA}}`。
   普通 merge `{{INTEGRATION_SHA}}` 到本票分支。冲突按 `.agents/skills/resolving-merge-conflicts/SKILL.md` 解决，保留双方意图。
   无法确认归属或基线时保留现场，不 reset 或强制覆盖。
3. 根据实际组合变化重跑失效的受影响行为测试、typecheck 和适用文档检查；未失效的真实结果可复用并说明依据。
   保留提交 Hook，必要修复通过普通提交落盘。缺少必需条件或验证失败时保留分支与准确错误，不要求重开失败实施会话。
4. 检查 HEAD 同时包含原候选和集成快照，工作区干净，`git diff --check` 通过。
   最后交接包含父 Spec、ticket、分支、原基线、更新后的实际候选 SHA、验收结论、真实命令与结果、复用依据、未执行项和下一动作。

本阶段只在本票 checkout 整合和验证，不修改 Spec 集成 checkout 或启动分支，不关闭 ticket 或父 Spec。
不启动正式双轴评审，不固定执行全仓 `verify:static`，不执行 squash、push、PR 或部署。
宿主只有在本阶段成功且 Git 核验通过后才普通 merge 到 Spec 集成分支，并写入普通 issue 交接。

全部票级验收及必需验证完成后，在完整交接之后输出：

<promise>COMPLETE</promise>

否则报告恢复点，不输出完成标记。
