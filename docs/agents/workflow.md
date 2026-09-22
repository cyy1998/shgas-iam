# AI 开发工作流

`mattpocock/skills` 负责澄清、spec、tracer-bullet tickets、TDD、实现和评审等通用方法。本文件只补充
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
- 手动 `/implement` 实施当前获授权的一张 ticket 或小型改动；无人值守批量实施使用下文的 Sandcastle AFK 路径。
  维护者运行 `pnpm sandcastle` 或明确要求启动该路径，即授权本次运行处理全仓 `ready-for-agent` backlog、
  在调用分支本地合入、评论及关闭已验收 tickets 和完成的父 Spec；配置执行器本身不等于启动它。

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

以上功能分支复用约定适用于手动路径。AFK 在启动时固定调用分支，每张 ticket 使用由 issue 编号派生的独立分支和
worktree；同批分支从该批调用分支基线开始，批后以普通 `git merge` 合回调用分支。已有 ticket 分支先核对并恢复，
不能覆盖未完成工作。运行期间调用分支由该 runner 独占写入；启动 AFK 的授权已包含这些本地合入，不包含 push、
PR 或部署。

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
手动路径最终按下文 squash 合入时，目标分支仍只新增一个聚合提交；AFK 保留普通提交与合并历史。

## 双轴评审子代理生命周期

本节适用于手动 `/implement`、显式 `/code-review` 和 AFK 实施者会话内的评审。

- 每轮双轴评审都新建相互独立、只读的 Standards 与 Spec 子代理；不得复用上一轮、其他 ticket 或其他改动的评审
  子代理。手动路径没有可用 spec 时，按 `/code-review` 规则跳过 Spec 轴并明确报告；AFK 以 ticket 本身及其来源
  Spec 为验收依据，Spec 轴不可跳过，无法取得验收依据时报告失败。
- 一轮评审固定使用同一个不可变 review base SHA 和 candidate HEAD SHA。修复 finding 或因其他原因需要重新评审时，
  都开始新一轮，并重新创建本轮适用的全部评审子代理。
- 每轮都向新子代理提供完整 diff、提交列表和本轴依据。第二轮及后续轮次还要提供上一轮 findings 及其处理结果作为
  复查清单，但仍重新审查完整范围，不能只验证旧 findings。
- 原实施会话在各轮之间保持不变，负责接收和修复 findings；评审子代理只服务当前一轮，不修改文件、
  stage 或 commit。

双轴评审由实施者负责执行，AFK runner 不解析评审报告或会话事件来判断是否通过。实施者等待两轴实际完成，
在交接中保留真实最终报告、固定 review base/candidate SHA 和 findings 的处置结果，供 Merger 阅读核对。
报告使用自然语言即可；最终候选两轴均无未解决 findings 才可交付，缺失或失败的评审不能用旧候选的通过结果代替。

## Sandcastle AFK 批量实施

批量路径参考作者自用的
[Sandcastle runner](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/.sandcastle/run.ts)，
由本机 runner 调用 Docker 中的 Codex CLI，无需聊天主会话持续协调。选票和批后合入沿用作者的运行模型，
实施者选择与会话内双轴评审采用本仓库适配。三个阶段如下：

1. **Planner**：每轮读取全仓 open `ready-for-agent` issues、来源 Spec、依赖与交接，选择适合并行的一批切片。
   有子票的父 issue 留给合入阶段核对，不作为实施切片；assignee 用于识别已有工作，不抢占他人正在实施的 ticket。
   优先选择已解阻项；全部候选受阻时，允许按作者策略选择一张受阻 ticket 尝试推进并说明 blocker，未满足依赖或
   验收时仍保持 open。Planner 为每票从仓库定义的 `implementer_light`、`implementer_standard`、
   `implementer_deep` 中选择实施者并说明理由：范围明确的小修改可选 light，常规功能或信息不足选 standard，
   涉及安全边界、并发、一致性或复杂重构选 deep。Runner 校验角色名称并加载对应配置。
2. **Implementer**：每票在独立分支、worktree 和全新会话中读取 `AGENTS.md`、ticket、Spec 与相关评论，恢复
   验收和验证要求，认领后按 skills 的方法实施、运行聚焦验证并创建正常提交。在同一实施者会话内调用
   `/code-review`，按上一节并行启动 Standards 与 Spec 两个只读子代理；实施者接收 findings、修复并验证，
   然后开始新一轮双轴评审。每票每次实施者会话最多十轮，review base 全程固定，每轮固定本轮 candidate SHA 并审查累计完整差异。
   两轴都通过且候选未变化才可交付；子代理不可用、评审缺失、轮数耗尽或必需验证未通过时报告失败并保留 ticket
   为 open。交接包含实施者选择、上一节的评审材料、实际命令及结果、未执行项和剩余问题。
   不另设顶层 Reviewer；评审模型与只读职责由各自角色文件定义，CLI 的权限限制见命令页。
