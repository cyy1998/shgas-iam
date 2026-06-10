## ADDED Requirements

### Requirement: Gateway sync CLI requires explicit app scope

系统 SHALL 要求 APISIX sync CLI 的 `validate`、`diff` 和 `apply` 命令在运行时使用显式 app scope，scope MUST 使用 `<env>:<app>` 格式。

#### Scenario: Command uses explicit CLI scope

- **WHEN** 开发者运行 APISIX sync CLI 并传入 `--env prod:iam`
- **THEN** 系统 SHALL 使用 `prod:iam` 作为 manifest scope
- **AND** 系统 SHALL 从 `gateway/apisix/manifests/prod/iam` 或显式 `--manifest-dir` 加载 manifest

#### Scenario: Command uses environment scope

- **WHEN** 开发者未传入 `--env` 但设置了 `APISIX_MANIFEST_ENV=prod:tender`
- **THEN** 系统 SHALL 使用 `prod:tender` 作为 manifest scope

#### Scenario: Missing scope fails

- **WHEN** 开发者运行 `validate`、`diff` 或 `apply` 且未传入 `--env` 也未设置 `APISIX_MANIFEST_ENV`
- **THEN** 命令 MUST 失败
- **AND** 错误信息 SHALL 指出必须提供 `--env <env:app>` 或 `APISIX_MANIFEST_ENV`

#### Scenario: Env-only scope fails

- **WHEN** 开发者传入 `--env dev`
- **THEN** 命令 MUST 失败
- **AND** 错误信息 SHALL 指出 scope 必须使用 `<env>:<app>` 格式

#### Scenario: Invalid scope segment fails

- **WHEN** 开发者传入包含大写字母、空片段、路径片段或非法字符的 scope
- **THEN** 命令 MUST 失败
- **AND** 错误信息 SHALL 指出 `env` 和 `app` 只能使用小写字母、数字和短横线

### Requirement: Gateway sync JSON output uses normalized change lists

系统 SHALL 为 APISIX sync CLI 的 JSON 输出提供统一、可程序消费的 change list 结构。

#### Scenario: Diff JSON reports ignored changes with reasons

- **WHEN** 开发者运行 `diff --json`
- **THEN** 输出 SHALL 包含 `creates`、`updates`、`deletes` 和 `ignored` 数组
- **AND** `ignored` 中的每一项 SHALL 包含 `kind`、`id` 和 `reason`
- **AND** `reason` MUST 为 `dynamic`、`out_of_scope` 或 `unmanaged`
- **AND** 输出 MUST NOT 包含 `ignoredDynamic`、`ignoredOutOfScope` 或 `ignoredUnmanaged`

#### Scenario: Apply JSON reports applied actions as a list

- **WHEN** 开发者运行 `apply --json`
- **THEN** 输出 SHALL 包含 `creates`、`updates`、`deletes`、`ignored`、`dryRun`、`prune` 和 `applied`
- **AND** `applied` SHALL 是数组
- **AND** `applied` 中的每一项 SHALL 包含 `kind`、`id` 和 `action`
- **AND** `action` MUST 为 `create`、`update` 或 `delete`

#### Scenario: Dry-run apply reports no applied actions

- **WHEN** 开发者运行 `apply --json --dry-run`
- **THEN** 输出 SHALL 包含 `dryRun: true`
- **AND** 输出 SHALL 包含 `applied: []`

## MODIFIED Requirements

### Requirement: APISIX gateway tools are managed as a workspace package

系统 SHALL 将 `gateway/apisix` 作为私有 pnpm workspace package 管理，使 APISIX manifest 同步工具拥有明确的脚本入口、依赖声明和验证生命周期。

#### Scenario: Workspace discovers APISIX gateway package

- **WHEN** 开发者查看 workspace package 配置
- **THEN** `gateway/apisix` SHALL 被 pnpm workspace 发现为 package
- **AND** 该 package SHALL 使用私有 package 名称标识 APISIX gateway 工具边界

#### Scenario: Package provides gateway sync commands

- **WHEN** 开发者进入 APISIX gateway package 或使用 pnpm filter 调用 package 脚本
- **THEN** package SHALL 提供 `apisix`、`validate`、`diff` 和 `apply` 脚本来执行 APISIX manifest 同步 CLI
- **AND** `validate`、`diff` 和 `apply` SHALL 分别调用同名 CLI 子命令
- **AND** 这些脚本 SHALL 支持 `--` 后参数透传方式

#### Scenario: Package participates in validation lifecycle

- **WHEN** 开发者运行 APISIX gateway package 的验证命令
- **THEN** package SHALL 提供 `test`、`lint` 和 `typecheck` 脚本
- **AND** 这些脚本 SHALL 能被 Turbo workspace 任务发现并执行

#### Scenario: Root gateway commands remain compatible

- **WHEN** 开发者运行根级 `pnpm gateway:apisix:validate`、`pnpm gateway:apisix:diff` 或 `pnpm gateway:apisix:apply`
- **THEN** 命令 SHALL 委托到 APISIX gateway package
- **AND** 命令 SHALL 继续支持现有 `--` 后参数透传方式
