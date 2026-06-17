---
name: quick-change
description: Handle small, low-risk repository changes with a temporary branch workflow. Use when the user asks for a quick minor change, small fix, copy/config tweak, or explicitly invokes $quick-change, and the expected work can be implemented and reviewed in one short pass before the user confirms commit and merge.
---

# Quick Change

## Overview

Use this workflow for small non-OpenSpec changes that should still be isolated from `main`: create a temporary branch, implement and validate the change, pause for user confirmation, then commit, merge into the target branch, and delete the temporary branch.

If the request grows into a feature, schema change, API contract change, risky refactor, or multi-step design discussion, stop using this skill and move to the repository's normal branch/OpenSpec workflow.

## Workflow

1. **Triage the request**
   - Confirm the change is small, focused, and likely reviewable from a compact diff.
   - Identify the target branch. Default to `main` unless the user specifies another target.
   - Run `git status --short --branch` before changing branches.
   - If unrelated dirty changes exist, do not stash, revert, or carry them onto the temporary branch. Pause and ask the user how to proceed unless the dirty files are clearly part of the requested change.

2. **Create the temporary branch**
   - Start from the clean target branch.
   - Use a short-lived branch named `work/quick-<slug>`, where `<slug>` is a lowercase hyphenated summary of the request.
   - If the branch name already exists, append a short timestamp such as `work/quick-fix-title-0617-1430`.

3. **Implement narrowly**
   - Read nearby files first and follow existing repository conventions.
   - Keep edits limited to the requested behavior.
   - Do not create commits while implementing.
   - Preserve any unrelated user changes in the worktree.

4. **Validate the change**
   - Run the narrowest meaningful check for the touched area: focused test, typecheck, lint, build, schema check, or smoke check.
   - If no useful check is practical, inspect the diff carefully and state that validation was not run.

5. **Ask for confirmation before committing**
   - Show the current temporary branch, changed files, validation result, and a concise change summary.
   - Ask explicitly whether to commit, merge into the target branch, and delete the temporary branch.
   - Do not commit, merge, or delete the branch until the user confirms.

6. **Finalize after confirmation**
   - Re-run `git status --short --branch` and inspect `git diff`/`git diff --staged`.
   - Stage only files owned by this quick change.
   - Create one focused Conventional Commit with a Chinese message unless the user requested another language.
   - Switch to the target branch and fast-forward merge the temporary branch when possible.
   - If the target branch advanced, rebase the temporary branch onto the target branch only when conflicts are straightforward; otherwise pause and report the conflict.
   - Delete the local temporary branch only after the merge succeeds.
   - Do not push unless the user explicitly asks.

## Confirmation Text

Use a confirmation prompt like:

```text
已在 <branch> 完成快速改动。

变更文件：
- <file>

验证：
- <command>: <result>

请确认是否提交、合入 <target>，并删除临时分支 <branch>。
```

If the user asks for revisions, keep working on the same temporary branch and repeat validation before asking again.

## Guardrails

- Never use destructive Git commands such as `git reset --hard` or `git checkout -- <file>` unless the user explicitly requests them.
- Never include unrelated dirty files in the quick-change commit.
- Never commit directly on `main`.
- Never skip the confirmation gate, even when the original request sounds routine.
- Prefer a normal implementation branch or OpenSpec change when the change is no longer obviously small.
