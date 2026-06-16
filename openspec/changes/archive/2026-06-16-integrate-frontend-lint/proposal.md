## Why

`apps/admin` 与 `apps/sso` 当前没有 `lint` 脚本，导致根目录 `pnpm lint` 无法覆盖两个 Umi Max 前端应用。现在补齐前端 lint 能力，可以让前端代码质量检查进入 Turborepo 工作流，并一次性清理已有 lint 错误，避免后续改动继续积累样式和代码规范债务。

## What Changes

- 为 `@iam/admin` 与 `@iam/sso` 增加完整 lint 命令，使 `turbo lint` 与包级 `pnpm --filter <pkg> lint` 都能检查前端代码。
- 为两个前端应用补齐 Umi Max 兼容的 lint 运行依赖；ESLint 版本保持前端自身兼容要求，不与后端/shared 包的 ESLint 版本强行同步。
- 修复现有 `admin` 与 `sso` 的 lint 错误，包括 Less 样式规则问题和可能暴露出的 TypeScript/React lint 问题。
- 保持 `format`、`typecheck`、`build` 等既有命令语义不变。

## Capabilities

### New Capabilities
- `frontend-lint-integration`: 覆盖 `apps/admin` 与 `apps/sso` 的 lint 脚本、依赖边界、现有 lint 错误修复，以及根工作区 lint 集成要求。

### Modified Capabilities

无。

## Impact

- 影响 `apps/admin/package.json`、`apps/sso/package.json` 及相关锁文件。
- 影响 `apps/admin/src/**/*.less`、`apps/sso/src/**/*.less`，并可能影响前端源文件中被 ESLint 检出的少量问题。
- 影响根目录 `pnpm lint` 的覆盖范围：新增两个前端 workspace 的 lint 任务。
- 不改变前端运行时 API、后端接口、数据库 schema 或网关配置。
