---
status: accepted
---

# 采用上游优先的 Matt skills 与仓库薄适配

> 本 ADR 中关于 Markdown tracker、跨会话 `delivery.md` 和 tracker handoff commit 的局部内容已不再适用；新工作使用
> [GitHub Issues](../agents/issue-tracker.md) 的正文、评论、assignee、labels 与 open/closed 状态。上游 skills 所有权、
> 仓库薄适配、聚焦验证和双轴评审等其余决定保持有效。

## 背景

仓库在采用 Matt skills 后，又增加了 delivery ledger schema、Gate、claim/candidate/resolution checkpoint、SHA
新鲜度和 workflow checker。通用方法因此同时存在于上游 skill 与仓库状态机中：更新上游需要反复调和两套流程，
agent 也需要为证明流程状态重复维护元数据和运行检查。

ADR 0001 关于停止使用 OpenSpec 驱动新工作的决策保持不变；本决策进一步明确 Matt 工作流与仓库适配层的所有权边界。

## 决策

`mattpocock/skills` 是澄清、spec、tickets、TDD、实现和双轴评审等通用开发方法的唯一来源。仓库不再改写这些 core
skills，也不维护平行的可执行证据状态机。

仓库文档只描述上游无法知道的本地约束：Markdown tracker 布局、功能分支、验证节奏、跨会话 journal、授权边界、
显式归档和本地合入顺序。多会话工作用 `delivery.md` 传递当前状态与过程摘要；正式需求、设计和测试范围仍分别由
spec、ticket、`CONTEXT.md` 与 ADR 承担。

Ticket 状态保留为协作提示。实现和评审通过普通 focused commits 与轻量 tracker handoff commit 交接，不记录 SHA
证据链。专用 workflow checker、hook 接线和记录 schema 退役；完整 `pnpm verify` 只在准备 merge、release 或用户明确
要求时运行一次。

## 后果

- 上游 skills 可以直接更新，仓库只需维护少量稳定的本地差异。
- 跨会话恢复依赖清晰的正式文档、普通 Git 历史和轻量 journal，而不是机器证明的 gate。
- 日常反馈环只运行聚焦检查；最终合入仍保留一次完整验证和 Standards/Spec 双轴评审。
- 既有 `.scratch/` 与冻结的 `openspec/` 历史不迁移、不补证，仍可按原路径追溯。
- 流程一致性主要由维护者、执行 agent 和代码评审判断；仓库接受不再以专用 checker 强制 Markdown 内部结构的取舍。
