## 1. 前端测试依赖与脚本

- [x] 1.1 在 `apps/admin/package.json` 增加 `vitest`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom`、`@testing-library/user-event`、`msw`、`@playwright/test` 和 `cross-env` 等测试 devDependencies。
- [x] 1.2 在 `apps/sso/package.json` 增加同一组测试 devDependencies，保持两个前端测试工具链版本一致。
- [x] 1.3 为 `@iam/admin` 增加 `test`、`test:watch`、`test:coverage`、`dev:e2e`、`e2e` 和 `e2e:ui` 脚本，其中 `test` 必须执行实际 Vitest 命令。
- [x] 1.4 为 `@iam/sso` 增加 `test`、`test:watch`、`test:coverage`、`dev:e2e`、`e2e` 和 `e2e:ui` 脚本，其中 `test` 必须执行实际 Vitest 命令。
- [x] 1.5 更新根目录 `package.json`，新增独立 `e2e` 脚本并保持 `test` 继续指向 `turbo test`。
- [x] 1.6 更新 `turbo.json`，新增 `e2e` task，并确认 `test` task 会调度两个前端的实际 `test` 脚本。
- [x] 1.7 更新 `pnpm-lock.yaml`，确认依赖变更仅服务于前端测试基建。

## 2. Vitest 与 MSW 单测基建

- [x] 2.1 为 `apps/admin` 新增 `vitest.config.ts`，配置 `jsdom`、setup file、alias、测试 include/exclude 和 coverage 报告。
- [x] 2.2 为 `apps/sso` 新增 `vitest.config.ts`，配置 `jsdom`、setup file、alias、测试 include/exclude 和 coverage 报告。
- [x] 2.3 在 `apps/admin/test` 下新增 `setup.ts`、`render.tsx`、`mocks/server.ts`、`mocks/handlers.ts`、`mocks/fixtures.ts` 和 `mocks/umijs-max.ts`。
- [x] 2.4 在 `apps/sso/test` 下新增 `setup.ts`、`render.tsx`、`mocks/server.ts`、`mocks/handlers.ts`、`mocks/fixtures.ts` 和 `mocks/umijs-max.ts`。
- [x] 2.5 在两个前端的 setup 中集中补齐 `ResizeObserver`、`matchMedia`、`scrollTo` 等 `jsdom` 缺失浏览器 API，并接入 `@testing-library/jest-dom`。
- [x] 2.6 使用 MSW node server 为两个前端提供 app-local HTTP mock，确保单测不访问真实 `localhost:30000` 或 `localhost:30001`。
- [x] 2.7 在 Umi runtime mock 中集中提供可控的 `history`、`request`、`useModel` 和 `useAccess`，避免测试文件散落完整 `@umijs/max` mock。

## 3. 首批前端单测

- [x] 3.1 为 `apps/sso/src/utils/form-check.ts` 补充单测，覆盖手机号、密码复杂度和确认密码规则。
- [x] 3.2 为 `apps/sso/src/lib/sso.ts` 补充单测，覆盖 authorize/logout URL 构造和 authentication config 响应消费。
- [x] 3.3 为 `apps/sso/src/lib/login-credential.ts` 补充单测或最小可验证用例，覆盖配置校验、credential 格式和敏感材料不外泄的可断言边界。
- [x] 3.4 为 `apps/sso/src/lib/human-verification.ts` 补充单测，覆盖 Cap 成功、失败、重试触发和回调行为。
- [x] 3.5 为 `apps/sso/src/services/auth.ts` 补充 service 边界测试，覆盖密码登录、手机号登录和 logout 请求参数。
- [x] 3.6 为 SSO 登录页补充聚焦组件测试，覆盖表单校验、登录失败强提示或 Cap 重试触发中的核心行为。
- [x] 3.7 为 `apps/admin/src/utils/format.ts` 和 `apps/admin/src/utils/auth.ts` 补充单测，覆盖格式化、登录跳转和退出边界。
- [x] 3.8 为 `apps/admin/src/services/user.ts` 与 `apps/admin/src/services/client.ts` 补充 service wrapper 测试，覆盖关键请求参数和 tRPC/REST 调用边界。
- [x] 3.9 为 `apps/admin/src/components/StatusTag.tsx` 补充轻量组件测试，覆盖常见状态展示。
- [x] 3.10 运行 `pnpm --filter @iam/sso test` 和 `pnpm --filter @iam/admin test`，确认两个前端单测通过。

## 4. Playwright mocked E2E 基建

- [x] 4.1 为 `apps/admin` 新增 `playwright.config.ts`，配置固定端口 `dev:e2e` webServer、`/iam-admin/` base path、trace/screenshot 策略和测试目录。
- [x] 4.2 为 `apps/sso` 新增 `playwright.config.ts`，配置固定端口 `dev:e2e` webServer、`/portal/` base path、trace/screenshot 策略和测试目录。
- [x] 4.3 在 `apps/admin/e2e` 新增 fixture/helper，使用 Playwright `page.route` mock admin 初始用户态、权限、用户列表和客户端列表相关接口。
- [x] 4.4 在 `apps/sso/e2e` 新增 fixture/helper，使用 Playwright `page.route` mock 登录、发送验证码、重置密码和必要 public/open/sso 接口。
- [x] 4.5 确认 mocked E2E 不依赖真实 API、PostgreSQL、Redis、验证码服务或真实登录态。

## 5. 首批 Playwright smoke

- [x] 5.1 为 `apps/sso/e2e/login.spec.ts` 增加登录页 smoke，覆盖 `/portal/login` 打开、账号密码输入、mock 登录成功或失败提示路径。
- [x] 5.2 为 `apps/sso/e2e/reset-password.spec.ts` 增加重置密码 smoke，覆盖基础表单校验、mock 发送验证码和 mock 重置成功路径。
- [x] 5.3 为 `apps/admin/e2e/shell.spec.ts` 增加管理端壳子 smoke，覆盖 `/iam-admin/users` 打开、layout/menu 和用户列表基础可用性。
- [x] 5.4 为 `apps/admin/e2e/clients.spec.ts` 增加客户端页 smoke，覆盖 `/iam-admin/clients` 打开、客户端列表和创建/编辑弹窗基础可用性。
- [x] 5.5 运行 `pnpm --filter @iam/sso e2e` 和 `pnpm --filter @iam/admin e2e`，确认两个前端 mocked E2E 通过。

## 6. 文档与验收规则

- [x] 6.1 更新 README、AGENTS.md 或相邻前端测试文档，记录 `pnpm --filter @iam/* test`、`test:watch`、`test:coverage`、`e2e` 和根级 `pnpm e2e` 的使用方式。
- [x] 6.2 文档化后续 OpenSpec 前端变更验收规则：纯逻辑/service/API 契约变更需要 Vitest，关键页面流程变更需要 mocked E2E 或明确豁免，纯视觉微调使用 lint/build/截图或人工 smoke。
- [x] 6.3 记录第一期覆盖率策略：提供 coverage 报告但不设置全局硬阈值，后续可对 `src/lib`、`src/utils` 和 `src/services` 逐步收紧。

## 7. 最终验证

- [x] 7.1 运行 `pnpm --filter @iam/sso test:coverage` 和 `pnpm --filter @iam/admin test:coverage`，确认覆盖率报告可生成且不会因全局覆盖率低失败。
- [x] 7.2 运行 `pnpm test`，确认根级测试会执行两个前端的实际 Vitest 任务并保持已有后端/shared/gateway 测试通过。
- [x] 7.3 运行 `pnpm e2e`，确认根级 E2E 会调度 `@iam/admin#e2e` 和 `@iam/sso#e2e`。
- [x] 7.4 运行 `pnpm --filter @iam/sso typecheck`、`pnpm --filter @iam/admin typecheck`、`pnpm --filter @iam/sso lint` 和 `pnpm --filter @iam/admin lint`，确认测试接入未破坏现有前端门禁。
- [x] 7.5 运行 `openspec status --change add-frontend-test-workflow`，确认变更达到 apply-ready 状态。
