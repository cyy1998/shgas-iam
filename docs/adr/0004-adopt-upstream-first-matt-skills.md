---
status: accepted
---

# 采用上游工作流与仓库薄适配

采用 `mattpocock/skills` 维护通用工程方法，用 GitHub Issues 保存跨会话需求与状态。
仓库只记录上游无法知道的领域、分支、验证、授权和收尾约束。
同时维护上游 skills、累计 capability specs 与本地交付状态机，会增加多套事实来源和元数据的同步成本。
采用薄适配的代价是放弃累计 capability-spec 视图和专用机器证据链，依靠 issue、Git 提交、执行证据和独立评审追溯。

`openspec/` 与退役的 `.scratch/` 保持原路径和只读历史。仍有价值的内容在相关区域被触及时核验，再进入现行文档。
当前事实由实现、配置与可执行证据确认，Spec 与 ticket 表达修改目标。

## 实施与验收的取舍

- **手动工作流** 手动完整 Spec 采用上游 `implement-spec`，评审与全仓验证在集成候选集中完成。
  小任务（Fast Track）在 T3 Code 单会话直接实施并做分级验证，默认节省双轴评审与修复后全量复审的成本，也接受少一轮独立审查。
  2026-11-25 修订将手动工作流交付同样统一为“推送功能分支并按 `$pr` 起草描述创建 Pull Request（默认 Ready for Review，关联 issue 时附 `Closes #...`）”，
  保持本地 `main` 只读并保留一次明确的交付授权，合入与关票交由维护者在 GitHub 完成。

- **AFK 自动工作流** 2026-10-25 的 AFK 修订以 Spec 为交付单位，按 GitHub 原生父子和阻塞关系动态调度。
  相比固定批次、逐票循环评审和逐票全仓检查，它减少无依赖任务间的等待与重复检查，
  代价是跨票问题集中到 Spec 集成阶段发现，失败时需要保留整个 Spec 的恢复点。
  2026-11-24 进一步将 AFK 交付从“本地 squash 合入调用分支”修订为“推送 Spec 集成分支并创建 Pull Request（默认 Ready for Review，正文按 `$pr` 生成并附 `Closes #...`）”，
  保持本地调用分支全程只读、保留本地 Spec 分支 ref 供维护者本地调试验收，合入与关票交由人工在 GitHub 完成，并以系统内置 `Status` 列同步看板进度。
  这样换取了人工合入把关、按提交审查与主干零污染，代价是启动前须与远端基线对齐，跨 Spec 前置核验须同时验证 PR `MERGED` 与本地 `mergeCommit` 祖先关系（向下兼容历史本地 squash 记录）。
  > 注：[ADR-0059](0059-adopt-native-sandcastle-afk-orchestration.md) 已取代上述 AFK 中以 GitHub Projects `Status` 列同步看板进度、启动前要求本地调用分支与远端零偏差对齐，以及跨 Spec 依赖核验 PR `mergeCommit` / 历史 squash 的条款；改用 `needs-attention` 标签加暂停评论、`origin/<base>` 与 `merge-base` 动态基线，以及以 `CLOSED` 判定外部前置完成。
  > 保留独立于在线聊天的宿主 runner，接受维护调度代码的成本。准入、依赖和交付由 runner 和授权状态协调，
  > 执行者职责与模型配置可审查，未完成工作保存在集成分支与 issue 中。

[开发工作流](../agents/workflow.md) · [议题跟踪](../agents/issue-tracker.md) · [AFK 编排与恢复](../agents/sandcastle-afk.md) · [事实与目标](../index.md#当前事实与修改目标)

历史来源：[ADR-0001 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0001-replace-openspec-workflow.md)、[ADR-0004 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0004-adopt-upstream-first-matt-skills.md)。原始决定与后续修订按各版本追溯。

固定历史版本：[整理前 ADR-0004](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0004-adopt-upstream-first-matt-skills.md)。
