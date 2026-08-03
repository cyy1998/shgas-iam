# 编码风格与命名约定

全仓库使用 TypeScript，并保持 2-space indentation。遵守各 app 或 package 已配置的 formatter。

## Formatter 边界

- 根工具脚本（`scripts/`、`eslint.root.config.mjs`）以及 API/backend/shared/gateway packages（`apps/api`、
  `apps/admin-api`、`apps/oidc-provider`、`apps/worker`、
  `packages/api-core`, `packages/contracts`, `packages/db`, `packages/domain`, `packages/jobs`,
  `packages/client-subject-projection`、`packages/role-assignment-resolution`,
  `packages/user-profile-read-model`、`gateway`）：ESLint 使用 Antfu config，
  采用 double quotes、semicolons，以及
  120-character soft limit。
- Admin/SSO frontends（`apps/admin`、`apps/sso`）：Prettier 使用 single quotes、trailing commas 和 80-character
  wrap。

## 命名

- 保留既有 domain file naming：`user.service.ts`、`user.repository.ts`、`user.schema.ts`、`user.routes.ts`、
  `user.handlers.ts`、`user.trpc.ts` 和 `user.type.ts`。
- React component 和 page 使用 PascalCase。
- 已经使用 import alias 的地方，优先沿用 `@admin`、`@sso` 或 workspace package import。
