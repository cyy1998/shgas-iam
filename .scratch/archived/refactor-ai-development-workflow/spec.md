# 轻量化 AI 开发工作流

## 问题陈述

当前仓库虽然名义上采用 Matt skills，但又在其上叠加了独立的状态机、delivery ledger schema、SHA 新鲜度、
claim/candidate/resolution checkpoint、固定验证矩阵和机器 checker。agent 为建立流程证据而重复运行检查、维护
元数据和创建提交，实际开发反馈环被流程本身拖慢；仓库改写版 skills 也因此偏离上游，难以继续吸收
`mattpocock/skills` 的更新。

维护者需要一条更轻、更容易恢复和解释的 AI 开发路径：Matt skills 负责通用方法，仓库只补充不可由上游知道的
本地约束。跨会话信息仍要可靠传递，但不再被当作必须由机器证明的交付证据。

## 解决方案

恢复 Matt skills 对开发流程的所有权，把仓库工作流收缩为一层薄适配。上游 skills 负责从澄清、spec、tickets、
TDD 到双轴评审的主流程；仓库只规定本地 Markdown tracker、功能分支、验证节奏、跨会话 journal、目标分支授权和
合并后的本地清理。

多会话工作使用一份 feature 级 `delivery.md` 保存当前状态、验收与验证计划以及重要过程事件。正式需求、设计和测试
范围仍分别写入 spec、ticket、CONTEXT 或 ADR；journal 只保存过程摘要和指针。每张 ticket 在全新上下文中实现，
通过普通提交和轻量 tracker handoff commit 交接，不维护 SHA 证据链。

仓库移除 v2 workflow checker 及其 hook、命令和测试接线。实现期间只运行聚焦检查，准备合并时在最终实现内容上运行
一次完整 `pnpm verify`。实现完成后，agent 明确询问用户是否按指定策略归档并合入目标分支；默认建议 squash，但不
隐藏或强制 merge 策略。

## 用户故事

1. 作为维护者，我希望 Matt skills 是开发流程的唯一主体，以便直接受益于上游的小型、可组合设计。
2. 作为维护者，我希望仓库只记录本地特有约束，以便通用 skill 更新时不必重新调和一套平行状态机。
3. 作为 agent，我希望小型单会话任务可以直接进入 `/implement`，以便避免为简单改动创建无价值的 tracker 产物。
4. 作为 agent，我希望多会话任务拥有 spec、tickets 和一份 feature 级 journal，以便在干净上下文之间传递有效信息。
5. 作为下一张 ticket 的实现者，我希望能从正式文档和 journal 快速恢复当前状态，以便不依赖上一段聊天历史。
6. 作为维护者，我希望需求、设计和测试范围以正式文档为准，以便过程日志不会成为第二份相互漂移的规格。
7. 作为协作者，我希望 ticket 只保留交付行为、验收标准、blockers 和简单状态，以便看出依赖前沿而不维护证据字段。
8. 作为 agent，我希望每张 ticket 使用全新上下文并按 blockers 顺序处理，以便模型始终工作在清晰的上下文中。
9. 作为开发者，我希望实现内循环只运行聚焦测试和受影响范围检查，以便快速获得反馈。
10. 作为维护者，我希望完整仓库验证只在准备合并时运行一次，以便保留最终质量基线而不重复消耗时间。
11. 作为评审者，我希望每张 ticket 的已提交 diff 只执行一次 Standards 与 Spec 双轴评审，以便发现偏差而不重复评审
    已确认内容。
12. 作为下一会话的 agent，我希望 review 通过后的 ticket 状态和 journal 进入一个简单 handoff commit，以便从干净
    工作区继续。
13. 作为维护者，我希望 workflow 文档不再由专用 checker 强制，以便规则可以保持短小并依靠正常评审演进。
14. 作为维护者，我希望旧 v2 tracker 记录原样保留，以便历史仍可追溯且无需迁移。
15. 作为维护者，我希望在实现完成后自行决定是否归档 feature，以便活动 tracker 目录保持易读而不增加自动 gate。
16. 作为维护者，我希望一次明确回复即可授权本地归档、最终验证、指定方式的 merge 和本地分支删除，以便避免连续
    checkpoint。
17. 作为仓库使用者，我希望 push、远端删除和部署仍需单独授权，以便本地自动化不会扩大到外部副作用。

## 实现决策

- **流程所有权**：`mattpocock/skills` 是通用开发流程的唯一来源。仓库不复制其 idea → spec → tickets →
  implement/TDD → review 主流程。
- **上游边界**：只恢复已经被仓库实质改写的 `to-spec`、`to-tickets`、`implement` 和 `code-review`；其他 Matt
  skills 与本地专用 skills 不做无关改动。仓库特有行为只进入薄适配文档或独立 wrapper skill。
- **薄适配层**：`AGENTS.md` 保持短索引；一份精简的 agent workflow 文档只描述本地 tracker、分支、验证、授权、
  归档和 merge 行为；命令文档只描述可执行入口。
- **本地 tracker**：沿用 `.scratch/<feature>/spec.md` 与一票一文件的 tickets。spec 不再拥有
  `draft → approved` 生命周期。
- **Journal 创建时机**：所有进入 `/to-tickets` 的 feature 都拥有一份 `delivery.md`。已确定为多会话工作时随
  `/to-spec` 创建；从单会话扩展为拆票时，在发布首批 tickets 时补建。单会话直接实现不创建。
- **Journal 职责**：只维护“当前状态”“验收与验证计划”和按日期追加的事件。事件可以标记 Decision、
  Authorization、Validation、Review、Reopen 或 Repair，但不要求固定字段、SHA、Gate ID 或机器校验。
