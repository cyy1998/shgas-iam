---
name: archive-feature
description: Archive a completed repo-local feature tracker, repair tracked path references, validate the staged archive, and create a focused commit. Use only when the user explicitly invokes `$archive-feature`, directly asks to archive a feature, or clearly approves an immediately preceding closeout prompt that explicitly names the feature and its archive step. Never infer authorization from completion, resolved tickets, current feature context, or a generic merge/closeout request that omitted the archive step.
---

# Archive Feature

把已完成的 `.scratch/<slug>` tracker 安全移动到 `.scratch/archived/<slug>`，并创建一个 focused 归档提交。严格按以下
顺序执行；不要 merge、push、删除分支或使用 `--no-verify`。

唯一授权标准是用户明确同意归档一个唯一 feature。以下两种情况成立：

1. 用户直接调用 `$archive-feature`，或用自然语言明确要求归档某个 feature；
2. 用户明确同意 agent 紧邻上一条提出的本地收尾问题，且该问题已经点名 feature，并明确说明会归档其 tracker。

第二种情况的问题与答复合在一起构成明确的自然语言归档请求。`allow_implicit_invocation: true` 只允许这类明确请求触发
skill；feature 已完成、ticket 已 `resolved`、当前 feature context，或未列出归档动作的 merge/closeout 请求都不构成授权。

## 1. 解析唯一目标

1. 用 `git rev-parse --show-toplevel` 确认仓库根目录，并从根目录执行后续命令。
2. 从本次有效归档授权中读取 feature slug。若授权来自上一节第 2 种情况，从紧邻的收尾问题读取其中明确点名的 slug；
   不从更早的对话、当前分支或目录扫描中猜测目标。
3. 要求 slug 是唯一、非空的单个路径段；拒绝包含 `/`、`\` 的值以及 `.`、`..` 路径跳转值。
4. 若请求和当前上下文无法唯一确定 slug，在任何修改前停止并要求用户明确目标；不扫描多个 `.scratch/` 子目录让
   用户选择，也不猜测别名。
5. 把源固定为 `.scratch/<slug>`，目标固定为 `.scratch/archived/<slug>`。要求源是现有目录且目标完全不存在；否则
   在任何修改前停止。
6. 要求 `.scratch/archived` 不存在或是现有目录；若该路径被文件占用，停止并报告冲突。

## 2. 建立安全前置条件

1. 分别用 `git diff --quiet --` 与 `git diff --cached --quiet --` 检查 unstaged 和 staged tracked changes。任一检查
   发现改动时停止；归档开始前不接受已有 tracked 改动。
2. 列出 untracked 文件，并额外检查 ignored 文件。允许与本次归档无关的文件继续留在工作区，但不要 stage 它们。
3. 若任何不受版本控制的文件位于源目录或目标目录内、占用源/目标的祖先路径，或会被目录移动或待修复引用覆盖，
   立即停止并报告冲突路径。不要移动、删除或覆盖这些文件。
4. 枚举源目录 `issues/` 下的 ticket Markdown 文件。若存在 ticket，逐个要求包含独立一行
   `**Status:** resolved`；列出所有未 resolved ticket 后停止。若没有 ticket 文件，把用户本次显式归档请求视为足够
   的完成确认，不额外制造 gate。

## 3. 审核旧路径引用

1. 在移动前运行 `git grep -n -F -- ".scratch/<slug>"`，收集所有受版本控制的旧路径引用。把 `<slug>` 替换为已确认
   的真实值；把退出码 `1` 且无输出视为“没有匹配”，其他错误则停止。
2. 打开每个匹配的上下文，逐项判断它是否指向本次 tracker。计划仅把这类引用改为
   `.scratch/archived/<slug>`；不要执行仓库级盲目替换。
3. 若匹配是 binary、含义不明确，或无法确认修改后仍保持原意，在移动前停止并报告文件、行号与疑点。
4. 记录允许修改的受版本控制文件。对于源目录内的匹配，同时记录它在目标目录中的新路径。

## 4. 移动并修复

1. 若 `.scratch/archived` 不存在，只创建这个固定父目录；不要创建或移动其他候选目录。
2. 只用 `git mv -- ".scratch/<slug>" ".scratch/archived/<slug>"` 移动 tracker。
3. 用 `apply_patch` 对已审核的引用做最小修改；只把确认指向本次 tracker 的旧路径改为归档路径。
4. 再运行同一条 `git grep`。若仍有旧路径匹配，停止并逐项报告；不要武断消除含义不明确的匹配。
5. 检查 `git status --short` 和工作区 diff，确认移动完整、引用内容正确且无无关文件被修改。

## 5. 精确 stage 与验证

1. 保留 `git mv` 已产生的 staged move，并仅用显式路径 `git add -- <path...>` stage 经审核的引用修复。不要使用会
   吸收无关改动的全局 `git add -A`、`git add .` 或通配 stage。
2. 用 `git diff --cached --name-status` 和 `git diff --cached` 检查 staged 内容。只允许源/目标目录的归档移动与
   第 3 节已批准的引用文件；发现额外路径时停止。
3. 运行 `git diff --cached --check`。若 staged 路径包含正式文档索引范围内的 `docs/**/*.md`，再运行
   `pnpm check:docs`。任一检查失败时停止。

## 6. 创建 focused commit

1. 确认 staged diff 非空后，运行 `git commit -m "chore(tracker): 归档 <slug>"`，把 `<slug>` 替换为真实值。
   让仓库 hook 正常执行，不要使用 `--no-verify`。
2. 用 `git show --stat --oneline HEAD` 和 `git status --short` 核验提交只包含归档移动与对应引用修复。
3. 报告 commit、移动路径、修复的引用、验证结果及仍存在的无关 untracked 文件。到此停止；不要 merge、push 或删除
   本地/远端分支。

## 失败处理

任一步失败后立即停止后续动作。保留当前 staged/unstaged 状态作为可恢复现场，不要用 `reset`、`checkout`、`clean`
或反向移动自动清理。报告已经完成的步骤、尚未执行的步骤、`git status --short` 摘要、失败原因，以及需要维护者确认的
下一安全动作。
