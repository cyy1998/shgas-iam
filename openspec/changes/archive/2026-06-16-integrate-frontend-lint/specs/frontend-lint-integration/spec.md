## ADDED Requirements

### Requirement: 前端应用提供完整 lint 命令
`@iam/admin` 与 `@iam/sso` SHALL 在各自 `package.json` 中提供 `lint` 与 `lint:fix` 脚本，且 `lint` MUST 通过现有 Umi Max ESLint 与 Stylelint 配置覆盖前端 TypeScript、React 与 Less/CSS 文件。

#### Scenario: 包级 lint 可执行
- **WHEN** 开发者运行 `pnpm --filter @iam/admin lint` 或 `pnpm --filter @iam/sso lint`
- **THEN** 对应前端应用 MUST 执行 ESLint 与 Stylelint 检查并返回检查结果

#### Scenario: 包级 lint fix 可执行
- **WHEN** 开发者运行 `pnpm --filter @iam/admin lint:fix` 或 `pnpm --filter @iam/sso lint:fix`
- **THEN** 对应前端应用 MUST 执行 ESLint 与 Stylelint 自动修复能力

### Requirement: 根工作区 lint 覆盖前端应用
根目录 `pnpm lint` SHALL 通过 Turborepo 覆盖 `@iam/admin` 与 `@iam/sso` 的 lint 任务，并在当前代码库状态下通过。

#### Scenario: 根 lint 包含 admin 与 sso
- **WHEN** 开发者在仓库根目录运行 `pnpm lint`
- **THEN** Turborepo MUST 将 `@iam/admin` 与 `@iam/sso` 的 `lint` 任务纳入执行范围

#### Scenario: 根 lint 当前通过
- **WHEN** 开发者在完成本变更后运行 `pnpm lint`
- **THEN** 命令 MUST 成功完成，不因 `apps/admin` 或 `apps/sso` 的现有 lint 错误失败

### Requirement: 前端 lint 依赖保持 Umi Max 兼容
`@iam/admin` 与 `@iam/sso` MUST 使用与当前 Umi Max 4 lint 配置兼容的 ESLint 与 Stylelint 依赖；本变更 MUST NOT 要求前端与后端/shared 包同步 ESLint 主版本。

#### Scenario: 前端 lint 不受 ESLint 10 影响
- **WHEN** 开发者运行 `pnpm --filter @iam/admin lint` 或 `pnpm --filter @iam/sso lint`
- **THEN** 命令 MUST NOT 因 `.eslintrc.js` 与 ESLint flat config 的版本差异而失败

#### Scenario: 不迁移前端 lint 配置体系
- **WHEN** 实施本变更
- **THEN** 前端应用 MUST 保持现有 `.eslintrc.js` 与 `.stylelintrc.js` 配置体系，不要求新增 ESLint flat config 迁移

### Requirement: 现有前端 lint 错误被修复
`apps/admin` 与 `apps/sso` 中当前由完整 Umi Max lint 暴露的错误 SHALL 被修复或通过明确、最小范围的 lint 配置例外处理。

#### Scenario: Less alpha 表达符合规则
- **WHEN** Stylelint 检查 `apps/admin/src/**/*.less` 与 `apps/sso/src/**/*.less`
- **THEN** Less 文件 MUST NOT 因 `alpha-value-notation` 规则失败

#### Scenario: vendor prefix 处理有明确意图
- **WHEN** Stylelint 检查包含 vendor prefix 的 Less 文件
- **THEN** 不必要的 vendor prefix MUST 被移除，仍需保留的兼容声明 MUST 通过最小范围配置或局部例外避免 lint 失败

#### Scenario: ESLint 错误被修复
- **WHEN** ESLint 检查 `apps/admin` 与 `apps/sso` 的前端源代码
- **THEN** 源代码 MUST NOT 存在导致包级 lint 失败的 ESLint 错误
