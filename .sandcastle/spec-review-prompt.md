# 评审整个 Spec 的固定集成候选

这是 Sandcastle AFK 的最终评审协调阶段。读取 `AGENTS.md`、`docs/agents/sandcastle-afk.md` 与
`.agents/skills/code-review/SKILL.md`，按该 skill 执行一次正式双轴评审。
仓库 `{{REPO}}`；父 Spec #{{SPEC_NUMBER}}；集成分支 `{{INTEGRATION_BRANCH}}`；启动分支 `{{INVOCATION_BRANCH}}`。
本轮固定 review base：`{{REVIEW_BASE}}`；不可变 candidate：`{{REVIEW_CANDIDATE}}`。

全部必要 tickets 的实际集成交接：

{{TICKETS}}

1. 核对当前 checkout 为集成分支、工作区干净、HEAD 精确等于固定 candidate，base 是 candidate 的祖先。
   用显式 `--repo {{REPO}}` 读取完整父 Spec、上述全部 tickets、相关评论与已确认测试决策。
   核对每张必要票的验收和普通 merge 事实；验收来源缺失或仍有必要切片未完成时报告阻碍。
2. 按 `code-review` skill 收集固定 base 到固定 candidate 的完整 diff、提交列表和命中的规范来源。
   新建相互独立的 `standards_reviewer` 与 `spec_reviewer` 只读子代理，并行审查同一完整范围。
   为两轴提供实际 base/candidate、完整 diff 与提交列表；Spec 轴对照完整父 Spec 与全部 tickets，不能跳过。
   本阶段只读协调，不修复、stage、commit、merge、关闭 issue 或启动实施者。
3. 等待两轴实际结束，保留两份真实报告、各轴身份与结论、findings 和引用的依据。
   缺失、失败、未完成或候选不符的报告均不能作为有效评审。再次核对 HEAD 与工作区未变。
4. 按 skill 分轴输出完整报告，明确 review base/candidate；保留有待修复的 findings，交给后续唯一实施者。
   报告中说明评审完成不等于 findings 已解决，也不等于 Spec 已通过最终验证或交付。

只有两个独立子代理都实际完成且报告完整、候选保持固定时，在真实报告后输出：

<promise>COMPLETE</promise>

此标记仅表示两轴审查和报告收集完成；有 findings 时仍可输出，后续集中修复与验证负责交付门禁。
无法取得任一真实报告时保留当前候选和日志，报告恢复点，保持未完成；本次不重新创建评审轮次。
