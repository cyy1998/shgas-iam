# Clarify 阶段

本阶段承接 [index.md](index.md) 的 Clarify 状态，用于收敛需求边界、领域术语、关键取舍、非目标和正确性标准。

## 方法

`$grill-with-docs` 是前置澄清流程，不替代 Plan 产物或 OpenSpec artifacts。澄清过程中应优先让 Codex 查阅代码、OpenSpec、既有文档和测试来回答可自证的问题；只有代码库无法判断的设计意图、产品取舍或领域语言才交给用户确认。

澄清时每次只问一个问题，并在问题中给出推荐答案。使用 `$grill-with-docs` 后，正式能力、契约、迁移或跨模块生命周期仍应继续沉淀到 OpenSpec proposal/design/spec/tasks。

## 知识沉淀

- `$grill-with-docs` 可通过 `$domain-modeling` 将已确认的领域术语即时写入根目录 `CONTEXT.md`；`CONTEXT.md` 只记录领域词汇和应避免的同义词，不记录实现方案。
- 少数难回退、非显然且存在真实取舍的长期架构决策写入 `docs/adr/`；ADR 说明为什么长期采用某个架构选择，OpenSpec 说明本次变更要实现什么、如何验收和如何落地。

## 退出条件

- 用户意图、领域术语、非目标和必须成立的验收条件已经清楚。
- 若仍有多个候选方向或影响面未知，回到 [explore.md](explore.md)。
- 若可以选择计划产物，进入 [plan.md](plan.md)。
