# 仓库指引入口

本文件是 Antigravity、Codex 及其他 Agent 的仓库级导航入口，具体规范集中维护在 `docs/` 下。本页只保留按任务查找规范的指引。

## 阅读顺序

1. **判断事实与目标**：当前行为以实现、生效配置与可执行测试为最高依据，其次是 `Current` 文档，最后是其他历史线索；证据冲突时调查并上报，修改范围以用户授权与适用 Spec/ticket 为准（详细约定及全仓清单按需查[文档索引](docs/index.md#当前事实与修改目标)）。
2. 调查、设计或改动前，按下表读取所有命中项。跨边界任务叠加阅读；每篇先读通用规则，再读涉及模块的小节。范围扩大时补读新命中项，已读且未变化的内容无需重复加载。
3. 讨论首次落盘、开始实施、修改文件或执行提交、推送、PR 交付、发布前，必须先读
   [工作流补充](docs/agents/workflow.md)，核对仓库的分支、验证与 PR 交付约束。

| 任务触发条件                                                                                   | 必读文档                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 定位陌生代码、新增或移动文件、涉及生成目录或 vendored 资源                                     | [仓库地图](docs/engineering/repository-map.md)                                                                                                                               |
| 跨 runtime 设计、调整信任边界、数据权威来源、一致性或恢复责任                                  | [系统架构视图](docs/engineering/system-architecture.md)；按涉及模块继续阅读，验证方式见[测试规范](docs/engineering/testing.md#验证选择)                                      |
| 理解业务语义、设计功能或修改业务规则                                                           | 从[功能与业务规则](docs/features/README.md)选相关主题，再核对 [GLOSSARY.md](GLOSSARY.md)、[领域文档规则](docs/agents/domain.md)与相关已接受 ADR                              |
| 修改源码、测试或工具配置                                                                       | [编码风格与命名](docs/engineering/coding-style.md)                                                                                                                           |
| 后端代码或配置，包括协议入口、runtime、composition 与后端共享包                                | [后端架构与实现约定](docs/engineering/backend-architecture.md)                                                                                                               |
| 修改 Admin 写入的事务、响应或失败恢复                                                          | [Admin 同对象写入](docs/engineering/backend-architecture.md#admin-同对象写入规范)、[Admin 写入结果与恢复](docs/engineering/backend-architecture.md#admin-写入结果与失败恢复) |
| Admin/SSO 前端代码或配置，包括页面、请求、路由、权限展示与前端启动                             | [前端架构](docs/engineering/frontend-architecture.md)                                                                                                                        |
| 共享代码选址、package exports、DTO/schema 演进、repository 或数据库 schema/relations/migration | [共享契约与数据库](docs/engineering/contracts-and-database.md)；数据库改动按该文档使用 schema 相关 skill                                                                     |
| 新增或修改测试、选择验证通道                                                                   | [测试与验证](docs/engineering/testing.md#验证选择)，按需读测试分类、命名和质量规则                                                                                           |
| 修改 runner、测试收集、fixture、资源隔离或清理                                                 | [收集与编排](docs/engineering/testing.md#收集与编排)、[专用资源与隔离](docs/engineering/testing.md#专用资源与隔离)                                                           |
| 调整模块依赖边界、公开出口，或新增/修改 Architecture Guard                                     | [架构守卫](docs/engineering/testing.md#架构守卫)                                                                                                                             |
| 运行本地开发、构建、测试或检查命令                                                             | [命令入口](docs/engineering/commands.md)中的对应通道或 workspace 入口                                                                                                        |
| Gateway、Docker、observability 配置，或部署、数据切换、运维修复                                | [仓库地图](docs/engineering/repository-map.md)及[发布与维护](docs/index.md#发布与维护)中对应的 Current runbook。执行命令前读完整的适用流程                                   |
| 修改文档、AGENTS.md 或 skill                                                                   | [文档索引的维护方式](docs/index.md#维护方式)；涉及的架构或领域规则仍按上表叠加                                                                                               |

`openspec/` 已冻结为只读历史参考。除非维护者明确要求修正历史记录，否则不得在其中新增、修改、同步或归档产物，也不得把其中的规格视为当前事实来源。

## Agent 交互与 Shell 约定

- 在聊天 UI 中，面向用户的回复默认使用自然、地道的中文。代码标识符、命令、文件路径、API 名称和引用的源文本保持原语言。
- 本仓库授权在 T3 Code 下由 Antigravity 与 Codex 使用原生子代理及 `delegate_task` 并行调查或拆分任务；主代理负责整合与串行验证。
  只读调查、跨引擎委派与双轴评审的角色、模型、档位及返回契约见[代码调查与双引擎编排](docs/agents/code-investigation.md)。
- Windows 环境默认使用 PowerShell 7（`pwsh`）执行命令；向原生命令传递字面量 `@...` 时加引号（如 `'@me'`），读取文本文件显式指定 `-Encoding utf8`。

## Bun 测试硬约束

- 对数据库、Redis、HTTP、subprocess、readiness 等真实 I/O Promise，先用普通 `await` 完成（失败路径先捕获 rejection），再做同步断言；
  禁止使用 `await expect(...).resolves` / `.rejects` 或 async `toThrow`（规避 Bun 1.3.14 event loop 重入悬挂，详见[Bun 异步断言](docs/engineering/testing.md#bun-异步断言)）。

## 开发方法与 Issue 路由

- **三轨开发流**（详见[工作流补充](docs/agents/workflow.md)）：
  - **分析与设计（T3 Code）**：调查、澄清、落盘设计与发布 Spec/tickets；准备交接 AFK 时读[设计与执行交接](docs/agents/sandcastle-afk.md#设计与执行交接)。
  - **完整 Spec 执行**：默认交由[Sandcastle AFK](docs/agents/sandcastle-afk.md)；仅在用户明确指定时手动运行 [`implement-spec`](.agents/skills/implement-spec/SKILL.md)。
  - **轻量直改与异常介入（Fast Track）**：T3 Code 单会话完成并按 `$pr` 创建 PR 交付；显式调用 [`implement`](.agents/skills/implement/SKILL.md) 时走其 TDD 与双轴评审流程。
- 上游高频流程 skills 需用户点名后直接读取对应 `SKILL.md`：
  [`to-spec`](.agents/skills/to-spec/SKILL.md)、[`to-tickets`](.agents/skills/to-tickets/SKILL.md)、[`wayfinder`](.agents/skills/wayfinder/SKILL.md)、
  [`grill-with-docs`](.agents/skills/grill-with-docs/SKILL.md)、[`grill-me`](.agents/skills/grill-me/SKILL.md)、[`triage`](.agents/skills/triage/SKILL.md)。
  正文中的 `Call the Skill tool with "<name>"` 在无独立 `Skill` 工具的环境中等效于直接读取对应 `.agents/skills/<name>/SKILL.md`。
- 跨会话 Spec/tickets 存放在 `cyy1998/shgas-iam` GitHub Issues：操作 issue 或恢复工作前读[议题跟踪规则](docs/agents/issue-tracker.md)，设置标签或 triage 前读[标签约定](docs/agents/triage-labels.md)。
