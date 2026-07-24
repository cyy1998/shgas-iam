# 09 — 迁移 SSO 至 React 19 与 Ant Design 6

**What to build:** 让用户在 React 19、Ant Design 6 和当前 Umi stack 上继续完成登录、验证码、密码重置、用户信息和维护页流程，同时移除 SSO 从未使用的 ProComponents 依赖。

**Blocked by:** 07 — 升级 OIDC 与密码安全依赖.

**Status:** resolved

- [x] SSO 的 React 与 React DOM 更新到 19.2.7，对应类型更新到 19.2.17/19.2.3，Ant Design 更新到 6.5.1。
- [x] SSO 的 Umi Max 更新到 4.6.79、icons 更新到 6.3.2、cssinjs 更新到 2.1.2、cap-widget 更新到 0.1.56。
- [x] SSO 删除 `@ant-design/pro-components` 直接依赖，并证明生产源码没有该包 import 或运行时需求。
- [x] workspace peer policy 只为迁移窗口显式允许 React 18/19 共存，使尚未迁移的 Admin 仍保持绿色；该临时扩展被标记为最终收敛项。
- [x] SSO 的 unit tests、coverage、lint、typecheck 和 production build 通过，没有 React/Ant Design deprecated API、hydration 或 CSS-in-JS warning。
- [x] 浏览器 smoke 覆盖登录、验证码、密码重置、用户信息和维护页，并在桌面与窄屏检查依赖内部 `.ant-*` 结构的现有 Less 样式。
- [x] SSO Playwright 流程通过，业务路由、认证 contract、页面文案和可观察交互保持不变。
- [x] frozen-lockfile 安装和 diff check 通过，没有手工修改生成目录。

## Resolution

- Final squash commit: `fbfe426807fc576ade42e554b734b1b47c572cf8`
- Implementation commit: `996ba7e2`
- Validation:
  - `pnpm install --frozen-lockfile` — passed with pnpm 11.14.0.
  - `pnpm --filter @iam/sso test:coverage` — 6 files / 15 tests passed with Vitest 4.1.10 and V8 coverage.
  - `pnpm --filter @iam/sso lint` — passed with 0 errors; 4 pre-existing warnings remain.
  - `pnpm --filter @iam/sso typecheck` — passed.
  - `pnpm --filter @iam/sso build` — passed with Umi 4.6.79.
  - `pnpm --filter @iam/sso e2e` — 2 Playwright Chromium flows passed.
  - `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm typecheck` — all workspace tasks passed; lint has 0 errors.
  - Browser smoke — login/password and SMS, reset password, user info, and maintenance rendered at 1280×720 and 390×844 without horizontal overflow; clean-console巡检有 0 条 warning/error，验证码控件桌面/窄屏宽度保持 124px/112px。
  - SSO source/import audit — no `@ant-design/pro-components`, deprecated `addonAfter`, `maskClosable`, or legacy `.ant-input-group*` usage remains. Umi still owns a transitive `@ant-design/pro-components@2.8.10`; SSO has no direct dependency or production import.
  - `git diff --check` — passed.
- Review: Standards and Spec review passed with no unresolved findings.
