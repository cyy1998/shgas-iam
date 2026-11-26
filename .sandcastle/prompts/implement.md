{{ROLE_INSTRUCTIONS}}

## 任务与仓库规范

- 按 `AGENTS.md` 路由阅读命中的工程文档，并核对 `docs/agents/workflow.md`、`docs/agents/sandcastle-afk.md` 与 `GLOSSARY.md`。
- 父 Spec、当前 ticket、阻塞关系与人工评论已由宿主注入下方上下文；不要在沙箱内调用 GitHub API。
- 开始修改前核对当前分支、工作树与已有恢复提交，保留有效的既有进度，只修改本票授权范围。
- 按 `.agents/skills/tdd/SKILL.md` 实施：先在公开 seam 写失败行为测试，最小实现转绿后再扩展覆盖。
- Bun 真实 I/O 测试（数据库、Redis、HTTP、子进程、readiness、文件系统）必须先用普通 `await` 完成（失败路径先 `try/catch` 捕获 rejection），再做同步断言；禁止使用 `.resolves`、`.rejects` 或 async `toThrow`。
- 真实资源测试从根入口 `pnpm test:integration` 或 `pnpm test:e2e` 运行，每条命令独立管理并回收测试资源。
- 保留提交 Hook（禁止 `--no-verify`），核对 Hook 修复并重跑失效检查；运行完整受影响范围的行为测试、typecheck、适用文档检查与 `git diff --check`。
- 仅在本票分支创建聚焦提交并引用本票编号，保持工作树干净；不得修改 Spec 集成分支、远端分支或 GitHub 议题。
- 在最终输出中给出交接摘要（实际命令、结果、未验证项与干净候选 SHA）。

仅当本票全部必需检查通过且工作树干净时，在最后一行单独输出：

<promise>COMPLETE</promise>

若受阻或未完成，报告阻碍原因与安全恢复点，且不要输出 `<promise>COMPLETE</promise>`。

## Dispatch Baseline

- Baseline SHA: `{{BASE_SHA}}`

## Parent Spec

{{SPEC}}

## Ticket

{{TICKET}}
