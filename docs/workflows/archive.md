# Archive 阶段

本阶段承接 [index.md](index.md) 的 Archive 状态，用于提交、合并、OpenSpec archive 和分支清理。

## 通用规则

提交、归档或合并前重新检查当前分支、完整 diff 和 staged diff，只暂存本次任务拥有的文件；若用户有并行改动，必须明确排除，不得纳入提交。

- 使用 Conventional Commits，例如 `feat(db): ...`、`fix(auth): ...`、`refactor(api): ...`、`style(sso): ...`。
- 提交信息默认使用中文，除非用户要求其他语言。
- 除 OpenSpec archive 流程或用户明确确认外，不自动提交。
- 不要 push 目标分支或删除远端分支，除非用户明确要求。

## Quick Change

Quick Change 进入 Archive 前必须已经完成 [verify.md](verify.md) 要求的验证或明确记录无法验证的原因。

1. Confirm：向用户说明当前分支、变更文件、验证结果和简短摘要，明确询问是否提交、合入目标分支并删除临时分支；当前分支直改时，只询问是否提交。
2. Commit：用户确认后创建一个中文 Conventional Commit。
3. Merge：切回目标分支 fast-forward merge；如果目标分支已前进且冲突不直观，暂停并报告。
4. Cleanup：合并成功后删除本地临时分支；不要 push，除非用户明确要求。

## OpenSpec Archive

OpenSpec archive 必须由用户明确要求；归档时先同步 delta specs 并移动 change 到 `openspec/changes/archive/`，若确需跳过 spec 同步，必须得到用户明确确认。

OpenSpec 归档提交成功后，切回干净目标分支 squash merge 并创建最终提交；工作分支只在目标分支最终提交成功后删除。

## 阻塞条件

任务或 artifacts 未完成、TDD 例外未记录、验证失败、存在不可分离的无关 dirty changes、目标分支无法干净接收时，不要归档或合并，保留工作分支并报告阻塞。
