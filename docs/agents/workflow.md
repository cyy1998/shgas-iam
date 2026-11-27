# 开发工作流补充

本仓库采用**分析设计与执行交付分离**的工作流：

- **Stage 1：分析与设计（T3 Code）** 负责只读代码调查、需求澄清、原型验证、在候选集成分支落盘设计产物及发布带原生任务图的 Spec/tickets（交接与回流见[设计与执行交接](sandcastle-afk.md#设计与执行交接)）。
- **Stage 2：执行与交付（Sandcastle AFK）** 负责完整 Spec 的无人值守实施、双轴只读评审、推前轻量验证、PR 交付与远端 `ci-gate` 限次修红闭环（详见[AFK 工作流](sandcastle-afk.md)）。
- **Fast Track：轻量直改与异常介入（T3 Code 单会话）** 负责小型明确改动、文档/配置修改、紧急 bugfix、UI 微调及 AFK 暂停后的人工排障，在单会话内完成实施、验证与 PR 交付。

小型明确任务在单会话内直接实施并验证；需要额外流程时，由用户显式调用
[`implement`](../../.agents/skills/implement/SKILL.md)、[`code-review`](../../.agents/skills/code-review/SKILL.md) 或
[`implement-spec`](../../.agents/skills/implement-spec/SKILL.md)。
需要跨引擎派发子代理、执行只读调查或显式双轴评审时，读[代码调查与双引擎编排](code-investigation.md#双引擎角色与评审编排)。
需求与跨会话恢复见[议题跟踪](issue-tracker.md)，当前行为与修改目标的判断见[文档索引](../index.md#当前事实与修改目标)。

## 授权与分支

- **按授权范围推进** 按用户已授权的范围连续推进。要求设计或拆票时止于设计落盘与发布 tickets；范围扩大、需求冲突或关键设计未定时先澄清。
- **候选集成分支复用** 同一 feature 的设计产物（`ADR`、`GLOSSARY.md`、设计文档等）直接提交在候选集成分支中，待实现、评审与验证全部通过后通过 Pull Request 整体合入目标分支。
  首次落盘改动前核对目标分支、工作区和已有分支，优先复用已有或用户指定分支，否则创建引擎无关前缀的 `feat/<feature-slug>`。
- **跨会话恢复** 文档随相关工作正常提交。跨会话按[议题跟踪](issue-tracker.md#当-skill-要求publish-to-the-issue-tracker)恢复同一分支与基线，保留未知改动并在覆盖前先解决重叠。
- **交付授权与只读主分支** 所有交付路径均通过 GitHub Pull Request 合入，保持本地目标分支（如 `main`）只读、不执行本地 `git merge --squash`，也不强推远端分支；合入 PR、手动关票与部署须由维护者另行授权或在 GitHub 完成（维护者明确要求改为本地合入时再按指令执行）。手动单会话与异常收尾在推送并建 PR 前提出一次交付确认（若用户本次指令已明确要求提交 PR，则直接执行）；Sandcastle AFK 的分支推送、建 PR、CI 修红与标签更新授权在启动 AFK 时统一授予。

## 验证节奏

- **实施过程验证** 实施中按改动运行受影响 workspace 的 Unit、typecheck 与定向 `pnpm test:integration`（`--workspace` / `--file`）；文档变化运行 `pnpm check:docs` 和 `git diff --check`。
  显式调用 `implement` 时，完整测试覆盖当前任务的全部受影响范围。
- **提交时检查** 格式与 lint 修复由[提交 Hook](../engineering/commands.md#commit-前检查)处理暂存文件；核对修复 diff，
  按实际变化重跑失效的类型或行为检查。
- **门禁分级** 合入 `main` 的唯一权威门禁是 GitHub Actions [`ci-gate`](../engineering/commands.md#github-actions-ci)（配合 Branch Protection）：
  - 差异仅属[纯文档验证](../engineering/commands.md#纯文档验证)范围且验收只涉及文档时，本地运行 `pnpm check:docs` 与 `git diff --check`（或完整 `pnpm check`）；推送 PR 后由 CI `detect` 路由至 `doc-check` 并经 `ci-gate` 放行。
  - 常规代码或配置改动在手动交付前完成 `pnpm check`、`pnpm test:unit` 与受影响范围的 `pnpm test:integration`（或运行 `pnpm verify` 覆盖上述检查与构建）；涉及跨服务旅程、生产 Dockerfile 或网关链路时，按需在本地补跑 `pnpm test:e2e`。推送 Ready PR 后由远端 CI 并行执行 `fast`、`integration` 并接续 `e2e`，最终以 `ci-gate` 绿灯为准。
  - 设计产物先落候选集成分支交接给 Sandcastle 时，完成文档格式化、`pnpm check:docs` 与 `git diff --check`，实施与权威门禁由 AFK 推前检查与远端 `ci-gate` 覆盖。
- **同宿主串行验证** 在同一宿主上串行运行 `pnpm verify`、全量 `pnpm test:integration` 和 `pnpm test:e2e`，跨会话、工作树及 Sandcastle AFK 均适用；
  待上一轮命令退出并完成测试资源清理后再启动下一轮。
- **验证结果复用** 同一候选已有通过结果时，核对候选 SHA、实际命令与检查范围，确认依赖、配置与环境一致后，只通过独立入口补跑缺失或失效项：
  - `pnpm check` 与 `pnpm test:unit` 已通过、只缺 Integration 时，按验收范围运行全量或定向 `pnpm test:integration`；
  - `pnpm verify`（含全量 L1 + L2 与构建）已通过、需要本地全系统验收时，运行 `pnpm test:e2e`；
  - 静态检查、Unit 与 Integration 已通过、仅构建失败时，补跑 `pnpm build`。
- 候选后续有修改时，按代码、依赖、配置或环境变化判断有效范围，存疑时扩大验证。最终证据覆盖当前候选的全部受影响范围，记录候选 SHA、实际命令、范围、结果与未执行项。
- 必需检查全部通过方可视为完成。认定基线失败须在固定基线与可比环境复现并记录证据，经维护者明确接受后方可作为例外。

命令见[命令入口](../engineering/commands.md)，验证的证明范围见[验证结果与交付](../engineering/testing.md#验证结果与交付)，
临时 PostgreSQL/Redis/APISIX 的供给与清理见[专用资源与隔离](../engineering/testing.md#专用资源与隔离)。

## 完成与 PR 交付

手动单会话（Fast Track）与 AFK 异常介入后的人工收尾均通过 **GitHub Pull Request** 交付（只读目标分支与授权规则见[授权与分支](#授权与分支)，GitHub 操作见[议题跟踪](issue-tracker.md)）。关联的 tickets 与父 Spec 在 PR 合并前保持 open，由 PR 正文中的 `Closes #<number>` 在合入时自动关票。

完成适用评审与最终验证后，按[授权与分支](#授权与分支)确认交付范围（列明 feature、适用 Spec/tickets、功能分支、目标分支与固定候选 SHA），随后连续执行：

1. **核对基线**：执行 `git fetch <remote> <target>` 检查远端目标分支 tip；若远端目标分支前进并引入冲突或影响验收，先整合最新基线、完成适用复审并重跑失效验证。
2. **非强制推送**：执行 `git push -u <remote> <branch>` 绑定 upstream（远端已有同名分支且非当前候选祖先时立即停止，绝不强推），确认工作区干净且远端 SHA 精确等于固定候选。
3. **创建或复用 PR**：在 T3 Code 会话中优先调用 `pull_request_create` 按 [`$pr`](../../.agents/skills/pr/SKILL.md) 与 [`GLOSSARY.md`](../../GLOSSARY.md) 起草正文（`## Summary`、`## Evidence`、`## Merge Danger`），有关联 issues 时逐行附加 `Closes #<number>`（父 Spec 与子票一并列出），创建以目标分支为 base 的 Ready for Review PR（用户指定时为 Draft；同分支且 `HEAD` 一致的 Open PR 幂等复用），并核验 PR 状态、base/head 与 `headSha`。
4. **更新关联议题与工作区**：有关联 Spec/tickets 时，评论 PR 链接与验证摘要并移除 `ready-for-agent` 标签。保留本地功能分支 ref 供维护者本地切出验收；若在独立 worktree 开发，待推送与建 PR 核验完成后按需保留或回收该临时 worktree。

失败时保留功能分支与实际进度，停止后续收尾并报告恢复点；恢复时先核对 Git、远端分支、已有 Open PR 与 issue 状态再继续。

## 文档与历史

新建或实质修改的 Markdown 正文使用自然中文；标识符、命令、路径、API/skill 名称和引用原文保持原语言。
文档归属与维护按[文档索引](../index.md#维护方式)，历史 tracker 的只读与归档边界按[议题跟踪](issue-tracker.md#历史兼容)。
