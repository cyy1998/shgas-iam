---
name: to-tickets
description: 把计划、approved spec 或当前共识拆成带阻塞边的 tracer-bullet tickets，并发布到 tracker。用户要求拆票、拆 issue 或规划依赖前沿时使用。
---

# 拆分 Tickets

把计划、spec 或对话共识拆成一组 tracer-bullet tickets，并为每张票声明真实的阻塞关系。

开始前读取仓库的 `AGENTS.md`、Engineering workflow、issue tracker 约定和 delivery ledger。只有仓库 workflow 规定的独立 `to-tickets` 授权有效；spec 完成或已获认可本身不构成拆票授权。

## 流程

### 1. 收集上下文

使用当前对话已有上下文。用户传入 spec 路径、issue 编号或 URL 时，读取完整正文和 comments。确认来源 spec 是当前实施基线的候选，而不是冻结历史材料。

### 2. 调查代码库

尚未调查时了解当前实现。Ticket 标题与描述使用项目领域词汇并遵守相关 ADR。可以寻找让后续实现更容易的 prefactor，但不要把未获批准的额外工作静默加入 tickets。

### 3. 拟定纵向切片

每张 tracer-bullet ticket 应满足：

- 形成跨必要层次的窄而完整路径，不是只完成某一层的横向切片；
- 完成后可以独立演示或验证；
- 能在一个新的上下文窗口内完成；
- 明确列出真正阻塞它的 tickets；无 blocker 的票可立即开始。

宽范围机械重构是例外。若单次 rename/retype 会同时破坏大量调用点，采用 expand–contract：先增加兼容新形状，再按 package 或目录分批迁移，最后在所有迁移完成后删除旧形状。只有批次无法单独保持绿色时，才使用共享 integration branch，并增加最终集成验证 ticket。

### 4. 请用户确认拆分

用编号列表展示每张票的：

- **标题**：简短中文名称；
- **Blocked by**：真实 blockers；
- **交付行为**：该票独立完成的端到端结果。

询问粒度、阻塞边以及是否需要合并或拆分，迭代到用户明确批准方案。批准方案不等于授权 implementation。

### 5. 发布获批 Tickets

只有拆分方案获批后才能发布。在本仓库固定使用本地 tracker：在 `.scratch/<feature-slug>/issues/<NN>-<slug>.md` 下按依赖顺序一票一文件，从 `01` 连续编号，并在正文列出 blockers。

根据仓库 tracker 契约把 tickets 标为 `ready-for-agent`，同时把来源 spec 提升为 `approved`，更新 delivery ledger，并按仓库 workflow 验证、创建 `G3` checkpoint。

发布后立即停止，输出 implementation brief：approved spec、ticket 集合、依赖前沿、建议实施范围、checkpoint SHA 和验证摘要。不得自动调用 `implement`，不得因为 tickets 已 `ready-for-agent` 而继承拆票授权。

<local-ticket-template>

# NN — <中文 Ticket 标题>

**What to build:** <从用户视角描述可独立工作的端到端行为>

**Blocked by:** <逗号分隔的 ticket 编号，例如 01, 03；或 None — can start immediately>

**Status:** ready-for-agent

- [ ] <可观察验收标准 1>
- [ ] <可观察验收标准 2>

</local-ticket-template>

不要写容易失效的具体文件路径或实现代码。Prototype 产生的决策型状态机、schema 或 type shape 可以保留最小必要片段并注明来源。
