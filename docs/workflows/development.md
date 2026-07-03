# 开发流程

本流程承接 [AGENTS.md](../../AGENTS.md) 中的短规则，记录日常开发、分支、OpenSpec、提交和合并方式。设计取舍和方案写法见
[design.md](design.md)，测试与验证方式见 [testing.md](testing.md)。

## 任务分流

- 纯说明、索引或低风险文档微调：可以留在当前分支，但仍要运行相关检查。
- 小型非 OpenSpec 改动：使用 `$quick-change`，默认以用户提出需求时所在分支作为目标分支，创建 `work/quick-<slug>`，实现并验证后等待用户确认再提交、合并和删除临时分支。
- 非平凡 feature、fix、refactor 或行为变化：创建短生命周期 `feat/<topic>`、`fix/<topic>` 或 `work/<topic>` 分支。
- 涉及能力规格、跨模块契约、迁移、发布流程或架构约束：使用 OpenSpec change。
- 大型功能拆分：先建 `feature/<feature-name>`，再从 feature 分支派生每个 child `work/<change-name>`。

开始前先运行：

```bash
git status --short --branch
```

如果存在无关 dirty changes，不要 stash、revert 或带入新分支；先确认它们是否属于当前任务。

## OpenSpec 流程

OpenSpec change 和 Git 分支视为同一个生命周期，用于能力规格、跨模块契约、迁移、发布流程或架构约束等非平凡改动。

1. Propose：检查当前分支和 worktree，从目标分支创建 `work/<change-name>`。独立 change 目标为 `main`；大型 feature 的 child change 目标为 `feature/<feature-name>`。change 名称和工作分支后缀保持一致。
2. Plan：读取附近代码、`openspec/specs/`、`docs/index.md` 指向的当前文档和相关 runbook；完成 proposal、design、spec、tasks 中当前阶段需要的 artifacts。
3. Apply：在 `work/<change-name>` 上更新 artifacts、实现、测试和验证。保持改动小而聚焦，优先沿用现有包边界、命名、工厂、DI、测试和日志模式。
4. Investigate：bug 报告先复现或检查失败信号，再改根因；使用 Serena MCP 做代码结构分析、符号查找和引用检查，用 `rg`、`find`、`sed` 处理清单、非代码文件和命令输出。
5. Delegate：需要并行调查时可以使用子代理。每个子代理只回答一个边界清晰的问题，给出文件、行号、风险和建议；主代理负责最终集成和验证。
6. Verify：归档前完成 OpenSpec verification，并按 [testing.md](testing.md) 运行最窄有意义的仓库检查。新发现推翻假设时，先更新计划或 artifacts，再继续实现。
7. Archive and merge：用户明确要求 archive 时，先同步 delta specs 并移动 change 到 `openspec/changes/archive/`；检查完整 diff；只暂存 change 相关文件；创建一个聚焦提交；切回干净目标分支后 squash merge 并创建最终提交。
8. Blockers：任务或 artifacts 未完成、验证失败、存在不可分离的无关 dirty changes、目标分支无法干净接收时，不要归档或合并，保留工作分支并报告阻塞。

大型 feature 使用两级分支：

- `feature/<feature-name>` 从 `main` 创建。
- 每个 child `work/<change-name>` 从 feature 分支创建，并独立归档回 feature 分支。
- 只有所有 child 完成、umbrella 验收通过、集成验证完成后，才把 feature 分支合入 `main`。

## Quick Change 流程

Quick Change 用于小型、低风险、非 OpenSpec 改动，例如文档微调、配置小改、索引维护或局部修正。它仍然需要临时分支和验证，但提交、合并、删分支必须等用户确认。

1. Triage：确认改动足够小、diff 可快速审阅，并识别目标分支。默认目标为用户提出该 Quick Change 需求时所在分支，除非用户指定其他目标。
2. Inspect：运行 `git status --short --branch`。如果存在无关 dirty changes，不要 stash、revert 或带入临时分支；先确认它们是否属于当前任务。
3. Branch：从干净目标分支创建 `work/quick-<slug>`。如果分支已存在，追加短时间戳。
4. Implement：读取附近文件，按现有文档和代码约定做最小改动；实现过程中不创建提交。
5. Validate：按 [testing.md](testing.md) 运行触及范围内最窄有意义的检查，例如文档改动运行 `pnpm check:docs`。如果没有可用检查，至少检查 diff 并说明原因。
6. Confirm：向用户说明当前临时分支、变更文件、验证结果和简短摘要，明确询问是否提交、合入目标分支并删除临时分支。
7. Finalize：用户确认后重新检查 status/diff，只暂存本次任务拥有的文件；创建一个中文 Conventional Commit；切回目标分支 fast-forward merge；合并成功后删除本地临时分支。不要 push，除非用户明确要求。

## 提交和合并

- 使用 Conventional Commits，例如 `feat(db): ...`、`fix(auth): ...`、`refactor(api): ...`、`style(sso): ...`。
- 提交信息默认使用中文，除非用户要求其他语言。
- 除 OpenSpec archive 流程或用户明确确认外，不自动提交。
- 提交前检查当前分支、`git diff` 和 staged diff，只暂存任务拥有的文件。
- 不要把无关用户改动纳入提交。
- 不要 push 目标分支或删除远端分支，除非用户明确要求。
- quick-change 合并后删除本地临时分支；OpenSpec archive 的工作分支只在目标分支最终提交成功后删除。

## 验证入口

具体测试策略、验证矩阵、Smoke 入口、证据留存和失败处理见 [testing.md](testing.md)。开发流程只决定何时验证；具体验证范围以改动风险和受影响模块为准。
