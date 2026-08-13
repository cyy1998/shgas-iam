# AI 开发工作流

`mattpocock/skills` 负责澄清、spec、tracer-bullet tickets、TDD、实现和双轴评审等通用方法。本文件只补充
上游无法知道的仓库约束；不要把 Matt 主流程、tracker schema 或证据状态机复制到这里。

`openspec/` 已冻结为只读历史材料，不是新工作的入口或当前规格来源。

## 入口、事实与目标

- 目标、验收和风险都明确、可在一个上下文完成的小型改动，可以直接进入 `/implement`，不创建 spec、tickets 或
  `delivery.md`。
- 需要跨会话交付的 feature 使用 `.scratch/<feature>/spec.md`、一票一文件的 tickets 和一份 feature 级
  `delivery.md`。所有进入 `/to-tickets` 的 feature 都必须有 journal：已知会跨会话时随 `/to-spec` 创建，否则在
  发布首批 tickets 时补建。
- 稳定领域语言写入 `CONTEXT.md`，长期决策写入 `docs/adr/`，feature 范围与测试决策写入 spec，切片范围与验收写入
  ticket。`delivery.md` 只保存过程摘要和指针；这些文件各有职责，不使用一个笼统优先级处理所有冲突。
- 判断当前行为时，证据优先级为实现、生效配置与可执行测试结果，随后是标记为 `Current` 的维护文档和其他历史线索。
  证据不一致时应明确报告并调查差异，不得用目标规格或决策文档替代已观察到的行为。
- 判断本次修改目标时，以用户当前授权的目标和适用 spec/ticket 的验收要求界定范围，以 `CONTEXT.md`、已接受 ADR 和
  当前工程文档约束实现。现有实现只是修改基线；目标依据彼此冲突或范围不清时，必须先请求澄清。
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

## 双轴评审子代理生命周期

- 每轮双轴评审都新建相互独立、只读的 Standards 与 Spec 子代理；不得复用上一轮、其他 ticket 或其他改动的评审
  子代理。没有可用 spec 时，按 `/code-review` 规则跳过 Spec 轴并明确报告，不创建没有输入依据的 Spec 子代理。
- 一轮评审固定使用同一个不可变 review base SHA 和 candidate HEAD SHA。修复 finding 或因其他原因需要重新评审时，
  都开始新一轮，并重新创建本轮适用的全部评审子代理。
- 每轮都向新子代理提供完整 diff、提交列表和本轴依据。第二轮及后续轮次还要提供上一轮 findings 及其处理结果作为
  复查清单，但仍重新审查完整范围，不能只验证旧 findings。
- 原 implementation 子代理在各轮之间保持不变，负责接收和修复 findings；评审子代理只服务当前一轮，不修改文件、
  stage 或 commit。

## 多 Ticket 批量实施的协调与交接

`/implement` 默认由当前会话直接实施；无 ticket 的小型改动或本次只获授权实施一张 ticket 时，不启动专用
implementation 子代理。即使同一 tracker 中还存在其他 tickets，也不能仅凭这一事实触发 dispatch。只有本次
`/implement` 获得一次性实施两张及以上 tickets 的明确授权时，才进入下述批量模式，并为每张 ticket 启动一个全新的
implementation 子代理。这里的限制只针对实施子代理；评审子代理按上一节的生命周期管理。

批量模式下，子代理 dispatch 是强制的上下文边界，不是可选的并行优化。Ticket 状态是协作提示，生命周期为
`ready-for-agent → claimed → resolved`，不是 gate：

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
5. 主会话随后按上述生命周期开始一轮 `/code-review`，对 review fixed point 到候选 `HEAD` 的完整范围执行 Standards
   与 Spec 评审。Finding 交回原 implementation 子代理，用额外 focused fix commit 修复，再由全新的两轴评审子代理
   重新审查完整范围；不自动 amend 或 rebase。
6. 两轴 findings 清零后，原 implementation 子代理勾选验收项、把 ticket 标为 `resolved`、更新 journal，并创建只
   包含本 feature tracker 状态的轻量 handoff commit。Ticket 不写 Resolution schema、候选 SHA 或证据新鲜度字段。
