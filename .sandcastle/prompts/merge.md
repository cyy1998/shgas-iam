{{ROLE_INSTRUCTIONS}}

## 集成分支按需合并与冲突解决规范

- 按 `AGENTS.md` 路由阅读命中的工程文档，并核对 `docs/agents/workflow.md`、`docs/agents/sandcastle-afk.md`、`GLOSSARY.md` 与 `.agents/skills/resolving-merge-conflicts/SKILL.md`。
- 宿主在 Spec 集成分支直接执行 `git merge --no-ff {{TICKET_BRANCH}}` 时遇到真实冲突并已干净中止合并。当前工作树正位于 Spec 集成分支（`HEAD` 为 `{{SPEC_TIP}}`），请在当前分支执行：
  `git merge --no-ff --no-commit {{TICKET_BRANCH}}`
- 结合下方宿主注入的父 Spec、当前 ticket 与 `git log --first-parent` 历史理解双方意图，完整保留双方变更语义，在完成冲突修复与受影响范围的聚焦验证后执行 `git commit` 完成合并提交，并在该合并提交正文末尾保留 `Sandcastle-Ticket: #{{TICKET_NUMBER}}` trailer（若合并提交后确需补充小修提交，确保合并提交本身已带有该 trailer）。
- 不要在沙箱内调用 GitHub API。
- Bun 真实 I/O 测试先用普通 `await` 完成（失败路径先捕获 rejection），再做同步断言；禁止使用 `.resolves`、`.rejects` 或 async `toThrow`。真实资源测试从根入口 `pnpm test:integration` 或 `pnpm test:e2e` 运行。
- 保留提交 Hook（禁止 `--no-verify`），核对 Hook 修复后重跑完整受影响范围的行为测试、typecheck、适用文档检查与 `git diff --check`。
- 保持当前 Spec 集成分支工作树干净；不得推送远端分支或修改 GitHub 议题。

仅当冲突已完整解决、合并提交完成、必需检查全部通过且工作树干净时，在最后一行单独输出：

<promise>COMPLETE</promise>

若受阻或未完成，报告阻碍原因与安全恢复点，且不要输出 `<promise>COMPLETE</promise>`。

## Merge Context

- Spec Tip SHA: `{{SPEC_TIP}}`
- Ticket Branch: `{{TICKET_BRANCH}}` (`{{TICKET_TIP}}`)

## Parent Spec

{{SPEC}}

## Ticket

{{TICKET}}
