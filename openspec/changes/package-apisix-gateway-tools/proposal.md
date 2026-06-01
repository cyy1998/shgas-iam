## Why

`gateway/apisix` 现在已经包含 APISIX manifest、配置样板、同步 CLI、导出函数和测试，但它还只是仓库中的普通目录。根脚本直接用文件路径调用 `apisix-sync.ts`，导致依赖归属、Turbo 验证链路和后续复用边界不够清晰。

将 APISIX 网关工具整理为 workspace package，可以让同步工具拥有明确的 package 边界、脚本入口、依赖声明和测试/typecheck/lint 生命周期，同时保持 manifest 和运行时配置仍归属在 `gateway/apisix`。

## What Changes

- 将 `gateway/apisix` 纳入 pnpm workspace，作为私有 package 管理。
- 为 APISIX 同步工具提供 package 级脚本入口，覆盖 `validate`、`diff`、`apply`、`test`、`lint` 和 `typecheck`。
- 将 `yaml`、Bun 类型、ESLint 和 TypeScript 相关工具依赖归属到 APISIX gateway package，而不是隐式依赖仓库根包。
- 保留根 `gateway:apisix:*` 脚本作为兼容包装，委托到新的 workspace package。
- 保持 APISIX manifest、config、README 的目录语义不变，不改变同步工具的现有业务行为。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `gateway-configuration-management`: 明确 APISIX 网关同步工具 SHALL 作为 workspace package 被管理，并通过 package 脚本纳入常规验证和调用流程。

## Impact

- 影响 `pnpm-workspace.yaml`、根 `package.json` 和 `gateway/apisix` 下的 package/脚本组织。
- 影响 APISIX 同步工具的调用方式和验证入口，但不改变 manifest 格式、APISIX Admin API 行为、动态注册边界或部署拓扑。
- 根级 `pnpm gateway:apisix:*` 命令应继续可用，降低现有文档和运维命令的迁移成本。
