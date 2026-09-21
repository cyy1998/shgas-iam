# AI 开发工作流

`mattpocock/skills` 负责澄清、spec、tracer-bullet tickets、TDD、实现和双轴评审等通用方法。本文件只补充
上游无法知道的仓库约束；不要把 Matt 主流程、tracker schema 或证据状态机复制到这里。

`openspec/` 已冻结为只读历史材料，不是新工作的入口或当前规格来源。

## 入口、事实与目标

- 目标、验收和风险都明确、可在一个上下文完成的小型改动，可以直接进入 `/implement`，不创建 spec 或 tickets。
- 需要跨会话交付的 feature 使用 GitHub spec issue 和一票一个 issue 的 implementation tickets。跨会话状态由 issue
  正文、评论、assignee、labels 与 open/closed 状态共同表达。
- 稳定领域语言写入 `CONTEXT.md`，长期决策写入 `docs/adr/`，feature 范围与测试决策写入 spec issue，切片范围、blockers
  与验收写入 ticket issue。重要过程摘要和下一安全动作写入相关 issue 评论，并链接正式来源而不复制正文。
- 当前行为的证据优先级、修改目标与冲突处理，统一遵守[当前事实与修改目标](../index.md#当前事实与修改目标)。
- 用户直接要求拆票只授权完成 `/to-tickets`。Tickets 发布后，agent 必须停止、给出 implementation brief，并明确
  询问是否进入 `/implement`；只有用户在发布后手动确认，才构成实现授权。用户直接要求实现或继续某张 ticket，
  构成相应范围的实现授权。先前的合并指令、tracker 状态或历史事件不能越过此确认点；范围扩大、行为改变或架构
  决策不明确时也必须停止并请求确认。

GitHub 仓库、命令约定和读取顺序见 [GitHub 议题跟踪](issue-tracker.md)。

## 分支与工作区

- 只读调查、解释和评审不创建分支。
- 同一 feature 从讨论、Spec、拆票到实施使用同一个功能分支。首次准备写入受版本控制的文档或代码前，先确认目标
  分支 tip、工作区及该 feature 是否已有分支；已有分支时恢复并复用，否则从确认的目标分支创建
  `codex/<feature-slug>`。名称使用稳定的 feature 名称，不以 `discussion`、`design` 等阶段命名。
- 纯讨论不建分支；`grill-with-docs` 等流程开始写文档时按上述规则建分支。进入 `/implement` 或切换 ticket
  时先从 Spec 和交接记录恢复原分支，不因阶段或会话变化另建分支。用户明确指定的分支或并行 worktree 安排优先；
  记录的分支不存在或归属不明确时，先核对已有提交和恢复点，无法确定时再向维护者澄清。
- 不相关的未跟踪文件不自动阻断工作。未知改动必须原样保留；只有当前工作会重叠、覆盖或无法安全提交时才停止。
- 目标分支在获得本地交付授权前保持只读。不要因 implementation 授权自动 merge、push、部署或清理分支。

## 设计文档提交与交接

讨论中形成的术语和决策继续随讨论写入功能分支。维护者确认设计、准备发布 Spec 时，先核对本次讨论文档与
确认的设计一致，运行 `pnpm check:docs` 和 `git diff --check`，再创建独立的设计文档提交，随后发布 Spec。
该提交只包含本 feature 的讨论文档及必要索引更新；没有本地文档变化时不创建空提交。

Spec 中记录目标分支、功能分支及设计提交 SHA；没有设计提交时记录当前基线 SHA 并说明无本地文档变更。
尚未写入本地文件时，功能分支记为“尚未创建”，首次落盘建分支后补充记录。
拆票和实施交接沿用这些记录，首票从设计提交之后开始；开始实施前若仍有本 feature 遗留的讨论文档改动，
先完成设计确认、文档检查和独立提交，并更新交接记录，再开始首票。无 Spec 的小任务也在开始实现前提交已有的
讨论文档。实施中因某张 ticket 产生的设计修订随该 ticket 提交。

设计确认与文档提交不代表实施授权，发布 Spec 和拆票仍遵守各自授权边界。独立设计提交保留在功能分支历史中；
最终按下文 squash 合入时，目标分支仍只新增一个聚合提交。

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

批量模式下，子代理 dispatch 是强制的上下文边界，不是可选的并行优化。Ticket 的协作状态由 `ready-for-agent` label、
assignee 和 GitHub open/closed 状态表达：

1. 主会话按 blockers 顺序选择依赖前沿，只调度 blockers 已关闭、带 `ready-for-agent` label 且没有 assignee 的 open
   ticket。每张 ticket 都必须由主会话显式调用一个全新的 implementation 子代理；不得把主会话压缩、清空或总结后
   继续执行视为“全新上下文”。
2. 从首张 ticket 开始到最后一张已授权 ticket 关闭为止，主会话只负责分支与目标检查、只读调查、子代理调度与监控、
   评审组织和最终验证。主会话不得直接创建、修改、移动或删除任何受版本控制文件，也不得 stage 或 commit；claim、
   production/test/docs 改动、finding 修复和 issue 完成更新全部由对应子代理执行。
3. 若子代理工具支持控制历史继承，implementation 子代理必须禁用主会话历史继承，并从仓库事实来源恢复上下文。
   子代理读取功能分支、`AGENTS.md`、来源 spec issue、当前 ticket issue、blocker issues 及其相关评论，把 ticket 开始前
   的提交固定为 review fixed point，列出验收行为、相关验证命令与资源需求，并在其他写操作前通过
   `gh issue edit --add-assignee '@me'` 认领；不为 claim 创建独立 checkpoint。
4. 同一功能分支默认顺序执行 tickets，除非维护者明确要求并行分支或 worktree。当前 ticket 按下节完成交接前验证后，
   implementation 子代理创建正常的 focused implementation commit，并提交交接摘要：候选 SHA、实际执行的命令及结果、
   未执行项及原因、验收结果和评审轮次。
5. 主会话先检查必需验证与交接摘要是否齐全；缺少验证时退回原 implementation 子代理补齐，不计为评审失败。
   工具覆盖某条规则不等于工具已执行，通过交接检查后才按上述生命周期开始一轮 `/code-review`，对 review fixed point 到候选 `HEAD` 的完整范围执行 Standards
   与 Spec 评审。Finding 交回原 implementation 子代理，用额外 focused fix commit 修复，再由全新的两轴评审子代理
   重新审查完整范围；不自动 amend 或 rebase。
6. 验收满足、必需检查通过且两轴 findings 清零后，原 implementation 子代理在 ticket issue 评论中写入聚焦验证与评审摘要，确认验收项后关闭
   issue。Issue 评论保存验收结果，普通 focused commits 保存实现历史。
7. Ticket issue 关闭后，主会话才能为下一张已解阻 ticket 显式调用另一个全新的 implementation 子代理。
8. 同一 ticket 连续第 11 轮评审仍未通过时，停止批量实施并汇报每轮 findings、反复失败原因和当前恢复点。
   工具失败不计入评审轮数。
9. 如果批量模式下当前运行环境没有可用的子代理能力，主会话必须停止并向维护者报告；不得静默退回主会话直接实施。

## 验证节奏

- TDD 与实现内循环运行最高层相关测试、单测试文件，以及受影响 workspace 的 lint/typecheck；文档变化运行
  `pnpm check:docs`。每票、每轮修复在交接评审前必须通过 `pnpm verify:static`、当前 ticket 完整受影响范围的
  typecheck 与行为测试，以及 `git diff --check`。静态入口已包含 Collection Guard，无需另外重复执行。
- 上游 `/implement` 所说的结束时完整测试，在本仓库映射为当前 ticket 的完整受影响范围，不是每票运行全仓
  `pnpm verify`。
- `pnpm verify` 只在准备 merge、release 或用户明确要求时，在最终实现内容上运行一次。它不替代需要显式环境的
  PostgreSQL、浏览器 E2E 或 Gateway 检查。
- 最终验证的证明范围见[最终候选验证](../architecture/testing-architecture.md#默认验证与交付)。Collection Guard 只证明
  测试收集与命令可达，不证明测试断言已执行或通过。
- Integration 测试所需的 PostgreSQL 和 Redis 由调用方负责。没有专用测试 URL 时，agent 应在 Docker 可用的情况下
  启动本地临时容器，等待服务 ready，再把生成的 URL 传给测试命令；测试命令和 harness 本身不启动 Docker。
- 临时容器必须使用仓库声明的镜像版本、动态宿主端口和本次任务唯一的 name/label。Agent 创建容器后立即记录准确的
  container ID，并在测试成功、失败或中断后只按该 ID 清理，不使用 glob、prefix scan 或 prune。不得使用 development、
  runtime 或 production 资源。
- Docker 不可用或临时资源无法安全创建时，agent 必须明确报告未执行的测试及原因，不得把该测试记录为通过。
- 新失败先定位；只有在固定基线、可比环境中复现同样失败，才能认定为基线失败，并保留命令、失败现象与环境差异。
  必需检查失败或未执行时，不关闭 ticket、不宣称验收通过。维护者明确接受基线失败后才能记录例外继续推进；创建
  issue 本身不构成豁免。
- 不维护按路径展开的强制验证矩阵。Agent 根据风险选择直接相关的命令，并把结果摘要写入相关 issue 评论；命令无法运行时
  明确报告，不伪造通过记录。

可执行入口见 [构建、测试与开发命令](../development/commands.md)。

## 完成与本地合入

全部 tickets 完成后，父 spec issue 保持 open，报告“切片完成，最终验证待完成”。协调者确认候选与目标分支，
处理已发现的漂移并完成必要复审，再在固定最终候选上运行一次 `pnpm verify` 及 spec 要求的额外 Integration、E2E
或运维检查。全部必需验证通过后，在父 issue 记录固定候选 SHA 和最终验收结果，保持 open，报告
“验收通过，待人工授权收尾”。父 Spec 的关闭仅在下述人工授权收尾流程中执行；各 implementation ticket
仍按逐票验收规则关闭。代码候选通过验收不代表已合入或部署。
没有 issue 的直接实现也遵守先完成评审与最终验证、再请求本地收尾授权的顺序。

此时 agent 只提出一次收尾授权问题，列出 feature、适用 Spec issue、目标分支、固定采用的 squash merge 策略、
本地合入、关闭指定 Spec 和删除本地功能分支的完整范围，以及明确排除的外部副作用。关闭 Spec 是本次授权中
明确包含的 GitHub 写操作；没有 Spec 时跳过该项。维护者一次明确同意后，agent 连续完成下列步骤：

1. 再次核对候选 SHA 和目标分支 tip；内容未变化时复用最终验证，发生漂移或修改时更新候选、完成必要复审并重跑
   失效的验证，不能使用旧候选的结果合入；
2. 再次确认目标分支 tip 后，以 `git merge --squash` 加一个聚合提交完成本地合入；不得使用 fast-forward、普通 merge
   commit 或 rebase 代替；
3. 确认目标分支只新增一个 squash commit、该提交包含预期最终文件树且工作区干净；
4. 在适用的父 Spec issue 记录合入提交 SHA 和收尾结果并关闭，明确此次是本地合入；
5. 删除本地功能分支。

取得上述授权后，只要范围没有扩大且步骤没有失败，agent 不得在各步骤之间重复询问。任一步失败都停止后续动作并保留
功能分支作为恢复点，报告已完成步骤及实际 issue 状态；修复失败原因或改变范围需要新的维护者指示。
合入或核对失败时 Spec 保持 open；关闭 Spec 失败时保留已完成的本地合入和功能分支，不重复合入。
Push、远端分支删除、PR、部署和其他未列明的外部副作用不包含在上述授权中，必须单独取得许可。

## 历史兼容

- 既有 `.scratch/` 记录保持原路径和原内容；不批量迁移、翻译、补证或用新规则校验。
- GitHub issue 关闭即结束 tracker 生命周期。`archive-feature` 只适用于维护者明确点名并要求归档的历史
  `.scratch/<feature>`。
- `openspec/` 保留原路径。除维护者明确要求修正历史记录外，不得新增、修改、同步或归档其中内容。

## 文档语言

Agent 新建或实质修改的 Markdown 正文使用自然中文。代码标识符、命令、路径、API/skill 名称和引用原文保持原语言。
