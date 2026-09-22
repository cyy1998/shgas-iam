---
status: accepted
---

# 采用上游工作流与仓库薄适配

仓库以 `mattpocock/skills` 拥有澄清、spec、tickets、实现和评审等通用方法，GitHub Issues 保存跨会话需求与协作状态。
本页合并原 OpenSpec 退役与上游优先决定，并纳入已经接受的 GitHub tracker 和 Sandcastle AFK 调整。

## 理由与代价

同时维护上游 skills、累计 capability specs 和本地证据状态机会造成多套事实来源与重复元数据。仓库只记录上游无法知道的
领域、分支、验证、授权和收尾约束，不复制通用流程，不再以专用 checker 强制 tracker 内部结构。

当前行为以实现、生效配置和可执行证据为准；spec/ticket 表达修改目标，不证明已经交付。领域语言和已接受决策约束设计，
但不能覆盖已观察到的实现差异。目标冲突仍须澄清。

`openspec/` 与退役的 `.scratch/` 保持原路径、只读追溯；不批量转换、补证或重新解释历史。仍有价值的历史内容只在相关
区域被触及时，经核验提升到当前文档。新工作不继续写这两套 tracker。

代价是放弃累计 capability-spec 视图与机器证明的交付状态链，依赖清晰的 issue、普通 Git 提交、执行者和独立评审。
聚焦验证服务日常反馈，最终验证与收尾按仓库工作流执行；采用上游不取消本地授权边界。

2026-09-21 接受以作者自用 Sandcastle 运行模型承载无人值守批量实施：全仓选票、独立分支并行实现、批后普通合并与
验收关票。启动 AFK 即授权这次运行的本地合入和 issue 更新；手动路径保留人工授权 squash 收尾。这个选择解除对持续
在线主会话及逐票实施子代理的依赖，代价是 AFK 普通合并保留分支历史。两条路径共享必需验证与真实验收要求，push
和部署仍需独立授权。没有另建 runner 专用的需求、审批或交付状态机。

2026-09-22 修订 AFK 的执行与评审职责：Planner 按任务复杂度从仓库预定义角色中选择实施者，角色文件决定模型、
思考程度和职责；实施者会话内调用 `code-review`，每轮由新的 Standards 与 Spec 两个只读子代理独立审查，
实施者负责修复。这取代顶层可修改代码的单 Reviewer，使修复保留实施上下文，同时恢复双轴评审的独立性。
评审强度独立于实施者档位，固定完整评审范围并限制每票每次实施者会话最多十轮，未通过的 ticket 不进入合并。
代价是 runner 需要提供容器内 Codex 子代理配置，且每轮双轴评审增加模型调用成本；选择固定角色而非让 Planner
自由生成模型与权限配置，使执行策略可审查、可追踪。具体流程与角色配置入口留在工作流和命令文档。

## 当前契约与历史

操作规则见[开发工作流](../agents/workflow.md)、[议题跟踪](../agents/issue-tracker.md)及
[事实与目标](../index.md#当前事实与修改目标)。

历史来源：[ADR-0001 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0001-replace-openspec-workflow.md)、[ADR-0004 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0004-adopt-upstream-first-matt-skills.md)。原始决定与后续修订按各版本追溯。
