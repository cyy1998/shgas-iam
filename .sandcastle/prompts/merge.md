{{PHASE_BOUNDARIES}}

## 集成分支按需合并与冲突解决规范

- 按 `AGENTS.md` 路由阅读命中的工程文档，并核对 `docs/agents/workflow.md`、`docs/agents/sandcastle-afk.md`、`GLOSSARY.md` 与 `.agents/skills/resolving-merge-conflicts/SKILL.md`。
- 宿主在 Spec 集成分支直接执行 `git merge --no-ff {{TICKET_BRANCH}}` 时遇到真实冲突并已干净中止合并。当前工作树正位于 Spec 集成分支（`HEAD` 为 `{{SPEC_TIP}}`），请在当前分支执行：
  `git merge --no-ff --no-commit {{TICKET_BRANCH}}`
- 结合下方宿主注入的父 Spec、当前 ticket 与 `git log --first-parent` 历史理解双方意图，完整保留双方变更语义，在完成冲突修复与受影响范围的聚焦验证后执行 `git commit` 完成合并提交，并在该合并提交正文末尾保留 `Sandcastle-Ticket: #{{TICKET_NUMBER}}` trailer（若合并提交后确需补充小修提交，确保合并提交本身已带有该 trailer）。
- 保持当前 Spec 集成分支工作树干净。

## Merge Context

- Spec Tip SHA: `{{SPEC_TIP}}`
- Ticket Branch: `{{TICKET_BRANCH}}` (`{{TICKET_TIP}}`)

## Parent Spec

{{SPEC}}

## Ticket

{{TICKET}}
