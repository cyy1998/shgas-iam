{{PHASE_BOUNDARIES}}

## 任务与仓库规范

- 按 `AGENTS.md` 路由阅读命中的工程文档，并核对 `docs/agents/workflow.md`、`docs/agents/sandcastle-afk.md` 与 `GLOSSARY.md`。
- 父 Spec、当前 ticket、阻塞关系与人工评论已由宿主注入下方上下文。
- 开始修改前核对当前分支、工作树与已有恢复提交，保留有效的既有进度，只修改本票授权范围。
- 按 `.agents/skills/tdd/SKILL.md` 实施：先在公开 seam 写失败行为测试，最小实现转绿后再扩展覆盖。
- 遵循 `docs/agents/workflow.md#验证节奏`：并行票阶段只运行受影响范围的**聚焦测试**（相关 workspace 的 Unit、typecheck、适用文档检查、受影响包的定向 Integration `pnpm test:integration -- --workspace <pkg>` / `--file <path>` 与 `git diff --check`）；**禁止**在本阶段运行全仓 `pnpm verify` 或全量 Integration。
- 仅在本票分支创建聚焦提交并引用本票编号，保持工作树干净；不得修改 Spec 集成分支。
- 在最终输出中给出交接摘要（实际命令、结果、未验证项与干净候选 SHA）。

## Dispatch Baseline

- Baseline SHA: `{{BASE_SHA}}`

## Parent Spec

{{SPEC}}

## Ticket

{{TICKET}}
