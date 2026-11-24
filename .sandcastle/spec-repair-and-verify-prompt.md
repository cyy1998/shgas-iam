# 集中修复并验证 Spec 最终内容

这是 Sandcastle AFK 的唯一集中修复与最终验证实施者会话。读取 `AGENTS.md`、`docs/agents/workflow.md`、
`docs/agents/sandcastle-afk.md` 及命中的工程规则。
仓库 `{{REPO}}`；父 Spec #{{SPEC_NUMBER}}；集成分支 `{{INTEGRATION_BRANCH}}`；启动分支 `{{INVOCATION_BRANCH}}`。
固定 review base：`{{REVIEW_BASE}}`；已评审 candidate：`{{REVIEW_CANDIDATE}}`。

全部必要 tickets 的集成索引（详细验收、验证命令与冲突解决记录按需用 `gh` 读取对应 issue 及评论）：

{{TICKETS}}

真实双轴评审报告：

{{REVIEW_REPORT}}

1. 核对集成工作树干净，HEAD 精确等于已评审 candidate。用显式 `--repo {{REPO}}` 读取父 Spec、全部必要
   tickets 及相关评论，恢复完整验收和已确认测试 seam。双轴报告缺失、失败或不对应固定范围时报告阻碍。
2. 阅读两轴全部 findings，由你一个实施者集中处理并逐项记录修复、验证或有依据的不采纳理由。
   对确实成立的缺陷按仓库 `tdd` skill 修复，用引用父 Spec 的普通提交保存；保留提交 Hook，核对其修复 diff。
   需要安全、并发、一致性或跨 runtime 新设计且未能解决时保留现场并报告下一恢复动作。
   本次沿用手动 `implement-spec` 的节奏，不默认循环双轴全量复审，也不派生其他实施者分摊 findings。
3. 以 `{{REVIEW_BASE}}` 为合入目标，按 `docs/agents/workflow.md` 的验证节奏为最终集成内容选择基础门禁。
   按完整 Spec 和 tickets 的风险、验收与测试决策补齐必需
   Integration、E2E、Gateway 或其他检查；重复覆盖按范围去重。票级通过不能代替最终组合验证。
   按候选工作树中的 [Container Smoke 门禁](../docs/agents/sandcastle-afk.md#验证节奏)，在修复提交后运行
   `pnpm verify:container-smoke --base {{REVIEW_BASE}}`。同一最终候选的 `pnpm verify:release` 已通过时可复用其中的 Container Smoke 结果。
   真实资源检查通过根 `pnpm test:integration --workspace ... --file ...` 或 `pnpm test:e2e`，每条命令独立管理资源。
   修改依赖后运行 `sh scripts/sandcastle/prepare-workspace.sh`。遵守 Bun 真实 I/O await 规则。
4. 正常会话内诊断和修复验证失败，提交后重跑因此失效的检查；仍有效的检查结果可复用。
   必需工作无法完成时保持未完成，不能通过删测试、缩小验收或忽略失败获得完成标记。
5. 确认最终工作区干净、最终 HEAD 包含评审 candidate，记录两者关系、逐项 findings 处置、实际命令与结果、
   可复用证据、未执行项及原因。全部 findings 妥善处理且所有必需检查通过，才可声明最终门禁通过。
6. 确认最终提交与全部必需验证通过且工作区干净后，读取 `.agents/skills/pr/SKILL.md` 与 `GLOSSARY.md`，依据
   `git diff {{REVIEW_BASE}}..HEAD`、你的真实最终验证证据和领域术语编写 PR 正文草稿，并用唯一一对
   `<pr-body>...</pr-body>` 包裹输出。草稿必须包含 `## Summary`、`## Evidence`、`## Merge Danger`
   （含 `**Door:**` 与 `**Blast Radius:**`）；正文使用自然中文，保留代码标识符、命令、路径、领域术语和模板标题。
   不要在 `<pr-body>` 中手写 `Closes #...` 或机器元数据尾注（由宿主在创建 PR 时确定性组装）。

本阶段保留 tickets 与父 Spec open，将最终候选与 `<pr-body>` 交给宿主推送 Spec 分支并创建 PR；不写启动分支，不 push、创建 PR 或部署。
无法完成时保留普通 Git 提交和完整自然语言交接，本次不通过新开会话重试。

仅当全部修复、Spec 验收、必需最终验证与 `<pr-body>` 草稿已完成，实现已提交、工作区干净时，在完整交接后输出：

<promise>COMPLETE</promise>
