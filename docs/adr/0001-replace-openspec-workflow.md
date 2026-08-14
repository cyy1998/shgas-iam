---
status: accepted
---

# 以 Matt skills 工作流取代 OpenSpec

> 本 ADR 中把 `.scratch/` 指定为当前 issue tracker 的局部内容已不再适用；新工作使用
> [GitHub Issues](../agents/issue-tracker.md)。停止以 OpenSpec 驱动新工作并采用 Matt skills 的其余决定保持有效。

## 背景

仓库同时存在 OpenSpec change/capability specs 工作流与 Matt skills 工作流。两套入口、事实来源和交付生命周期并存，会让维护者和 agent 无法确定新工作应创建哪种产物，也难以判断历史规格是否仍代表当前实现。

## 决策

本仓库停止以 OpenSpec change 和累计 capability specs 驱动新工作，改用 Matt skills 的 conversation → spec → tickets → implementation/review 流程，并把版本化的 `.scratch/` 作为本地 issue tracker。

现有 `openspec/` 保留原路径并冻结为只读历史参考，不再作为当前事实来源。判断当前行为时，代码、生效配置与可执行测试结果是直接证据，标记为 `Current` 的文档用于补充说明；两者不一致时记录并调查差异，不能用文档覆盖已观察到的行为。Feature spec 和 tickets 描述修改目标，不证明目标已经实现；用户当前授权的目标受稳定领域语言、已接受 ADR 和当前工程文档约束。目标依据冲突时先澄清，不从现有实现或历史 OpenSpec 中静默选择答案。仍有价值的 OpenSpec 内容只在相关区域被实际触及时，经当前实现验证后按需提升，不做批量转换。

## 后果

- 新工作只有一套入口、票据生命周期和评审路径。
- 每个 feature 的 spec、tickets、amendments 与交付证据永久保留，便于追溯实现意图。
- 历史 OpenSpec 路径和链接继续可用，但读取者必须把它们视为待验证线索。
- 仓库不再维护一份累计 capability-spec 视图；我们接受这一取舍，以换取更轻量且更贴近实际交付的协作流程。
- OpenSpec CLI、专用校验与 agent 入口可以退役，但冻结的历史内容不得因工具退役而被删除或重写。
