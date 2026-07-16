---
status: accepted
---

# 以 Matt skills 工作流取代 OpenSpec

## 背景

仓库同时存在 OpenSpec change/capability specs 工作流与 Matt skills 工作流。两套入口、事实来源和交付生命周期并存，会让维护者和 agent 无法确定新工作应创建哪种产物，也难以判断历史规格是否仍代表当前实现。

## 决策

本仓库停止以 OpenSpec change 和累计 capability specs 驱动新工作，改用 Matt skills 的 conversation → spec → tickets → implementation/review 流程，并把版本化的 `.scratch/` 作为本地 issue tracker。

现有 `openspec/` 保留原路径并冻结为只读历史参考，不再作为当前事实来源。当前行为由代码、可执行测试和标记为 `Current` 的文档共同定义；稳定领域语言和长期决策分别进入 `CONTEXT.md` 与 ADR。仍有价值的 OpenSpec 内容只在相关区域被实际触及时，经当前实现验证后按需提升，不做批量转换。

## 后果

- 新工作只有一套入口、票据生命周期和评审路径。
- 每个 feature 的 spec、tickets、amendments 与交付证据永久保留，便于追溯实现意图。
- 历史 OpenSpec 路径和链接继续可用，但读取者必须把它们视为待验证线索。
- 仓库不再维护一份累计 capability-spec 视图；我们接受这一取舍，以换取更轻量且更贴近实际交付的协作流程。
- OpenSpec CLI、专用校验与 agent 入口可以退役，但冻结的历史内容不得因工具退役而被删除或重写。
