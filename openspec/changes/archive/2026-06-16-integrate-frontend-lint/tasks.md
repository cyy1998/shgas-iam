## 1. 接入前端 lint 命令

- [x] 1.1 在 `apps/admin/package.json` 增加完整 `lint` 与 `lint:fix` 脚本，使用包级 ESLint 与 Stylelint 并继承现有 Umi Max 配置
- [x] 1.2 在 `apps/sso/package.json` 增加完整 `lint` 与 `lint:fix` 脚本，使用包级 ESLint 与 Stylelint 并继承现有 Umi Max 配置
- [x] 1.3 为 `@iam/admin` 显式声明 Umi Max 4 兼容的 `eslint@8.35.0` 与 `stylelint@14.8.2` devDependencies
- [x] 1.4 为 `@iam/sso` 显式声明 Umi Max 4 兼容的 `eslint@8.35.0` 与 `stylelint@14.8.2` devDependencies
- [x] 1.5 更新 `pnpm-lock.yaml`，确认依赖变更只服务于两个前端应用的 lint 运行

## 2. 修复 admin lint 错误

- [x] 2.1 运行 `pnpm --filter @iam/admin lint`，记录完整 ESLint 与 Stylelint 失败项
- [x] 2.2 修复 `apps/admin/src/**/*.less` 中的 `alpha-value-notation` 问题，保持视觉等价
- [x] 2.3 修复或明确例外处理 `apps/admin` 中可能出现的 vendor prefix 规则问题
- [x] 2.4 修复 `apps/admin` 中可能暴露出的 TypeScript/React ESLint 错误
- [x] 2.5 重新运行 `pnpm --filter @iam/admin lint` 并确认通过

## 3. 修复 sso lint 错误

- [x] 3.1 运行 `pnpm --filter @iam/sso lint`，记录完整 ESLint 与 Stylelint 失败项
- [x] 3.2 修复 `apps/sso/src/**/*.less` 中的 `alpha-value-notation` 问题，保持视觉等价
- [x] 3.3 修复或明确例外处理 `apps/sso` 中的 `-webkit-backdrop-filter`、`-webkit-sticky` 等 vendor prefix 规则问题
- [x] 3.4 修复 `apps/sso` 中可能暴露出的 TypeScript/React ESLint 错误
- [x] 3.5 重新运行 `pnpm --filter @iam/sso lint` 并确认通过

## 4. 验证与收尾

- [x] 4.1 运行根目录 `pnpm lint`，确认 Turborepo 覆盖并通过 `@iam/admin` 与 `@iam/sso`
- [x] 4.2 如 lint 修复涉及样式兼容例外或非机械代码变更，运行受影响前端的 `typecheck` 或 `build`
- [x] 4.3 审阅 diff，确认未引入前端运行时行为、API、路由或业务逻辑变更
- [x] 4.4 运行 `openspec status --change integrate-frontend-lint`，确认变更已达到 apply-ready
