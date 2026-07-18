# Engineering workflow

本文件定义 Matt skills 在本仓库中的落地规则。skills 负责通用方法，本文件负责本仓库特有的 tracker、分支、提交、验证和授权边界；不要把这些规则复制进各个 skill。

## 选择入口

| 工作状态 | 使用入口 |
|---|---|
| 想法、边界或术语尚未稳定 | `grill-with-docs` |
| 共识已经形成，需要持久规格 | `to-spec` |
| 规格已获确认，且用户已手动确认进入拆票 | `to-tickets` |
| 已有无阻塞、可认领的票据，且用户已手动确认开始实施 | `implement`，能在约定测试接缝上测试先行时使用 TDD |
| 需要判断实现是否同时符合仓库规范与原始规格 | `code-review` |
| 目标明确、低风险且能在一个上下文内完成的小改动 | 用户手动确认后，直接使用 `implement` 快速路径 |

OpenSpec 不再是新工作的可选入口。

## 阶段切换的人工确认

`to-tickets` 和 `implement` 是必须由用户手动开启的阶段。调用任一 skill 前，agent 必须停止自动推进，说明即将进入的阶段及范围，并等待用户在当前会话中明确确认；用户直接请求拆票或实现，可以视为对应阶段的确认。上一阶段产物完成、spec 或拆票方案获批、ticket 变为 `ready-for-agent`，都不构成进入下一阶段的授权，两项确认也不得相互继承。`implement` 的人工确认只发生在该阶段开始前；进入已经确认的实施范围后，agent 按依赖顺序自动推进其中的 tickets，不再逐票等待手动确认。

- 进入 `to-tickets` 前，说明拆票所依据的 spec、计划或对话共识；获得确认后才开始拟定拆票方案。该入口确认不能替代 `to-tickets` 内部发布 tickets 前对拆票方案的确认。
- 进入 `implement` 前，说明本次要实施的 ticket 集合或具体范围；快速路径则说明本次改动范围。获得确认后才能认领第一张 ticket 或修改文件。确认对本次已声明的实施范围整体有效，范围内切换、认领和实施后续 ticket 无需再次确认。

未获得对应确认时，不得调用该 skill，也不得以阶段已就绪为由自动继续。

## 标准功能流程

标准功能按以下顺序推进：

1. 用 `grill-with-docs` 澄清问题、边界、术语和长期决策；稳定领域语言写入 `CONTEXT.md`，长期架构决策写成 ADR。
2. 用 `to-spec` 把共识写入 `.scratch/<feature-slug>/spec.md`。
3. Spec 完成后停止自动推进；说明拆票依据并等待用户手动确认进入 `to-tickets`。
4. 用 `to-tickets` 拟定拆票方案；维护者确认方案后，发布一个文件一张票的 tracer-bullet tickets。
5. tickets 发布后，spec 成为已批准基线。小型澄清以带日期的 amendment 追加；改变范围、行为或架构时，重新进入设计确认，并同步更新受影响 tickets。
6. 进入 `implement` 前说明本次实施的 ticket 集合并等待用户手动确认。确认后在依赖前沿逐票自动推进：依次认领 ticket，完成针对性验证和双轴评审，并生成该票的受评审实现提交；ticket 之间的推进不再要求手动确认。
7. 所有 tickets 完成后执行全仓验证，并相对目标分支再做一次 Standards 与 Spec 双轴评审。

规格、tickets、amendments、解决记录和验证证据全部纳入版本控制，完成后仍保留在原路径，不归档、不搬迁、不删除。

## 小改动快速路径

同时满足以下条件时，可以不创建 spec 和 tickets，直接在 `codex/quick-<slug>` 分支使用 `implement`：

- 目标和验收方式已经明确；
- 风险与影响范围都很小；
- 能在一个上下文内实现、验证和评审；
- 不需要新的架构决策或跨团队协调。

一旦发现范围扩大、风险升高或需求仍有歧义，立即停止快速路径，回到标准功能流程。仓库不再维护单独的 `quick-change` 工作流。

快速路径只省略 spec 和 tickets，不省略 `implement` 前的人工确认。Agent 必须先说明改动范围并等待用户明确要求实施，再开始修改文件。

## Ticket 生命周期

本地 tracker 的 ticket 状态依次为 `ready-for-agent` → `claimed` → `resolved`：

用户确认进入 `implement` 后，agent 可以在已确认范围内按以下生命周期连续推进所有无阻塞 tickets，无需在 ticket 状态转换或切换到下一张 ticket 时再次请求确认：

1. 只有全部 blockers 已 `resolved` 的 ticket 才能认领。
2. 在修改实现前把 ticket 标为 `claimed`。
3. 先运行该 ticket 的聚焦测试，以及受影响 package 的 lint/typecheck；适用时运行文档检查。
4. 使用 `code-review` 同时检查仓库 Standards 和 ticket/spec 要求。
5. 评审问题清零后创建一个受评审的实现提交。
6. 把 ticket 标为 `resolved`，勾选验收标准，并在 `Resolution` 中记录 `Final squash commit: pending`、验证命令和评审结果。

解决记录使用紧随实现提交之后的 tracker-only 元数据提交。该提交只记录状态和证据，不承载实现改动，也不计作第二个实现提交。功能分支上的逐票实现提交用于增量验证和评审，不作为合并后的永久交付标识。

## 分支、提交与并行

- 功能分支使用 `codex/<feature-slug>`；默认目标分支是本地 `main`，除非维护者另有指定。
- 一个功能默认使用一个分支，并在功能分支上为每张 ticket 创建一个受评审的实现提交；目标分支以最终 squash commit 作为永久交付标识。
- 只有明确选择并行实施时，才为彼此独立的 tickets 创建额外分支或 worktree；否则即使多个 tickets 同时位于依赖前沿，也按顺序实施。
- 实现提交、最终 squash commit 和 tracker-only 元数据提交使用 focused Conventional Commit；description 默认使用中文，除非维护者要求其他语言。
- ticket 验证与评审通过后可以自动创建提交。
- merge、push 和删除远端分支始终需要维护者明确批准。
- 普通功能获批后使用 `git merge --squash`，并在目标分支创建一个 focused Conventional Commit。有 tickets 时，获取该 commit 的 SHA，将每张 ticket 的 `Resolution` 中 `Final squash commit: pending` 回填为该 SHA，再创建一个 tracker-only 元数据提交。该元数据提交成功后自动删除本地功能分支；远端分支仍需单独授权后清理。

## 验证与结束条件

Ticket 级验证以快速、聚焦为原则：运行受影响测试、受影响 package 的 lint/typecheck，以及与改动有关的专用检查。

功能级验证至少包括：

```bash
pnpm lint
pnpm typecheck
pnpm test
git diff --check
```

修改文档时增加 `pnpm check:docs`；修改依赖或安装流程时增加冻结锁文件安装验证。最终双轴评审以目标分支为固定比较点。只有验证和评审全部通过、所有 tickets 均记录证据后，功能才可以请求 merge 批准。

## 当前事实与历史材料

当前行为由代码、可执行测试和文档索引中标记为 `Current` 的文档共同定义。`CONTEXT.md` 维护稳定领域语言，ADR 维护长期决策。

`openspec/` 保留原路径，仅用于追溯历史需求和设计线索。使用其中的信息前必须对照当前代码、测试和 Current 文档验证；除维护者明确要求历史修正外，不得新增、修改、同步或归档其中的产物。
