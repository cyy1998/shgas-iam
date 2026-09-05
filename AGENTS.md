# 仓库指引入口

本文件是 Codex 和其他 agent 的仓库级入口。详细规则放在 `docs/`；`AGENTS.md` 保持为短索引。

## 阅读顺序

1. 先读[文档索引](docs/index.md)的状态约定与“当前事实与修改目标”，确认本次涉及文档的状态。
2. 调查、设计或改动前，按下表读取所有命中项。跨边界任务叠加阅读；每篇先读通用规则，再读涉及模块的小节。
   范围扩大时补读新命中项，已读且未变化的内容无需重复加载。
3. 修改文件或执行提交、合并、发布前，必须先读[开发工作流](docs/agents/workflow.md)，遵守分支、验证、授权和本地合入约束。

| 任务触发条件 | 必须读取 |
|---|---|
| 定位陌生代码、新增或移动文件、涉及生成目录或 vendored 资源 | [仓库地图](docs/architecture/repository-map.md) |
| 理解业务语义、设计功能或修改业务规则 | [CONTEXT.md](CONTEXT.md)、[领域文档规则](docs/agents/domain.md)，并从索引选择该领域已接受的 ADR |
| 修改源码、测试或工具配置 | [编码风格与命名](docs/development/coding-style.md) |
| 后端代码或配置，包括协议入口、runtime、composition 与后端共享包 | [后端架构](docs/architecture/backend-architecture.md)、[后端实现约定](docs/development/backend-implementation.md) |
| Admin/SSO 前端代码或配置，包括页面、请求、路由、权限展示与 Umi runtime | [前端架构](docs/architecture/frontend-architecture.md) |
| 共享代码选址、package exports、DTO/schema 演进、repository 或数据库 schema/relations/migration | [共享契约与数据库](docs/architecture/contracts-and-database.md)；数据库改动按该文档使用 schema 相关 skill |
| 新增或修改测试、测试编排，或选择验证通道与资源 | [测试编排架构](docs/architecture/testing-architecture.md) |
| 调整模块依赖边界、公开出口，或新增/修改 Architecture Guard | [架构守卫规范](docs/architecture/architecture-guard.md) |
| 运行开发、构建、测试或维护命令 | [命令入口](docs/development/commands.md)中的对应通道或 workspace 入口 |
| Gateway、Docker、observability 配置，或部署、数据切换、运维修复 | [仓库地图](docs/architecture/repository-map.md)，以及索引中覆盖该系统或操作的 Current runbook；执行命令前读完整的适用流程 |
| 修改文档、AGENTS.md 或 skill | [文档索引的维护方式](docs/index.md#维护方式)；涉及的架构或领域规则仍按上表叠加 |

具体模块的功能契约和发布手册沿所涉架构文档及索引继续定位；本入口不复制其规则。

`openspec/` 已冻结为只读历史参考。除非维护者明确要求修正历史记录，否则不得在其中新增、修改、同步或归档产物，也不得把其中的规格视为当前事实来源。

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

## 开发方法与 Issue 路由

- 通用开发方法以 `mattpocock/skills` 为准。小型明确改动可以直接进入 `/implement`，单会话直接实现无需创建 issue。
- 跨会话 feature 使用 `cyy1998/shgas-iam` GitHub Issues 保存 spec、tickets 和状态，并执行双轴评审。
  创建、读取、更新 issue 或恢复跨会话工作前，先读[议题跟踪规则](docs/agents/issue-tracker.md)。
- 执行 triage 或设置 issue 标签前，先读[标签约定](docs/agents/triage-labels.md)，沿用默认 canonical labels。
