# Archive 阶段

本阶段承接 [index.md](index.md) 的 Archive 状态，用于提交、合并、OpenSpec archive 和分支清理。Archive 只在 Verify 阶段已由用户确认进入后执行；一旦进入，按本文件自动完成归档动作，不再二次确认。

## 通用规则

提交、归档或合并前重新检查当前分支、完整 diff 和 staged diff，只暂存本次任务拥有的文件；若用户有并行改动，必须明确排除，不得纳入提交。

- 使用 Conventional Commits，例如 `feat(db): ...`、`fix(auth): ...`、`refactor(api): ...`、`style(sso): ...`。
- 提交信息默认使用中文，除非用户要求其他语言。
- 进入 Archive 阶段即表示已获授权执行本文件定义的提交、合并、归档和本地分支清理；除阻塞条件外，不再要求用户确认。
- 远端 push 和远端分支删除不属于默认 Archive 动作，除非进入 Archive 前已由用户明确要求。

## Quick Change

Quick Change 进入 Archive 前必须已经完成 [verify.md](verify.md) 要求的验证或明确记录无法验证的原因。

1. Prepare：重新检查当前分支、变更文件、验证结果和简短摘要；若与 Verify 阶段确认的信息不一致，暂停并报告。
2. Commit：创建一个中文 Conventional Commit。
3. Merge：切回目标分支 fast-forward merge；如果目标分支已前进且冲突不直观，暂停并报告。
4. Cleanup：合并成功后删除本地临时分支；不要 push，除非用户明确要求。

## OpenSpec Archive

OpenSpec Archive 只在 Verify 阶段已确认进入 Archive 后执行；归档时先同步 delta specs 并移动 change 到 `openspec/changes/archive/`。若确需跳过 spec 同步但未在进入 Archive 前确认，暂停并报告。

OpenSpec 归档提交成功后，切回干净目标分支 squash merge 并创建最终提交；工作分支只在目标分支最终提交成功后删除。

## 阻塞条件

任务或 artifacts 未完成、TDD 例外未记录、验证失败、存在不可分离的无关 dirty changes、目标分支无法干净接收时，不要归档或合并，保留工作分支并报告阻塞。
