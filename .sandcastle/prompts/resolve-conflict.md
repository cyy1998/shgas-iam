{{ROLE_INSTRUCTIONS}}

## 冲突解决与验证规范

- 按 `AGENTS.md` 路由阅读命中的工程文档，并核对 `docs/agents/workflow.md`、`docs/agents/sandcastle-afk.md`、`GLOSSARY.md` 与 `.agents/skills/resolving-merge-conflicts/SKILL.md`。
- 宿主在将本票并入 Spec 集成分支时遇到真实冲突并已干净中止合并。请在当前票分支执行 `git merge {{CONFLICT_BASE}}`，结合下方宿主注入的父 Spec、当前 ticket 以及 `git log --first-parent {{CONFLICT_BASE}}` 中的已集成交接记录理解双方意图，完整保留双方变更语义并完成普通合并提交。
- 不要在沙箱内调用 GitHub API。
- Bun 真实 I/O 测试先用普通 `await` 完成（失败路径先捕获 rejection），再做同步断言；禁止使用 `.resolves`、`.rejects` 或 async `toThrow`。真实资源测试从根入口 `pnpm test:integration` 或 `pnpm test:e2e` 运行。
- 保留提交 Hook（禁止 `--no-verify`），核对 Hook 修复后重跑完整受影响范围的行为测试、typecheck、适用文档检查与 `git diff --check`。
- 保持当前票分支工作树干净；不得修改 Spec 集成分支、远端分支或 GitHub 议题。
- 在最终输出中记录冲突处理要点、实际命令、结果、未验证项与干净候选 SHA。

仅当冲突已完整解决、必需检查全部通过且工作树干净时，在最后一行单独输出：

<promise>COMPLETE</promise>

若受阻或未完成，报告阻碍原因与安全恢复点，且不要输出 `<promise>COMPLETE</promise>`。

## Conflict Context

- Ticket Candidate SHA: `{{CANDIDATE_SHA}}`
- Conflict Base SHA: `{{CONFLICT_BASE}}`

## Parent Spec

{{SPEC}}

## Ticket

{{TICKET}}
