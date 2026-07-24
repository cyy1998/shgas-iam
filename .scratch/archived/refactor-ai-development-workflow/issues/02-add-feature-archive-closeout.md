# 02 — 提供显式 feature 归档与收尾

**What to build:** 维护者可以在实现完成后显式调用仓库级归档 skill，安全地整理 feature tracker；agent 随后用一个
明确问题请求最终验证、指定 merge 策略和本地分支清理授权。

**Blocked by:** 01

**Status:** resolved

- [x] 用户可以通过当前功能分支或显式 feature slug 唯一确定待归档目录；目标不明确或不一致时安全停止。
- [x] 归档只在 tracked 工作区可安全提交且现有 tickets 全部为 `resolved` 时进行；无关 untracked 文件不阻断。
- [x] feature tracker 被移动到归档目录，仍需工作的受版本控制路径引用同步更新，并进入一个 focused 归档提交。
- [x] 归档 skill 不 merge、push、删除分支或使用 `--no-verify`，失败时保留可恢复状态并报告。
- [x] 实现完成提示明确列出 feature、目标分支、建议的 squash 策略以及归档、最终验证、merge 和本地分支删除范围；
  push 与远端删除不在授权内。
- [x] 获批的本地收尾按照目标漂移处理、一次完整验证、归档、目标 tip 复核、merge、可达性确认和本地分支删除的顺序
  执行，任一步失败都停止后续动作。
- [x] skill 结构校验通过，并在一次性临时 Git fixture 中验证成功路径和关键安全停止路径。
