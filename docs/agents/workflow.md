# AI 开发工作流

`mattpocock/skills` 负责澄清、spec、tracer-bullet tickets、TDD、实现和双轴评审等通用方法。本文件只补充
上游无法知道的仓库约束；不要把 Matt 主流程、tracker schema 或证据状态机复制到这里。

`openspec/` 已冻结为只读历史材料，不是新工作的入口或当前规格来源。

## 入口与本地事实来源

- 目标、验收和风险都明确、可在一个上下文完成的小型改动，可以直接进入 `/implement`，不创建 spec、tickets 或
  `delivery.md`。
- 需要跨会话交付的 feature 使用 `.scratch/<feature>/spec.md`、一票一文件的 tickets 和一份 feature 级
  `delivery.md`。所有进入 `/to-tickets` 的 feature 都必须有 journal：已知会跨会话时随 `/to-spec` 创建，否则在
  发布首批 tickets 时补建。
- 稳定领域语言写入 `CONTEXT.md`，长期决策写入 `docs/adr/`，feature 范围与测试决策写入 spec，切片范围与验收写入
  ticket。`delivery.md` 只保存过程摘要和指针；发生冲突时，以这些正式文档为准。
- 用户直接要求拆票只授权完成 `/to-tickets`。Tickets 发布后，agent 必须停止、给出 implementation brief，并明确
  询问是否进入 `/implement`；只有用户在发布后手动确认，才构成实现授权。用户直接要求实现或继续某张 ticket，
  构成相应范围的实现授权。先前的合并指令、tracker 状态或历史事件不能越过此确认点；范围扩大、行为改变或架构
  决策不明确时也必须停止并请求确认。

本地文件形状和读取顺序见 [本地 Markdown 议题跟踪](issue-tracker.md)。

## 分支与工作区

- 只读调查、解释和评审不创建分支。
- 在目标分支上即将首次修改受版本控制文件时，先确认目标 tip 和工作区，再创建 `codex/<feature-slug>`；已经位于
  用户指定的功能分支时继续使用该分支。
- 不相关的未跟踪文件不自动阻断工作。未知改动必须原样保留；只有当前工作会重叠、覆盖或无法安全提交时才停止。
- 目标分支在获得本地交付授权前保持只读。不要因 implementation 授权自动 merge、push、部署或清理分支。

## 多 Ticket 协调与交接

本节适用于由 `.scratch/<feature>/issues/` 管理的多 Ticket `/implement`。子代理 dispatch 是强制的上下文边界，
不是可选的并行优化。Ticket 状态是协作提示，生命周期为 `ready-for-agent → claimed → resolved`，不是 gate：

1. 主会话按 blockers 顺序选择依赖前沿，只调度 blockers 已 `resolved` 的 ticket。每张 ticket 都必须由主会话显式
   调用一个全新的 implementation 子代理；不得把主会话压缩、清空或总结后继续执行视为“全新上下文”。
2. 从首张 ticket 开始到最终 handoff commit 完成为止，主会话只负责分支与目标检查、只读调查、子代理调度与监控、
   评审组织和最终验证。主会话不得直接创建、修改、移动或删除任何受版本控制文件，也不得 stage 或 commit；claim、
   production/test/docs 改动、finding 修复、tracker handoff 及其提交全部由对应子代理执行。
3. 若子代理工具支持控制历史继承，implementation 子代理必须禁用主会话历史继承，并从仓库事实来源恢复上下文。
   子代理读取功能分支、`AGENTS.md`、来源 spec、当前 ticket、blockers 和 `delivery.md`，把 ticket 开始前的提交固定为
   review fixed point，并在其他文件改动前把 ticket 状态改为 `claimed`；不为 claim 创建独立 checkpoint。
4. 同一功能分支默认顺序执行 tickets，除非维护者明确要求并行分支或 worktree。当前 ticket 完成验收与聚焦验证后，
   implementation 子代理创建正常的 focused implementation commit。
5. 主会话随后显式调用相互独立、只读的 Standards 与 Spec 评审子代理，对 review fixed point 到候选 `HEAD` 的完整
   范围执行 `/code-review`。Finding 交回原 implementation 子代理，用额外 focused fix commit 修复，再由两轴重新
   审查完整范围；不自动 amend 或 rebase。
6. 两轴 findings 清零后，原 implementation 子代理勾选验收项、把 ticket 标为 `resolved`、更新 journal，并创建只
   包含本 feature tracker 状态的轻量 handoff commit。Ticket 不写 Resolution schema、候选 SHA 或证据新鲜度字段。
7. Handoff commit 完成后，主会话才能为下一张已解阻 ticket 显式调用另一个全新的 implementation 子代理。
8. 如果当前运行环境没有可用的子代理能力，主会话必须停止并向维护者报告；不得静默退回主会话直接实施。

## 验证节奏

- TDD 与实现内循环运行最高层相关测试、单测试文件，以及受影响 workspace 的 lint/typecheck；文档变化运行
  `pnpm check:docs`，所有 ticket 在提交前运行 `git diff --check`。
- 上游 `/implement` 所说的结束时完整测试，在本仓库映射为当前 ticket 的完整受影响范围，不是每票运行全仓
  `pnpm verify`。
- `pnpm verify` 只在准备 merge、release 或用户明确要求时，在最终实现内容上运行一次。它不替代需要显式环境的
  PostgreSQL、浏览器 E2E 或 Gateway 检查。
- 不维护按路径展开的强制验证矩阵。Agent 根据风险选择直接相关的命令，并把结果摘要写入 journal；命令无法运行时
  明确报告，不伪造通过记录。

可执行入口见 [构建、测试与开发命令](../development/commands.md)。

## 完成、归档与本地合入

全部实现完成后，agent 用一个明确问题列出 feature、目标分支和拟采用的 merge 策略，询问是否归档并完成本地合入。
默认建议 squash，但维护者可以在同一回复中指定其他策略。该问题同时列明目标分支漂移处理、一次 `pnpm verify`、
显式归档、merge、交付提交可达性确认和本地功能分支删除的完整本地范围，并明确排除 push 与远端分支删除。一次明确
回复可以同时授权下列本地事务：

1. 处理目标分支漂移；
2. 在最终实现内容上运行一次 `pnpm verify`；
3. 显式调用仓库级 `archive-feature` 能力归档 tracker，并运行其轻量文档与 whitespace 检查；
4. 再次确认目标分支 tip 后，按指定策略 merge；
5. 确认交付提交可从目标分支到达后，删除本地功能分支。

任一步失败都停止后续动作并保留功能分支作为恢复点。`archive-feature` 本身不得 merge、push 或删除分支。Push、远端分支
删除、PR、部署和其他外部副作用不包含在上述授权中，必须单独取得许可。

## 历史兼容

- 既有 `.scratch/` 记录保持原路径和原内容；不批量迁移、翻译、补证或用新规则校验。
- 已完成 feature 只在维护者显式调用归档能力时移动；归档不是 implementation 或 merge 的隐式 gate。
- `openspec/` 保留原路径。除维护者明确要求修正历史记录外，不得新增、修改、同步或归档其中内容。

## 文档语言

Agent 新建或实质修改的 Markdown 正文使用自然中文。代码标识符、命令、路径、API/skill 名称和引用原文保持原语言。
