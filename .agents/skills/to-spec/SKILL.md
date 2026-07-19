---
name: to-spec
description: 把已澄清的对话整理成 draft spec 并发布到项目 issue tracker。用户要求沉淀 PRD、规格或把现有共识写成可拆票基线时使用；不重新访谈。
---

# 整理规格

把当前对话上下文和代码库事实整理成 spec（也称 PRD）。不要重新访谈用户；只综合已经讨论并确认的内容。

开始前读取仓库的 `AGENTS.md`、Engineering workflow、issue tracker 约定和 delivery ledger。分支、授权、文档语言、checkpoint 与状态由仓库 workflow 决定；本 skill 不建立第二套生命周期。

## 流程

1. 如果尚未调查代码库，先了解当前实现。规格使用项目领域词汇，并遵守相关 ADR。
2. 找出功能可测试的接缝。优先使用已有接缝和最高层公开接缝；只有必要时才提出新接缝，数量越少越好，理想数量是一个。
3. 请用户确认这些测试接缝符合预期。
4. 按下方模板写 spec，并根据 tracker 约定发布。文档正文使用项目规定的语言；代码标识符、命令、路径、API/skill 名称和机器字段保持稳定。
5. 新 spec 的状态是 `draft`，不得使用 `ready-for-agent`，也不得在 ticket 拆分获批前声称 implementation-ready。
6. 按仓库 workflow 验证并提交 draft spec checkpoint。提交完成后停止，给出 spec 路径、content HEAD、验证摘要和进入 `to-tickets` 的范围 brief；没有独立授权时不得继续拆票。

<spec-template>

# <中文 Spec 标题>

**Status:** draft

## 问题陈述

从用户视角说明正在面对的问题。

## 解决方案

从用户视角说明拟提供的解决方案。

## 用户故事

使用较完整的编号列表覆盖功能各方面。每项采用：

1. 作为 `<角色>`，我希望 `<能力>`，以便 `<收益>`。

## 实现决策

记录已经形成的实现决策，例如模块或接口边界、技术澄清、架构决定、schema 变化和 API 契约。

不要写容易失效的具体文件路径或代码片段。例外：prototype 产生的状态机、reducer、schema 或 type shape 比文字更精确时，可以只摘录体现决策的最小片段，并注明来源。

## 测试决策

记录外部行为测试原则、需要测试的模块、选定的最高层测试接缝，以及代码库中的相似先例。

## 范围之外

明确本规格不处理的内容。

## 补充说明

记录不适合放入前述章节的必要信息。

</spec-template>
