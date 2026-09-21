---
status: accepted
---

# 采用上游工作流与仓库薄适配

仓库以 `mattpocock/skills` 拥有澄清、spec、tickets、实现和双轴评审等通用方法，GitHub Issues 保存跨会话需求与协作状态。
本页合并原 OpenSpec 退役与上游优先决定，并纳入已经接受的 GitHub tracker 调整。

## 理由与代价

同时维护上游 skills、累计 capability specs 和本地证据状态机会造成多套事实来源与重复元数据。仓库只记录上游无法知道的
领域、分支、验证、授权和收尾约束，不复制通用流程，不再以专用 checker 强制 tracker 内部结构。

当前行为以实现、生效配置和可执行证据为准；spec/ticket 表达修改目标，不证明已经交付。领域语言和已接受决策约束设计，
但不能覆盖已观察到的实现差异。目标冲突仍须澄清。

`openspec/` 与退役的 `.scratch/` 保持原路径、只读追溯；不批量转换、补证或重新解释历史。仍有价值的历史内容只在相关
区域被触及时，经核验提升到当前文档。新工作不继续写这两套 tracker。

代价是放弃累计 capability-spec 视图与机器证明的交付状态链，依赖清晰的 issue、普通 Git 提交、执行者和独立评审。
聚焦验证服务日常反馈，最终验证与人工收尾仍按仓库工作流执行；采用上游不取消本地授权边界。

## 当前契约与历史

操作规则见[开发工作流](../agents/workflow.md)、[议题跟踪](../agents/issue-tracker.md)及
[事实与目标](../index.md#当前事实与修改目标)。

历史来源：[ADR-0001 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0001-replace-openspec-workflow.md)、[ADR-0004 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0004-adopt-upstream-first-matt-skills.md)。原始决定与后续修订按各版本追溯。
