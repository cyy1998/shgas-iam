# 仓库指引入口

本文件是 Codex 和其他 agent 的仓库级入口。详细规则放在 `docs/`；`AGENTS.md` 保持为短索引。

## 必读入口

- 当前文档索引：[docs/index.md](docs/index.md)
- 仓库结构与生成目录边界：[docs/architecture/repository-map.md](docs/architecture/repository-map.md)
- 后端架构与 composition 规则：[docs/architecture/backend-architecture.md](docs/architecture/backend-architecture.md)
- 前端架构与 composition 规则：[docs/architecture/frontend-architecture.md](docs/architecture/frontend-architecture.md)
- 共享契约与数据库规则：[docs/architecture/contracts-and-database.md](docs/architecture/contracts-and-database.md)
- 构建、测试与开发命令：[docs/development/commands.md](docs/development/commands.md)
- 编码风格与命名约定：[docs/development/coding-style.md](docs/development/coding-style.md)
- 后端实现约定：[docs/development/backend-implementation.md](docs/development/backend-implementation.md)

## Agent 交互与 Shell 约定

- 在聊天 UI 中，面向用户的回复默认使用自然、地道的中文。代码标识符、命令、文件路径、API 名称和引用的源文本保持原语言。
- 本仓库明确授权 Codex 使用子代理功能并行调查或拆分边界清晰的任务；主代理仍负责整合结论、执行改动和最终验证。
- 在 PowerShell 中读取文本文件时显式指定 UTF-8 编码，例如 `Get-Content -Path "AGENTS.md" -Encoding utf8`，避免中文乱码。

## Agent skills

### Engineering workflow

通用开发方法以 `mattpocock/skills` 为准；小型明确改动可以直接进入 `/implement`，跨会话 feature 使用 spec、tickets
和双轴评审。仓库只在 [docs/agents/workflow.md](docs/agents/workflow.md) 补充分支、验证、授权、归档和本地合入约束。

`openspec/` 已冻结为只读历史参考。除非维护者明确要求修正历史记录，否则不得在其中新增、修改、同步或归档产物，也不得把其中的规格视为当前事实来源。

### Issue tracker

跨会话 feature 的 spec、tickets 与 journal 使用 `.scratch/` 下的本地 Markdown；单会话直接实现无需创建 tracker。
See `docs/agents/issue-tracker.md`.

### Triage labels

The default canonical triage labels are used unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context layout with `CONTEXT.md` at the root and ADRs under `docs/adr/`. See `docs/agents/domain.md`.
