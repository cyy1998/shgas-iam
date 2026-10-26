# 选择 Spec 与可执行切片

这是仓库的 Sandcastle AFK 模式。先读取 `AGENTS.md`、`docs/agents/sandcastle-afk.md` 和
`docs/agents/issue-tracker.md`。本次 GitHub 仓库为 `{{REPO}}`，本地合入目标为 `{{INVOCATION_BRANCH}}`。
本阶段只读取仓库与 issues，输出计划。

可选实施者由 runner 从本次启动分支的 `.codex/agents/implementer-*.toml` 加载：

<implementers-json>
{{IMPLEMENTERS}}
</implementers-json>

根据验收、相关代码、风险和已有失败记录为每票选择一个 `implementer`，并用 `reason` 说明选择依据。
范围局限、验收明确的小改动可选 light；常规多文件功能或信息不足选 standard；安全/授权边界、事务与并发一致性、
跨 runtime 生命周期或难解失败选 deep。只选择上述名称，不自拟模型或参数；成本较低不是降低验收与评审要求的理由。

下面是宿主通过 GitHub 原生关系分页读取、校验后的 Spec 任务图。每个条目包含父 Spec、完整子票、前置依赖和
当前 frontier；`ready` 是允许派发的切片，`blocked` 保留阻塞原因，不能因为某张票未准入而忽略它对整个 Spec 的影响。

<spec-backlog-json>
{{SPEC_BACKLOG}}
</spec-backlog-json>

从这些条目选择一个 Spec，并为其当前可执行切片选择实施者。需要时补读正文、评论与相关代码，理解验收与风险：

- `type:spec` 和 `type:ticket` 互斥，父子两级均需 `ready-for-agent`；原生父子关系决定归属，原生 blocking 关系决定依赖。
- 只从所选 Spec 的 `frontier.ready` 选择实施票。父 Spec、未准入、被他人认领或受阻的票不进入实施列表。
- 需要同一模块改动的切片可以顺序推进；依赖其他切片成果时，等待其真实验收并集成。
- 发现任务图遗漏必要依赖或验收条件不完整时报告阻碍，暂停受影响切片；独立切片仍可选。不要静默修改关系或猜测已交付。
- 已有工作按普通 Git、issue 交接与日志核对后恢复，不以已有 assignee 永久排除本 runner 的可恢复工作。

仅从可执行切片推进；所有候选受阻时说明原因并输出 `spec: null`、空 `issues`，不尝试受阻票。
空子票列表、进程成功和旧评论的成功声明都不构成父 Spec 已完成的依据。

每票分支严格为 `codex/sandcastle/issue-<number>`，保持稳定以便后续恢复。只从上述列表选择实际存在的 ticket，
需要时补读上下文；不创建新 tickets，不将其他 Spec 的票混入本次计划。

# 输出

输出一个且仅一个 `<plan>` JSON，不使用 Markdown code fence 包裹：

<plan>
{"spec":10,"issues":[{"number":42,"title":"实际 ticket 标题","branch":"codex/sandcastle/issue-42","implementer":"implementer_standard","reason":"常规多文件功能，依赖与验收已明确"}]}
</plan>
