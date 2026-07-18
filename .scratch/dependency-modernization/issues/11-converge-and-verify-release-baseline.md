# 11 — 收敛锁文件并验证发布基线

**What to build:** 把所有依赖 tickets 收敛为一个可复现、可发布的仓库基线，删除迁移期兼容配置，证明全部直接依赖均达到规格目标或具有唯一、明确的 Node 24 例外。

**Blocked by:** 08 — 升级 CSV 导入与 MySQL client; 10 — 迁移 Admin 至 React 19、Ant Design 6 与 ProComponents 3.

**Status:** resolved

- [x] 15 份 manifest 中的全部外部直接依赖逐项对照规格目标完成审计，同名依赖在 workspaces 间一致，内部 `workspace:*` contract 未改变。
- [x] React 18/19 临时 peer allowance 已收缩为 React 19，旧 pnpm release-age/version 例外和所有 native preview/legacy lint 残留已删除。
- [x] `@types/node` 保持 24.13.2 并作为 Node 24 的唯一 registry-latest 例外；Node 24 与 Bun runtime pin 均未被本功能改变。
- [x] pnpm 11.14.0 生成最终唯一锁文件，普通安装与 frozen-lockfile 安装都通过，解析树没有业务 app 使用的旧 React/Ant Design/ProComponents major。
- [x] 全仓 lint、typecheck、test、build、文档检查和 diff check 通过。
- [x] Admin 与 SSO 的 Playwright/浏览器 smoke 通过，console 和视觉证据覆盖规格定义的关键用户流程。
- [x] production dependency audit 已执行并记录；任何无法在本规格内安全解决的传递风险均有清晰说明，没有静默忽略。
- [x] direct-dependency outdated 审计只包含规格允许的 Node 类型例外及已解释的 alias/beta tag 语义，不存在未确认的过期直接依赖。
- [x] 所有容器和开发文档中的 pnpm 版本审计一致，目标 Node 24 环境能解析并运行 pnpm 11.14.0。
- [x] Standards 与 Spec 双轴 review 完成，未发现宽泛 lint suppression、测试弱化、外部 contract/schema 变化或缺失验证证据。

## Validation record

- `pnpm --registry=https://registry.npmjs.org audit --prod --json` reports 48 upstream advisories: 1 critical, 16 high, 25 moderate, and 6 low. The configured npmmirror registry has no audit endpoint, so the explicit npm registry is required for a real result.
- Every finding is below `@umijs/max@4.6.79`: `@babel/core` (1), `@babel/runtime` (1), `axios` (21), `elliptic` (1), `esbuild` (1), `immer` (2), `node-fetch` (1), `path-to-regexp` (3), `react-router` (1), `send` (1), and `vite` (15). Umi is already at the approved/current direct target.
- Vite, esbuild, Babel, and related server findings belong to Umi's build/dev-server adapters; the applications build with Webpack and those version strings are absent from the production bundles. They still require developers not to expose Umi development servers to untrusted networks.
- Umi's request/DVA plugin graph is not uniformly tool-only: `axios@0.27.2` is imported by generated request code and its version string is present in both production bundles; `node-fetch@1.7.3` is also present in a production bundle. These remain explicit upstream risks rather than being described as unreachable.
- Removing the findings would require cross-major transitive overrides, promoting transitive packages to direct dependencies, replacing Umi's generated request/DVA behavior, or migrating its bundler adapters. Those actions are excluded by the approved amendment and Out of Scope. The attempted audit-only overrides were removed; compatible transitive versions refreshed naturally by pnpm remain in the lockfile.
- `pnpm dedupe --check` proposes only a downgrade from patched `path-to-regexp@1.9.0` to vulnerable `1.7.0`; that downgrade was intentionally not applied.

## Resolution

- Final squash commit: `pending`.
- Implementation commit: `b3f32fb6`.
- Final feature-review follow-up commit: `f0d1ef74`.
- All 15 manifests were audited. Shared external dependency declarations are consistent, internal `workspace:*` contracts are unchanged, and `pnpm outdated -r --format json` reports only the approved Node 24 exception: `@types/node@24.13.2` versus registry latest 26.1.1.
- pnpm 11.14.0 completed normal and frozen-lockfile installs against the single lockfile. `pnpm peers check` reports no issues; every version-controlled pnpm pin is 11.14.0, while Node 24 and Bun runtime pins are unchanged.
- The obsolete `@eslint-react/*@5.17.1` release-age exclusions were removed. Transitive changes refreshed naturally through pnpm; no audit-only or cross-major override remains. Admin directly resolves React/DOM 19.2.7, Ant Design 6.5.1, and ProComponents 3.1.14-2; SSO directly resolves React/DOM 19.2.7 and Ant Design 6.5.1 without ProComponents.
- The exact `sass@1.101.0` override is retained only as the documented Umi/Vitest compatibility seam: removing it resolves Sass 1.54.0 and makes `pnpm peers check` fail Vite 8's `^1.70.0` peer. Umi/Webpack builds and Vitest 4 validate the shared target.
- The feature-level review removed the shared `no-descending-specificity` suppression and fixed all six resulting Admin/SSO selector-order diagnostics; full Stylelint now passes with the rule enabled.
- `pnpm lint`, `pnpm typecheck`, and `pnpm test` passed all 14 workspaces; lint has 0 errors and retains 25 Admin plus 4 SSO pre-existing warnings. `pnpm build` passed both frontend builds, `pnpm check:docs` passed 28 indexed documents, and `git diff --check` passed.
- Admin and SSO Playwright each passed 2 Chromium flows. Final browser smoke verified the Admin permission page and SSO password-reset page at desktop and 390×844; neither page overflowed horizontally and final console warning/error counts were zero. The broader ticket 09/10 browser evidence covers the remaining specified user flows and migrated component surfaces.
- The official-registry production audit and all unresolved Umi-owned upstream risks are recorded above. Final feature-level Standards and Spec reviews completed with zero findings after removing the out-of-scope overrides, correcting current-stack documentation, and resolving all follow-up lint findings.
