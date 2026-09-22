# 规划本批 tickets

这是仓库的 Sandcastle AFK 模式。先读取 `AGENTS.md`、`docs/agents/workflow.md` 的 AFK 规则和
`docs/agents/issue-tracker.md`。本次 GitHub 仓库为 `{{REPO}}`，本地合入目标为 `{{INVOCATION_BRANCH}}`。
本阶段只读取仓库与 issues，输出计划。

可选实施者由 runner 从本次启动分支的 `.codex/agents/implementer-*.toml` 加载：

<implementers-json>
{{IMPLEMENTERS}}
</implementers-json>

根据验收、相关代码、风险和已有失败记录为每票选择一个 `implementer`，并用 `reason` 说明选择依据。
范围局限、验收明确的小改动可选 light；常规多文件功能或信息不足选 standard；安全/授权边界、事务与并发一致性、
跨 runtime 生命周期或难解失败选 deep。只选择上述名称，不自拟模型或参数；成本较低不是降低验收与评审要求的理由。

下面是最多 100 张 open、`ready-for-agent` issues：

<issues-json>
!`gh issue list --repo {{REPO}} --state open --label ready-for-agent --limit 100 --json number,title,body,labels,comments,assignees`
</issues-json>

根据正文、评论、相关代码和必要的 GitHub 原生关系，识别每张票的依赖：

- 依赖其他票引入的代码、基础设施、决策或 API；
- 两票修改重叠文件/模块，容易冲突时安排到不同批；
- `Parent` 表达归属，`Blocked by` 表达前置条件。已有 implementation tickets 的父 Spec/PRD 不进入实施列表；
- 已被他人领取且正在实施的票留给原执行者。本 runner 之前留下的分支/评论可用于恢复，不能仅因已有 assignee 永久跳过。

优先选择无阻塞、彼此独立的候选。若所有候选都被阻塞，沿用作者自用策略：仅选优先级最高且依赖最少/最弱的一张尝试。
这允许探索或推进可完成部分；不能把缺失前置条件或未执行检查当成验收通过。没有可实施候选时输出空数组。

每票分支严格为 `codex/sandcastle/issue-<number>`，保持稳定以便后续恢复。只从上述列表选择实际存在的 ticket，
需要时补读未列出的 blocker/parent；不创建新 tickets。

# 输出

输出一个且仅一个 `<plan>` JSON，不使用 Markdown code fence 包裹：

<plan>
{"issues":[{"number":42,"title":"实际 ticket 标题","branch":"codex/sandcastle/issue-42","implementer":"implementer_standard","reason":"常规多文件功能，依赖与验收已明确"}]}
</plan>
