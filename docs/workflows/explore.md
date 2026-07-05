# Explore 阶段

本阶段承接 [index.md](index.md) 的 Explore 状态，用于需求仍处于想法、问题空间、方案比较或影响面调查阶段的工作。Explore 只负责调查和对齐方向，不实现代码。

## 方法

进入 Explore 时必须先完成 [index.md](index.md) 的 skill preflight，并默认读取和使用 `$openspec-explore`。`$openspec-explore` 是前置探索入口，不替代正式澄清、Plan 产物或 OpenSpec artifacts；它可以读取代码、OpenSpec、docs 和测试，帮助识别现状、候选方案、隐藏复杂度、风险、未知问题以及是否需要进入 OpenSpec。

若本轮只做极小事实确认而不使用 `$openspec-explore`，必须在行动前记录例外原因、替代探索方式和剩余风险。

探索过程中形成明确需求、范围变化或设计决策时，应先由用户确认，再沉淀到 proposal、design、spec、tasks、ADR 或相关 docs；不要在探索模式中自动实现代码。

## 退出条件

- 问题空间、候选方向、主要未知项和是否触发 OpenSpec 已经清楚。
- 若需求边界、术语、关键取舍、非目标或正确性标准仍不清楚，进入 [clarify.md](clarify.md)。
- 若可以选择计划产物，进入 [plan.md](plan.md)。