3. **Merger**：等待本批所有 Implementer 结束后，阅读各票真实评审报告与验收记录，确认满足交付条件后以普通 `git merge` 合回
   调用分支，解决合并冲突并按下节在最终合并内容上验证。类型检查或测试失败时先诊断，在本批授权范围内自行修复，
   重跑失效检查后继续。验证通过后记录合入 SHA、
   验收和评审摘要，关闭成功 tickets；父 Spec 的全部切片及最终验收均完成时一并关闭。随后进入下一轮。
   进入下一轮前，runner 核对本批全部候选已合入、tickets 已关闭，再删除对应本地 ticket 分支；只删除仍指向合入候选的分支，
   分支已变化或仍被 worktree 使用时停止清理并报告，不强制删除。失败票的分支继续保留供恢复。
   Planner 没有实施票可派发时，再由 Merger 核对一次待收尾父 Spec，恢复子票已关闭、父 Spec 更新失败的情况。
   Merger 正常结束但未输出完成标记时，SDK 最多执行十次迭代；每次依据 Git 和 issue 恢复记录继续未完成步骤，
   不重复已完成的合入和关票。迭代上限耗尽仍未完成时终止 runner；初始化或进程异常不由此迭代机制重试。

GitHub Issues 保存需求、协作状态与恢复说明，Git 提交保存实现历史；日志和本地分支辅助恢复，不替代 issue 事实。
合并、必需验证或 issue 更新尚未完成时，先恢复当前批次再进入下一批；无法自行解决时报告阻碍和恢复点。
保留分支和工作区现场，不自动 reset 或重复合入。
未完成或缺少必需检查的 ticket 保持 open；正常进程退出、存在提交或 Implementer 宣称完成都不能替代验收结果。

运行环境、命令和当前资源限制见 [Sandcastle AFK 命令](../development/commands.md#sandcastle-afk)。

## 验证节奏

- TDD 与实现内循环运行最高层相关测试、单测试文件，以及受影响 workspace 的 lint/typecheck；文档变化运行
  `pnpm check:docs`。每票首次交接评审前，通过一次 `pnpm verify:static`、当前 ticket 完整受影响范围的
  typecheck 与行为测试，以及 `git diff --check`。静态入口已包含 Collection Guard，无需另外重复执行；
  AFK runner 不再重复实施者的静态和 diff 检查。
- 评审修复后按实际变化重跑失效的检查，补齐新增范围的验证；未受代码、依赖、配置或环境变化影响的通过结果可以复用，
  在交接中说明复用依据。无法判断影响范围时扩大验证，不能用复用理由掩盖失败或未执行项。每轮评审仍覆盖完整累计差异，
  但不要求每轮重跑整套测试；最终交付必须具备覆盖当前候选全部受影响范围的有效证据。
- 上游 `/implement` 所说的结束时完整测试，在本仓库映射为当前 ticket 的完整受影响范围，不是每票运行全仓
  `pnpm verify`。
- `pnpm verify` 只在准备 merge、release 或用户明确要求时，在最终实现内容上运行一次。它不替代需要显式环境的
  PostgreSQL、浏览器 E2E 或 Gateway 检查。AFK 由 Merger 在整批合并后的最终内容上运行一次 `pnpm verify`，
  将本批各票及 Spec 所需的额外 Integration、E2E、Gateway 检查按覆盖范围去重后执行一次，不能用各实施分支的
  结果代替合并后的验证。最终验证后再有修改时，重跑因此失效的检查。
- 最终验证的证明范围见[最终候选验证](../architecture/testing-architecture.md#默认验证与交付)。Collection Guard 只证明
  测试收集与命令可达，不证明测试断言已执行或通过。
- Integration 测试所需的 PostgreSQL 和 Redis 由调用方负责。没有专用测试 URL 时，agent 应在 Docker 可用的情况下
  启动本地临时容器，等待服务 ready，再把生成的 URL 传给测试命令；测试命令和 harness 本身不启动 Docker。
- 临时容器必须使用仓库声明的镜像版本和本次任务唯一的 name/label；宿主访问使用动态端口，AFK sandbox 通过独占网络访问时不发布宿主端口。Agent 创建容器后立即记录准确的
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

以下人工授权收尾适用于手动路径。AFK 的合并、关票和父 Spec 验收按上一节执行，启动时已授权，无需每批再次询问；
必需验证和实际合入结果仍是完成条件。

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
