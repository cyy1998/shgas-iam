# 仓库指引入口

本文件是 Codex 和其他 agent 的仓库级入口。详细规则放在 `docs/`；`AGENTS.md` 保持为短索引。

## 必读入口

- 当前文档索引：[docs/index.md](docs/index.md)
- 仓库结构与生成目录边界：[docs/architecture/repository-map.md](docs/architecture/repository-map.md)
- 后端架构与 composition 规则：[docs/architecture/backend-architecture.md](docs/architecture/backend-architecture.md)
- 前端架构与 composition 规则：[docs/architecture/frontend-architecture.md](docs/architecture/frontend-architecture.md)
- 共享契约与数据库规则：[docs/architecture/contracts-and-database.md](docs/architecture/contracts-and-database.md)
- 测试编排、通道与资源预算：[docs/architecture/testing-architecture.md](docs/architecture/testing-architecture.md)
- 架构守卫准入、观察模型与复杂度边界：[docs/architecture/architecture-guard.md](docs/architecture/architecture-guard.md)
- 构建、测试与开发命令：[docs/development/commands.md](docs/development/commands.md)
- 编码风格与命名约定：[docs/development/coding-style.md](docs/development/coding-style.md)
- 后端实现约定：[docs/development/backend-implementation.md](docs/development/backend-implementation.md)

## Agent 交互与 Shell 约定

- 在聊天 UI 中，面向用户的回复默认使用自然、地道的中文。代码标识符、命令、文件路径、API 名称和引用的源文本保持原语言。
- 本仓库明确授权 Codex 使用子代理功能并行调查或拆分边界清晰的任务；主代理仍负责整合结论、执行改动和最终验证。
- 跨文件、跨模块或高搜索噪声的只读代码调查优先使用项目级 `code_researcher`；事务一致性、并发、安全边界或证据冲突等
  复杂问题再升级到 `deep_researcher`。调用边界、返回契约和外置记忆规则见
  [docs/agents/code-investigation.md](docs/agents/code-investigation.md)。
- Windows 环境默认使用 PowerShell 7（`pwsh`）执行命令；只有目标脚本明确要求时才切换到 Windows PowerShell 5.1、
  `cmd.exe` 或其他 shell。
- PowerShell 会把命令参数位置中未引用的 `@name` 解释为 splatting。向原生命令传递字面量 `@...` 时必须加引号，
  例如使用 `gh issue edit <number> --repo cyy1998/shgas-iam --add-assignee '@me'`，不要传递裸 `@me`。
- 在 PowerShell 中读取文本文件时显式指定 UTF-8 编码，例如 `Get-Content -Path "AGENTS.md" -Encoding utf8`，避免中文乱码。

## Bun 测试硬约束

- 数据库、Redis、HTTP、subprocess、readiness 等真实 I/O Promise 必须先用普通 `await` 完成，再做同步断言：
  `const report = await gate.verify(...); expect(report).toMatchObject(...)`。
- 禁止对真实 I/O 使用 `await expect(gate.verify(...)).resolves...`、`.rejects...` 或 async `toThrow`；Bun 1.3.14
  可能在 async matcher 内重入 event loop，导致测试悬挂。失败路径先捕获 rejection，再同步断言错误。完整说明见
  [Bun 异步断言](docs/architecture/testing-architecture.md#bun-异步断言)。

## Agent skills

### Engineering workflow

通用开发方法以 `mattpocock/skills` 为准；小型明确改动可以直接进入 `/implement`，跨会话 feature 使用 GitHub issue
形式的 spec、tickets 和双轴评审。仓库只在 [docs/agents/workflow.md](docs/agents/workflow.md) 补充分支、验证、授权和
本地合入约束。

`openspec/` 已冻结为只读历史参考。除非维护者明确要求修正历史记录，否则不得在其中新增、修改、同步或归档产物，也不得把其中的规格视为当前事实来源。

### Issue tracker

新建 spec、tickets 与跨会话状态使用 `cyy1998/shgas-iam` GitHub Issues；单会话直接实现无需创建 issue。
See `docs/agents/issue-tracker.md`.

### Triage labels

The default canonical triage labels are used unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context layout with `CONTEXT.md` at the root and ADRs under `docs/adr/`. See `docs/agents/domain.md`.
