# 10 — 迁移 Admin 至 React 19、Ant Design 6 与 ProComponents 3

**What to build:** 让管理员在 React 19、Ant Design 6 和 ProComponents 3 上继续使用完整管理界面，包括布局、导航、列表搜索、表单、抽屉和审计日志，并保持现有业务与视觉意图。

**Blocked by:** 09 — 迁移 SSO 至 React 19 与 Ant Design 6.

**Status:** resolved

- [x] Admin 的 React 与 React DOM 更新到 19.2.7，对应类型更新到 19.2.17/19.2.3，Ant Design 更新到 6.5.1。
- [x] Admin 的 Umi Max 更新到 4.6.79、icons 更新到 6.3.2，`@ant-design/pro-components` 精确固定到 3.1.14-2。
- [x] ProComponents v3 官方 removed-API 清单已完整扫描；现有六处 `hideInSearch` 已迁移为等价搜索配置，且没有通过类型忽略或 compatibility wrapper 保留 v2 API。
- [x] React 19 removed/deprecated API 静态扫描通过，现代 JSX transform 生效，第三方组件没有 React internals 或 ref 兼容错误。
- [x] Admin 的 unit tests、coverage、lint、typecheck 和 production build 通过，没有 React、Ant Design、ProComponents 或 CSS-in-JS console warning。
- [x] 浏览器 smoke 覆盖应用布局和导航、至少一个 ProTable 搜索/分页页面、ModalForm、详情 Drawer/ProDescriptions 及审计日志搜索列行为。
- [x] 用户、任职、组织、岗位、角色、client 和审计相关关键流程通过现有 Playwright 或明确记录的人工验证，外部 API 和业务行为不变。
- [x] 大量 `.ant-*`/`.ant-pro-*` 自定义选择器经过桌面与窄屏视觉检查，组件 DOM 变化没有造成未处理的布局、主题或交互回归。
- [x] frozen-lockfile 安装和 diff check 通过，没有手工修改 Umi 生成目录。

## Resolution

- Implementation commit: `cfb99af5`.
- Admin resolves React/DOM 19.2.7, React types 19.2.17/19.2.3, Ant Design 6.5.1, Umi 4.6.79, icons 6.3.2, and exact ProComponents 3.1.14-2; workspace peer policy is React 19 only.
- Official ProComponents v3 and React 19 removed/deprecated API scans passed. Six `hideInSearch` columns moved to `search`, custom form fields moved to `formItemRender`, and Ant Design 6 Modal/Drawer/Card/Space props were migrated without type ignores or compatibility wrappers.
- `pnpm --filter @iam/admin test:coverage` passed 9 files / 19 tests; Admin lint, typecheck, production build, and two Playwright Chromium flows passed. Lint has 0 errors and retains 25 pre-existing warnings.
- Browser smoke covered users, employments, organizations, positions, roles, clients, and audit logs at 1280×720 and 390×844. ProTable search/pagination, ModalForm, user/audit Drawer and ProDescriptions, and all expanded audit search fields rendered; narrow tables scroll internally with no document overflow; final console warning/error count is 0.
- `pnpm install --frozen-lockfile`, `pnpm peers check`, `git diff --check`, full workspace test/lint/typecheck (14/14), and build (2/2) passed. No `.umi`, `.umi-production`, or `dist` diff was committed.
- The exact `sass@1.101.0` workspace override is a frontend-tooling compatibility seam: without it pnpm resolves Umi's Sass 1.54.0 and `pnpm peers check` fails the `vite@8.1.5` peer requirement of `^1.70.0`; the override is validated by both Umi/Webpack production builds and the Vitest 4 suite.
- Final feature-review follow-up commit `f0d1ef74` documented that seam and removed the shared Stylelint `no-descending-specificity` suppression by fixing the affected Admin/SSO selector order.
- Standards and Spec reviews completed with zero findings. Umi 4.6.79 still owns hard-pinned tooling nodes for ProComponents 2/Ant Design 4/React 18; Admin has no direct dependency on those versions, and final graph convergence is tracked by ticket 11.