- **正式事实来源**：稳定领域语言和长期决策进入 CONTEXT/ADR，feature 范围与测试决策进入 spec，切片范围与验收
  进入 ticket。journal 只记录过程和链接；冲突时以正式文档为准。
- **Ticket 生命周期**：保留 advisory 状态 `ready-for-agent → claimed → resolved`。状态帮助协作，不构成 gate，
  不要求独立 claim checkpoint。
- **上下文协调**：多 ticket feature 由当前任务充当协调者，按 blockers 顺序为每张 ticket 启动不继承聊天历史的
  新子代理。子代理只读取功能分支、spec、ticket、blockers 和 journal；同一功能分支默认顺序执行。
- **提交与评审**：每张 ticket 先创建正常 implementation commit，再以 ticket 开始前的提交为 fixed point 运行一次
  上游双轴 review。finding 使用普通 focused fix commit 并重审同一范围。通过后更新 ticket 与 journal，并创建一个
  轻量 tracker handoff commit；不记录候选 SHA 或证据新鲜度。
- **分支规则**：只读工作不创建分支。在目标分支上即将修改受版本控制文件时创建 `codex/<slug>`；已在明确功能分支
  上则继续。无关未跟踪文件不自动阻断，只有重叠或覆盖风险才暂停。
- **验证节奏**：TDD 和实现内循环运行聚焦测试及受影响 workspace 检查。完整 `pnpm verify` 只在准备 merge、
  release 或用户明确要求时运行一次；不维护按路径展开的强制验证矩阵。
- **机器强制**：删除 workflow checker、专用测试、package scripts、lint 接线和 Husky 临时快照逻辑。pre-commit
  只保留 staged whitespace 检查。
- **归档能力**：新增用户显式调用的仓库级 `archive-feature` skill。它从当前功能分支或显式参数解析 feature，确认
  tracked 工作区可安全提交且 tickets 已 resolved，移动 tracker 目录、修复受版本控制的旧路径引用、运行轻量文档/
  whitespace 检查并创建普通归档提交。它不 merge、push 或删除分支。
- **完成提示**：`/implement` 完成后，薄适配层要求 agent 用一个问题明确给出 feature、目标分支和拟采用的 merge
  策略，询问是否归档并合入。默认建议 squash，用户可以在当次回复中改用其他策略。
- **本地交付顺序**：获批后先处理目标分支漂移，再运行一次 `pnpm verify`，随后归档 feature；再次确认目标 tip 后
  merge，确认提交可达后删除本地功能分支。任一步失败都停止后续动作并保留功能分支。push 和远端删除不在授权内。
- **历史兼容**：既有 v2 与更早的 `.scratch/` 记录保持原路径和内容，不批量翻译、迁移或校验。可由维护者以后显式
  调用归档能力整理，但不属于本 feature。
- **决策记录**：新增一份简短 ADR，记录为何选择上游优先的 Matt skills 加薄适配，而不是继续维护可执行证据状态机。
  已有“以 Matt skills 取代 OpenSpec”的 ADR 保持历史原意。
- **Bootstrap**：本 feature 经维护者明确批准，直接按本 spec 描述的新轻量流程实施，不创建即将退役的 v2 ledger、
  gate 或 checkpoint。

## 测试决策

- 测试关注维护者和 agent 可观察到的仓库行为，不验证 Markdown 内部字段或模拟已删除的状态机。
- 核心工作流切换通过最高层仓库入口验证：根 lint 不再调用 workflow checker，Husky 只检查 staged whitespace，
  文档索引仍能通过正式文档检查，现有 test orchestration 与 tooling performance 契约按新命令形状通过。
- 四个恢复的 core skills 与实施时核对的上游内容比较，忽略平台换行差异后应无语义差异。
- `archive-feature` 使用 skill-creator 的结构校验，并在一次性临时 Git fixture 中进行前向测试；验证目标解析、resolved
  前置条件、目录移动、引用修复、focused commit 和失败时不继续 merge。
- 每张 ticket 只运行其直接相关的聚焦检查、受影响根工具链检查和 `git diff --check`。文档变化运行
  `pnpm check:docs`。
- 准备合并时，在目标分支漂移处理完成后的最终实现内容上运行一次 `pnpm verify`。归档发生在完整验证之后，只追加与
  tracker/文档相关的轻量检查，不重复全仓代码测试。
- 每张 ticket 的 committed diff 使用上游 `code-review` 执行一次 Standards 与 Spec 双轴评审；修复改变内容时才重跑
  同一范围。

## 范围之外

- 不修改 IAM 产品功能、运行时应用、数据库 schema、Gateway 或前端行为。
- 不批量归档、删除、重写或补证既有 `.scratch/` feature。
- 不修改冻结的 `openspec/` 历史内容。
- 不为 Gitee、GitHub 或其他远端新增 issue、PR、push、deploy 或分支清理集成。
- 不建立新的 workflow schema、checker、CI gate、SHA 新鲜度或证据证明机制。
- 不把所有 Matt skills 重新翻译、重装或本地化；只恢复已确认偏离上游的四个 core skills。
- 不强制所有 Git merge 使用 squash；薄适配层只把 squash 作为默认明确建议。

## 补充说明

- 本 feature 当前位于专用功能分支，目标分支为 `main`。
- 上游差异调查基于实施前核对的 `mattpocock/skills` 当前版本；恢复时应再次确认来源，避免复制过期临时快照。
- 本 spec 是当前 feature 的正式事实来源；过程状态、验证和评审摘要记录在同目录的 `delivery.md`。
