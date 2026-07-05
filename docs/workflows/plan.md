# Plan 阶段

本阶段承接 [index.md](index.md) 的 Plan 状态，用于选择本次改动唯一的计划产物：Quick Change、OpenSpec change 或大型 OpenSpec umbrella change。不要为同一改动同时维护多套计划。

## 产物选择

- Quick Change：只用于未命中 OpenSpec 且低风险的小改，通常留在对话中，说明目标、触及文件、验证方式和是否需要相邻文档更新；具体分支、提交和合并步骤按 [implement.md](implement.md) 与 [archive.md](archive.md) 执行。
- OpenSpec change：目标行为、范围和非目标、受影响契约/数据/权限/安全/审计/队列/session/OIDC/SSO 或发布边界、至少一条可验证正确性标准都清楚后，使用 `$openspec-propose` 产出 `proposal.md`、`design.md`、`spec.md` 和 `tasks.md`；未解决问题记录为开放问题或任务。
- 大型 OpenSpec umbrella change：用于拆分大型功能或跨阶段能力，记录 child change 列表、依赖顺序和集成验收标准；每个 child change 仍独立产出 OpenSpec artifacts。

## Skill 前置门禁

选择计划产物后、任何分支状态变更或写入动作前，必须先完成 [index.md](index.md) 的 skill preflight：

- Quick Change：必须读取并使用 `$quick-change`，再创建 quick change 分支、编辑文件或提交验证结果。
- OpenSpec change：必须读取并使用 `$openspec-propose`，再创建 change 分支、执行 `openspec new change` 或写入 artifacts。
- 大型 OpenSpec umbrella change：必须读取并使用 `$openspec-propose`，再创建 feature 分支、执行 `openspec new change` 或写入 umbrella artifacts。
- 用户明确点名其他 `$openspec-*` 计划 skill 时，按被点名 skill 执行，并记录它替代 `$openspec-propose` 的原因。

## 分支前置门禁

进入 Quick Change、OpenSpec change 或大型 OpenSpec umbrella change 的写入动作前，必须先完成分支前置检查；未完成前不得创建
OpenSpec artifacts、编辑代码或编辑文档：

1. 运行 `git status --short --branch`，确认当前分支、dirty 文件和目标分支。
2. 若存在与本次无关的 dirty 文件，不得 stash、revert 或带入新分支；必须先请用户确认处理方式。
3. Quick Change 必须先从干净目标分支创建 `work/quick-<slug>`；当用户指定从 `main` 开始时，必须先切到干净
   `main`，再创建 quick change 分支。
4. OpenSpec change 必须先创建或切换到对应 `work/<change-name>` 分支，再执行 `openspec new change` 或写入 artifacts。
5. 大型 OpenSpec umbrella change 必须先从干净 `main` 创建或切换到 `feature/<feature-name>`，再执行
   `openspec new change` 或写入 umbrella artifacts。

## Quick Change 短计划

Quick Change 适用于未触发 OpenSpec、低风险、小范围、diff 可快速审阅的改动。短计划通常留在对话中，至少说明：

- 目标：这次要改变或修正什么。
- 范围：预计触及的文件、模块或文档区域，以及明确不做的内容。
- 验证：准备运行的最窄有意义检查；如果没有可用检查，说明将人工检查 diff。
- 文档：是否需要更新相邻 README、`docs/` 或索引。

### Quick Change 分支流程

1. 识别目标分支。默认目标为用户提出 Quick Change 需求时所在分支；若用户指定目标分支，以用户指定为准。
2. 若用户明确要求当前分支直改或不要创建临时分支，可以跳过临时分支，但仍不得自动提交。
3. 运行 `git status --short --branch`，确认 worktree 干净或仅包含本次相关改动。
4. 默认从干净目标分支创建 `work/quick-<slug>`；如果分支名已存在，追加短时间戳。
5. 临时分支只承载本次小改；提交、合并回目标分支和删除临时分支必须等用户确认，具体执行见 [implement.md](implement.md) 和 [archive.md](archive.md)。

如果计划或实现过程中发现契约、schema、安全、session/OIDC/SSO、审计、队列、发布、回滚或跨模块生命周期影响，必须停止 Quick Change，重新分流为 OpenSpec change。若范围变大、风险升高或 diff 不再适合快速审阅，也应停止 Quick Change 并重新分流。

## OpenSpec Change

OpenSpec change 和 Git 分支视为同一个生命周期，用于能力规格、跨模块契约、迁移、发布流程或架构约束等非平凡改动。

1. 检查当前分支和 worktree。
2. 从目标分支创建 `work/<change-name>`；独立 change 目标为 `main`，大型 feature 的 child change 目标为 `feature/<feature-name>`。
3. 保持 change 名称和工作分支后缀一致。
4. 分支创建或切换完成后，才能执行 `openspec new change` 或写入 OpenSpec artifacts。
5. 读取附近代码、`openspec/specs/`、`docs/index.md` 指向的当前文档和相关 runbook。
6. 遵循 `$openspec-propose` 完成 proposal、design、spec、tasks 中当前阶段需要的 artifacts。

## OpenSpec Umbrella Change

大型 OpenSpec umbrella change 用于拆分大型功能、跨阶段能力或多个相互依赖的 OpenSpec change。它不替代 child change 的 proposal/design/spec/tasks；它只负责记录拆分边界、依赖顺序和集成验收。

1. 从 `main` 创建 `feature/<feature-name>`，作为 umbrella 集成分支。
2. 分支创建或切换完成后，才能执行 `openspec new change` 或写入 umbrella artifacts。
3. 在 umbrella change 中记录 child change 列表、每个 child 的目标、依赖关系、共享风险、集成验收标准和最终合入条件。
4. 每个 child change 从 `feature/<feature-name>` 派生 `work/<change-name>`，并独立产出 OpenSpec proposal/design/spec/tasks。
5. child change 完成后归档回 `feature/<feature-name>`；只有所有 child 完成、umbrella 验收通过、集成验证完成后，才进入最终归档和合入 `main`。
6. 如果 child 之间发现新的共享契约、迁移顺序、发布或回滚约束，先更新 umbrella change，再继续推进 child 实现。

## 退出条件

- Quick Change 已经足够指导实现。
- OpenSpec change 或 umbrella change 中当前阶段需要的 artifacts 已完成。
- 用户已确认所选计划产物和下一步实施方向。
- 下一步在用户确认后进入 [implement.md](implement.md)。
