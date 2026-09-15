# 编码风格与命名约定

全仓库使用 TypeScript，并保持 2-space indentation。遵守各 app 或 package 已配置的 formatter。

## Formatter 边界

- 根工具脚本（`scripts/`、`eslint.root.config.mjs`）以及 API/backend/shared/gateway packages（`apps/api`、
  `apps/admin-api`、`apps/worker`、
  `packages/api-core`, `packages/contracts`, `packages/db`, `packages/domain`, `packages/jobs`,
  `packages/client-subject-projection`、`packages/organization-responsibility-resolution`、
  `packages/role-assignment-resolution`,
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
- Admin/SSO 普通 Unit 测试命名为 `*.test.ts[x]` 并默认在 Node 中运行；只有确实依赖浏览器全局或 React DOM render
  的 Unit 使用 `*.dom.test.ts[x]`。Node/DOM 是 Unit 内部 execution environments，不新增公开命令。
- Component Integration 使用 `test-integration/component/**/*.integration.test.ts[x]`；其他 Integration profile 同样
  保留 `*.integration.test.ts[x]`，不能用 DOM 后缀替代行为层级。
- Playwright 驱动的 Browser Integration 与 Full-system E2E 使用其 owner 目录下的 `*.spec.ts`；`*.spec.ts` 不作为
  jsdom Unit 的命名方式。
