# 开发工作流补充

完整 Spec 的手动实施以 [`implement-spec`](../../.agents/skills/implement-spec/SKILL.md) 为主流程；本页只补充仓库特有约束。
需求澄清、拆票、调度和评审等通用步骤由对应 skill 维护，不在项目文档中复述。

小型明确任务直接实施和验证，无需创建 issue，也不自动调用 `implement` 或双轴评审。只有用户显式调用
[`implement`](../../.agents/skills/implement/SKILL.md) 时，小任务才执行该 skill 的评审流程；用户也可单独要求
[`code-review`](../../.agents/skills/code-review/SKILL.md)。

运行或维护 Sandcastle AFK 时另读 [AFK 工作流](sandcastle-afk.md)；本页的手动授权与收尾规则不适用于 AFK。
需求与恢复记录见[议题跟踪](issue-tracker.md)，当前行为与修改目标的判断见[文档索引](../index.md#当前事实与修改目标)。

## 授权与分支

- 按用户已授权的范围连续推进。只要求拆票时止于拆票；已明确授权拆票并实施时，发布 tickets 后直接继续。
  范围扩大、需求冲突或关键设计未定时，先澄清对应问题。
- 同一 feature 从讨论落盘到实施复用同一功能分支；在 `implement-spec` 中它就是集成分支。
  首次落盘前核对目标分支、工作区和已有分支；没有可复用分支时创建 `codex/<feature-slug>`。
  只读调查不建分支，用户指定的分支或 worktree 安排优先。
- 文档随相关工作正常提交。跨会话按[议题跟踪](issue-tracker.md#当-skill-要求publish-to-the-issue-tracker)恢复分支和基线，
  不因阶段变化另建功能分支。未知改动原样保留，发生覆盖风险时先解决重叠。
- 实施授权包含集成分支内的提交、合并和修复；目标分支的本地合入按[收尾约定](#完成与本地合入)单独确认。

## 实施者与评审适配

手动编排按角色描述选择 [`implementer_light`](../../.codex/agents/implementer-light.toml)、
[`implementer_standard`](../../.codex/agents/implementer-standard.toml) 或
[`implementer_deep`](../../.codex/agents/implementer-deep.toml)，信息不足时选 standard。
角色配置持有模型与思考档位，协调者在委派时标明手动或 AFK 模式。

调用 `code-review` 时提供当前工作起始基线、固定候选 SHA 和已确认的需求来源；已确认的测试 seam 直接传给实施者。
修复后针对新候选重新调用 `code-review`，直到没有未解决 findings；每轮使用新的只读评审子代理审查完整累计差异，
并带上上一轮 findings 的处置结果。评审期间保持候选不变。

## 验证节奏

- 实施中按改动运行相关测试、受影响 workspace 的 typecheck；文档变化运行 `pnpm check:docs` 和 `git diff --check`。
  显式调用 `implement` 时，其中的完整测试指当前任务的完整受影响范围。
- 格式与 lint 修复由[提交 Hook](../development/commands.md#commit-前检查)处理暂存文件；核对修复 diff，
  按实际变化重跑失效的类型或行为检查。
- 手动 tickets 不逐票要求 `verify:static`。最终集成内容交付前运行一次 `pnpm verify`，并按 Spec 和改动风险
  补齐相关 Integration、E2E、Gateway 等检查。小任务在准备本地合入时执行同样的最终验证。
- 后续修改只重跑失效的检查，未受代码、依赖、配置或环境变化影响的通过结果可以复用；无法判断时扩大验证。
  最终证据必须覆盖当前候选的全部受影响范围，记录实际命令、结果和未执行项。
- 必需检查失败或未执行时保持工作未完成。认定基线失败需在固定基线、可比环境复现并记录证据；
  维护者明确接受后才可作为例外，创建 issue 本身不构成豁免。

命令见[命令入口](../development/commands.md)，验证的证明范围见[默认验证与交付](../architecture/testing-architecture.md#默认验证与交付)，
临时 PostgreSQL/Redis 的创建与清理见[专用资源与隔离](../architecture/testing-architecture.md#专用资源与隔离)。

## 完成与本地合入

本仓库默认本地交付。父 Spec 在最终合入前保持 open；tickets 的完成按所用 skill 执行，GitHub 操作见[议题跟踪](issue-tracker.md)。

完成适用评审和最终验证后，提出一次收尾确认，列明 feature、适用 Spec、目标分支、固定候选 SHA，以及
本地 squash 合入、关闭父 Spec、删除本地功能分支的完整范围。没有 Spec 时跳过关票。
Push、远端分支删除、PR 和部署须另行授权。

取得授权后连续完成：

1. 核对候选与目标分支 tip；发生漂移时先整合、完成适用复审并重跑失效的验证。
2. 用 `git merge --squash` 和一个聚合提交本地合入目标分支。
3. 确认目标分支只新增一个 squash commit、文件树符合最终候选且工作区干净。
4. 在父 Spec 记录本地合入 SHA 并关闭，再删除本地功能分支。

失败时保留功能分支和实际进度，停止后续收尾动作并报告恢复点；恢复时先核对 Git 与 issue 状态，避免重复合入。

## 文档与历史

新建或实质修改的 Markdown 正文使用自然中文；标识符、命令、路径、API/skill 名称和引用原文保持原语言。
文档归属与维护按[文档索引](../index.md#维护方式)，历史 tracker 的只读与归档边界按[议题跟踪](issue-tracker.md#历史兼容)。
