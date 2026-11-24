# 开发工作流补充

本仓库采用**分析设计与执行交付分离**的工作流：

- **Stage 1：分析与设计（T3 Code，Antigravity + Codex 协作）** 负责只读代码调查、需求澄清、原型验证、在候选集成分支落盘
  `ADR`/`GLOSSARY.md`/设计文档，以及产出带原生任务图的 Spec 与 tickets。
- **Stage 2：执行与交付（Sandcastle AFK）** 承担完整 Spec 的无人值守实施、双轴评审（`gpt-6.2-astra` `xhigh`）、集中修复、
  全量验证、按 `$pr` 生成描述并推送创建 Pull Request（不改动本地 `main`）与临时工作树回收，详见[AFK 工作流](sandcastle-afk.md)。
- **Fast Track：轻量直改与异常介入（T3 Code 单会话）** 负责小型明确改动、文档/配置修改、紧急 bugfix、主观 UI/交互微调，
  以及 AFK 暂停（`Needs Attention`）时的人工排障回流，在单会话内直接完成。

小型明确任务在单会话内直接实施并验证；需要额外流程时，由用户显式调用
[`implement`](../../.agents/skills/implement/SKILL.md)、[`code-review`](../../.agents/skills/code-review/SKILL.md) 或
[`implement-spec`](../../.agents/skills/implement-spec/SKILL.md)。
需求与恢复记录见[议题跟踪](issue-tracker.md)，当前行为与修改目标的判断见[文档索引](../index.md#当前事实与修改目标)。

## 授权与分支

- **按授权范围推进** 按用户已授权的范围连续推进。要求设计或拆票时止于设计落盘与发布 tickets；范围扩大、需求冲突或关键设计未定时先澄清。
- **候选集成分支复用** 同一 feature 的设计产物（`ADR`、`GLOSSARY.md`、设计文档等）直接提交在候选集成分支中，待实现、评审与验证全部通过后再整体合入目标分支。
  首次落盘改动前核对目标分支、工作区和已有分支，优先复用已有或用户指定分支，否则创建引擎无关前缀的 `feat/<feature-slug>`。
- **跨会话恢复** 文档随相关工作正常提交。跨会话按[议题跟踪](issue-tracker.md#当-skill-要求publish-to-the-issue-tracker)恢复同一分支与基线，保留未知改动并在覆盖前先解决重叠。
- **合入确认** 手动单会话或异常收尾任务合入目标分支前，按[收尾约定](#完成与本地合入)单独确认；Sandcastle AFK 的交付授权在启动
  AFK 时统一授予（推送 Spec 分支并创建 Ready for Review PR，最终合入由维护者在 GitHub 完成）。

## 设计与执行交接

在 T3 Code 完成分析设计、准备为 Spec 与 tickets 标记 `ready-for-agent` 并交接给 Sandcastle AFK 前，按顺序完成以下门禁与 Git 准备：

1. **`ready-for-agent` 轻量门禁** 标记 `ready-for-agent` 前，由当前主会话启动一个**同引擎的新鲜只读 subagent**
   （Antigravity 用原生 `research`，Codex 用原生 `code_researcher`）独立核查四项：
   - 每张 ticket 的验收条件客观可测，且已明确测试 seam 与所需验证层级（Unit / Integration / E2E / Gateway）；
   - GitHub 原生父子关系（`--parent`）与阻塞边（`--blocked-by`）完整、无环且覆盖全部前置依赖；
   - 阻塞实现的 `ADR`、`GLOSSARY.md` 与设计决策均已提交到候选集成分支；
   - Spec 正文与本地 Git 状态满足下方 AFK 分支契约。
2. **AFK 候选集成分支契约**（与 [`scripts/sandcastle/tickets.ts`](../../scripts/sandcastle/tickets.ts) 对齐）：
   - **唯一分支声明**：存在设计产物分支时，在 Spec 正文仅声明一行 `集成分支：feat/<feature-slug>`（runner 据此确定唯一归属）；
   - **祖先关系成立**：确保候选集成分支包含当前调用分支（满足 `git merge-base --is-ancestor main feat/<feature-slug>`）；若期间
     `main` 前进，交接前先将最新 `main` 合入候选集成分支；
   - **切回调用分支、对齐远端且工作区干净**：启动 `pnpm sandcastle` 前，将主仓库工作区切回目标调用分支（如 `main`）、保持工作区干净且与远端
     `github/<branch>` 对齐（无未推送本地提交、未落后远端）；设计阶段若使用独立 worktree，必须先移除该外部 worktree（保留分支，避免被 runner 拒绝接管）。
3. **AFK 异常回流（`Needs Attention`）** Sandcastle 因设计歧义或难解失败暂停时，切回 T3 Code 处理：
   - 读取对应 Spec/ticket 的交接评论与集成分支现场；
   - 复杂问题交给 `deep_researcher` 定位根因；
   - 补齐 Spec 或修复阻塞点并重新满足上述分支契约后继续运行 AFK，或经用户确认在 T3 单会话完成收口并走[完成与本地合入](#完成与本地合入)。

## 双引擎角色与评审编排

仓库的 7 个角色契约统一维护在 `.codex/agents/*.toml`（供 Codex 原生子代理与 Sandcastle AFK 直接加载）。
在 T3 Code 交互阶段，Antigravity 与 Codex 按下表分工：

| 角色                                                                | 适用场景                                                                | 引擎与模型                                                                                                                 | 思考档位                                                                                             | 调用方式与隔离                                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`code_researcher`](../../.codex/agents/code-researcher.toml)       | 跨文件入口定位、调用链追踪、隔离搜索噪声、`ready-for-agent` 轻量门禁    | 同引擎原生优先：Antigravity 用 `research`（默认 `inherit`，轻扫可选 `flash`）；Codex 用 `code_researcher`（`gpt-6.2-sol`） | Antigravity 默认 `high`；Codex `reasoningEffort: "high"`                                             | 同引擎原生子代理，`shared`（硬只读沙箱）                                     |
| [`deep_researcher`](../../.codex/agents/deep-researcher.toml)       | 事务边界、并发/幂等、安全边界、证据冲突反证、AFK 难解失败定位           | 默认 Codex `gpt-6.2-sol`（Codex 主会话需异构复核时可选 Antigravity `gemini-4-neon`）                                       | Codex `reasoningEffort: "xhigh"`（极端疑难可由用户指定 `max`）；Antigravity `thought_level: "xhigh"` | 跨引擎走 `delegate_task`（`isolation: "shared"`）；同引擎走原生              |
| [`standards_reviewer`](../../.codex/agents/standards-reviewer.toml) | 显式 `code-review` 的 Standards 轴（仓库规范 + Fowler smell baseline）  | **固定** Codex `gpt-6.2-astra`                                                                                             | `reasoningEffort: "xhigh"`                                                                           | 与 `spec_reviewer` 并发走 `delegate_task`（`isolation: "shared"`）           |
| [`spec_reviewer`](../../.codex/agents/spec-reviewer.toml)           | 显式 `code-review` 的 Spec 轴（完整 Spec、tickets、验收与 scope creep） | **固定** Codex `gpt-6.2-astra`                                                                                             | `reasoningEffort: "xhigh"`                                                                           | 与 `standards_reviewer` 并发走 `delegate_task`（`isolation: "shared"`）      |
| 浏览器与 UI 视觉验收（按需）                                        | 仅用户明确要求页面检查、交互验证、截图或可视化原型时                    | **固定** Antigravity `gemini-4-neon`                                                                                       | `thought_level: "high"`                                                                              | Antigravity 主会话或独立 `delegate_task`（使用 `preview_*` / `html_render`） |

`implementer_light`、`implementer_standard`、`implementer_deep`（见 `.codex/agents/implementer-*.toml`）由 Sandcastle AFK
按票风险自动调度；T3 Code 下的 Fast Track 轻量直改由主会话单线完成。

编排约定：

1. **能力探测与阻塞上报** 每条线程首次调用 `delegate_task` 前先调用一次 `orchestrator_capabilities`。
   目标 provider 或模型不可用时直接报告阻塞并交由用户决策。
2. **跨引擎角色契约与只读核验** 通过 `delegate_task` 委派角色时，`task` 传递稀疏上下文指针（对应 `.codex/agents/<role>.toml`、
   `AGENTS.md`、issue/spec 编号、固定 base/candidate SHA 与范围）。经 `delegate_task` 执行的只读角色
   （`deep_researcher`、`standards_reviewer`、`spec_reviewer`）在 `task` 中明确限定为只读范围，返回后由主会话核对 `git status` 干净。
3. **显式双轴评审** 调用 `code-review` 时提供起始基线、固定候选 SHA 和已确认需求来源，评审期间保持候选固定。
   两轴并发启动两个独立的 Codex `gpt-6.2-astra`（`reasoningEffort: "xhigh"`）`delegate_task`；每轮复审均新建独立
   `delegate_task`，评审 findings 由主会话直接修复并验证。
4. **T3 Code 工作树与子任务管理** 主会话需要脱离主目录隔离工作时使用 `t3_worktree_handoff`。
   用户显式要求在 T3 Code 派发独立工作树子任务时，先提交父分支基线，再由父会话通过 `delegate_task(isolation: "worktree")`
   创建隔离 checkout；异步任务等待系统通知推进，需要停止时调用 `task_cancel`。

## 验证节奏

- **实施过程验证** 实施中按改动运行相关测试、受影响 workspace 的 typecheck；文档变化运行 `pnpm check:docs` 和 `git diff --check`。
  显式调用 `implement` 时，完整测试覆盖当前任务的全部受影响范围。
- **提交时检查** 格式与 lint 修复由[提交 Hook](../engineering/commands.md#commit-前检查)处理暂存文件；核对修复 diff，
  按实际变化重跑失效的类型或行为检查。
- **门禁分级** 手动交付前以合入目标的固定提交与候选比较：差异仅属[纯文档验证](../engineering/commands.md#纯文档验证)范围且验收只涉及文档时运行
  `pnpm verify:docs --base <target-commit>`；其余改动完成 `pnpm verify` 覆盖的全部检查，并按 Spec 与风险补齐所需 Integration、E2E、Gateway 检查。
  手动交付时在最终候选执行 `pnpm verify:container-smoke --base <target-commit>`，由打包路径差异决定是否追加冒烟。
  同一候选已通过 `pnpm verify:release` 时复用其中的冒烟结果。
  设计产物先落候选集成分支交接给 Sandcastle 时，完成文档格式化、`pnpm check:docs` 与 `git diff --check`，完整门禁由 AFK 最终验证统一覆盖。
- **同宿主串行验证** 在同一宿主上串行运行 `pnpm verify`、全量 Integration 和 Full-system E2E，跨会话、工作树及 Sandcastle AFK 均适用；
  待上一轮命令退出并完成测试资源清理后再启动下一轮。需要一次完成全部发布验证时使用 `pnpm verify:release`。
- **验证结果复用** 同一候选已有通过结果时，核对候选 SHA、实际命令与检查范围，确认依赖、配置与环境一致后，只通过独立入口补跑缺失或失效项：
  - `pnpm verify` 已通过、只缺 Integration 时，按验收范围运行全量或定向 `pnpm test:integration`；
  - `pnpm verify` 和全量 Integration 已通过、只缺 E2E 时，运行 `pnpm test:e2e`；
  - `pnpm verify` 的静态检查、typecheck 和 Unit 已通过、仅 build 失败时，补跑 `pnpm build`。
- 候选后续有修改时，按代码、依赖、配置或环境变化判断有效范围，存疑时扩大验证。最终证据覆盖当前候选的全部受影响范围，记录候选 SHA、实际命令、范围、结果与未执行项。
- 必需检查全部通过方可视为完成。认定基线失败须在固定基线与可比环境复现并记录证据，经维护者明确接受后方可作为例外。

命令见[命令入口](../engineering/commands.md)，验证的证明范围见[验证结果与交付](../engineering/testing.md#验证结果与交付)，
临时 PostgreSQL/Redis 的创建与清理见[专用资源与隔离](../engineering/testing.md#专用资源与隔离)。

## 完成与本地合入

手动单会话与异常收尾默认本地交付，父 Spec 在最终合入前保持 open；tickets 的完成按所用流程执行，GitHub 操作见[议题跟踪](issue-tracker.md)。
完整 Spec 的 AFK 交付由 Sandcastle 自动推送分支并创建关联 `Closes #...` 的 Pull Request（不改动本地目标分支），由维护者验收并在 GitHub 合并时自动关票；
以下流程用于 Fast Track 手动任务或 AFK 异常介入后的人工收口。

完成适用评审和最终验证后，提出一次收尾确认，列明 feature、适用 Spec、目标分支、固定候选 SHA，以及
本地 squash 合入、关闭父 Spec、删除本地功能分支的完整范围（无 Spec 时跳过关票）。
Push、远端分支删除、PR 和部署须另行授权。

取得授权后连续完成：

1. 核对候选与目标分支 tip；发生漂移时先整合、完成适用复审并重跑失效验证。
2. 用 `git merge --squash` 和一个聚合提交本地合入目标分支。
3. 确认目标分支只新增一个 squash commit、文件树符合最终候选且工作区干净。
4. 在父 Spec 记录本地合入 SHA 并关闭，再删除本地功能分支（及本次创建且确认已集成、未被工作树检出的临时分支；
   因 squash 历史被 `git branch -d` 拒绝时，在核验树一致后用 `git branch -D -- <分支名>`）。

失败时保留功能分支与实际进度，停止后续收尾并报告恢复点；恢复时先核对 Git 与 issue 状态再继续。

## 文档与历史

新建或实质修改的 Markdown 正文使用自然中文；标识符、命令、路径、API/skill 名称和引用原文保持原语言。
文档归属与维护按[文档索引](../index.md#维护方式)，历史 tracker 的只读与归档边界按[议题跟踪](issue-tracker.md#历史兼容)。
