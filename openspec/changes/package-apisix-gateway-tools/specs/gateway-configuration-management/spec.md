## ADDED Requirements

### Requirement: APISIX gateway tools are managed as a workspace package

系统 SHALL 将 `gateway/apisix` 作为私有 pnpm workspace package 管理，使 APISIX manifest 同步工具拥有明确的脚本入口、依赖声明和验证生命周期。

#### Scenario: Workspace discovers APISIX gateway package

- **WHEN** 开发者查看 workspace package 配置
- **THEN** `gateway/apisix` SHALL 被 pnpm workspace 发现为 package
- **AND** 该 package SHALL 使用私有 package 名称标识 APISIX gateway 工具边界

#### Scenario: Package provides gateway sync commands

- **WHEN** 开发者进入 APISIX gateway package 或使用 pnpm filter 调用 package 脚本
- **THEN** package SHALL 提供 `validate`、`diff` 和 `apply` 脚本来执行现有 APISIX manifest 同步 CLI
- **AND** 这些脚本 SHALL 保持现有 CLI 参数和默认行为不变

#### Scenario: Package participates in validation lifecycle

- **WHEN** 开发者运行 APISIX gateway package 的验证命令
- **THEN** package SHALL 提供 `test`、`lint` 和 `typecheck` 脚本
- **AND** 这些脚本 SHALL 能被 Turbo workspace 任务发现并执行

#### Scenario: Root gateway commands remain compatible

- **WHEN** 开发者运行根级 `pnpm gateway:apisix:validate`、`pnpm gateway:apisix:diff` 或 `pnpm gateway:apisix:apply`
- **THEN** 命令 SHALL 委托到 APISIX gateway package
- **AND** 命令 SHALL 继续支持现有 `--` 后参数透传方式