7. Handoff commit 完成后，主会话才能为下一张已解阻 ticket 显式调用另一个全新的 implementation 子代理。
8. 如果批量模式下当前运行环境没有可用的子代理能力，主会话必须停止并向维护者报告；不得静默退回主会话直接实施。

## 验证节奏

- TDD 与实现内循环运行最高层相关测试、单测试文件，以及受影响 workspace 的 lint/typecheck；文档变化运行
  `pnpm check:docs`，所有 ticket 在提交前运行 `git diff --check`。
- 上游 `/implement` 所说的结束时完整测试，在本仓库映射为当前 ticket 的完整受影响范围，不是每票运行全仓
  `pnpm verify`。
- `pnpm verify` 只在准备 merge、release 或用户明确要求时，在最终实现内容上运行一次。它不替代需要显式环境的
  PostgreSQL、浏览器 E2E 或 Gateway 检查。
- Integration 测试所需的 PostgreSQL 和 Redis 由调用方负责。没有专用测试 URL 时，agent 应在 Docker 可用的情况下
  启动本地临时容器，等待服务 ready，再把生成的 URL 传给测试命令；测试命令和 harness 本身不启动 Docker。
- 临时容器必须使用仓库声明的镜像版本、动态宿主端口和本次任务唯一的 name/label。Agent 创建容器后立即记录准确的
  container ID，并在测试成功、失败或中断后只按该 ID 清理，不使用 glob、prefix scan 或 prune。不得使用 development、
  runtime 或 production 资源；`IAM_API_CORE_CLEANUP_TEST_REDIS_URL` 还必须使用独立的临时 Redis。
- Docker 不可用或临时资源无法安全创建时，agent 必须明确报告未执行的测试及原因，不得把该测试记录为通过。
- 不维护按路径展开的强制验证矩阵。Agent 根据风险选择直接相关的命令，并把结果摘要写入 journal；命令无法运行时
  明确报告，不伪造通过记录。

可执行入口见 [构建、测试与开发命令](../development/commands.md)。

## 完成、归档与本地合入

`/implement` 的全部实现及适用的 ticket handoff、双轴评审完成后，agent 只提出一次本地收尾授权问题，不得把最终
校验、归档、合并和分支删除拆成多次确认。问题必须列出 feature、目标分支、固定采用的 squash merge 策略、将要连续
执行的完整本地范围，以及明确排除的外部副作用。Feature 存在 tracker 时，问题还必须点名 feature slug，并明确写出
“归档 tracker”；维护者对该问题的明确同意，即构成 `archive-feature` 所需的自然语言归档授权。没有列出归档动作的
“合入”“收尾”等请求不授权归档。维护者一次明确同意后，agent 连续完成下列本地事务：

1. 处理目标分支漂移；
2. 在最终实现内容上运行一次 `pnpm verify`；
3. feature 存在 tracker 时，显式调用仓库级 `archive-feature` 能力归档 tracker，并运行其轻量文档与 whitespace 检查；
4. 再次确认目标分支 tip 后，以 `git merge --squash` 加一个聚合提交完成本地合入；不得使用 fast-forward、普通 merge
   commit 或 rebase 代替；
5. 确认目标分支只新增一个 squash commit、该提交包含预期最终文件树且工作区干净后，删除本地功能分支。

取得上述授权后，只要范围没有扩大且步骤没有失败，agent 不得在各步骤之间重复询问。任一步失败都停止后续动作并保留
功能分支作为恢复点；修复失败原因或改变范围需要新的维护者指示。`archive-feature` 本身不得 merge、push 或删除分支。
Push、远端分支删除、PR、部署和其他外部副作用不包含在上述授权中，必须单独取得许可。

## 历史兼容

- 既有 `.scratch/` 记录保持原路径和原内容；不批量迁移、翻译、补证或用新规则校验。
- 已完成 feature 只在维护者直接要求归档，或明确同意一条已经点名 feature 和归档动作的收尾问题时移动；归档不是
  implementation 或 merge 的隐式 gate。
- `openspec/` 保留原路径。除维护者明确要求修正历史记录外，不得新增、修改、同步或归档其中内容。

## 文档语言

Agent 新建或实质修改的 Markdown 正文使用自然中文。代码标识符、命令、路径、API/skill 名称和引用原文保持原语言。
