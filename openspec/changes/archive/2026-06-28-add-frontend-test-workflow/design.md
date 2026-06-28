## Context

本仓库的两个前端应用 `apps/admin` 与 `apps/sso` 均为 Umi Max + React 应用。当前它们已经有 `lint`、`typecheck`、`build` 与格式化流程，但没有 `test` 脚本、测试配置、测试目录或 E2E 配置；`turbo test` 会为前端生成 `<NONEXISTENT>` task，导致根级 `pnpm test` 不能证明前端实际被测试覆盖。

两个前端应用的风险形态不同：`apps/sso` 直接承载登录、重置密码、人机校验、SSO URL 和登录凭证生成等高风险流程；`apps/admin` 主要承载管理端页面、tRPC/REST service wrapper、表格与 modal 交互。测试流程需要同时覆盖两个应用，但首批测试深度应偏向 SSO，避免第一期范围膨胀。

## Goals / Non-Goals

**Goals:**

- 为 `@iam/admin` 和 `@iam/sso` 建立一致的前端单测、组件测试与 mocked E2E 基建。
- 让前端 `test` 任务进入根级 `pnpm test`，并确保 Turborepo 调度的是实际测试命令。
- 将 Playwright E2E 作为独立流程接入根级 `pnpm e2e`，避免拖慢轻量单测门禁。
- 以首批高价值测试覆盖 SSO 核心逻辑、admin 基础 service/组件边界和 4 条 mocked E2E smoke。
- 明确后续 OpenSpec 前端变更何时需要补单测、service 测试、E2E 或人工 smoke 说明。

**Non-Goals:**

- 不改变 `apps/admin` 或 `apps/sso` 的运行时业务行为、路由、视觉设计或 API 调用语义。
- 不在第一期引入真实后端依赖的 PR 级 E2E；真实链路只作为后续 integrated smoke。
- 不把测试工具抽成 workspace 共享包；第一期保持 app-local。
- 不在第一期设置全局覆盖率硬阈值。
- 不做大面积页面 snapshot，也不追求整页 AntD/ProComponents 深度渲染覆盖。

## Decisions

1. 使用 Vitest + React Testing Library + MSW 作为单测/组件测试基线。

   两个前端应用使用 Umi Max 4，但当前 `max test` 不可用，项目也没有 Jest 配置。Vitest 能以 app-local 配置方式接入现有 pnpm workspace，React Testing Library 负责用户视角组件断言，MSW 负责在单测环境中拦截 HTTP 请求。备选方案是使用 Umi/Jest 风格测试栈，但当前命令入口不可用且需要额外适配 workspace 依赖解析，因此不作为第一期方案。

2. Vitest 测试环境使用 `jsdom`。

   `apps/admin` 和 `apps/sso` 使用 Ant Design 与 Pro Components，DOM API 和事件行为兼容性比速度更重要。`happy-dom` 更快，但对复杂组件和浏览器 API 的兼容风险更高。第一期优先选择更稳的 `jsdom`。

3. 测试依赖放在两个前端应用自己的 `devDependencies` 中。

   `vitest`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom`、`@testing-library/user-event`、`msw`、`@playwright/test` 和 `cross-env` 应分别声明在 `apps/admin/package.json` 与 `apps/sso/package.json`。根目录只负责 `turbo` 编排。这样 `pnpm --filter @iam/sso test` 和 `pnpm --filter @iam/admin test` 不依赖根级隐式工具链。

4. 测试工具目录保持 app-local，暂不抽共享测试包。

   每个前端应用使用类似结构：

   ```text
   test/
     setup.ts
     render.tsx
     mocks/
       server.ts
       handlers.ts
       fixtures.ts
       umijs-max.ts
   e2e/
     *.spec.ts
   ```

   `admin` 与 `sso` 的接口面不同，过早抽象共享 mock 包会固化未验证的边界。第一期只统一目录和命名规则，等两个应用都积累稳定用例后再考虑抽 `packages/frontend-test-utils` 或 `packages/test-fixtures`。

5. 单测进入根级 `pnpm test`，E2E 独立进入 `pnpm e2e`。

   两个前端 package 必须提供实际 `test` 脚本，例如 `vitest run`，并被 `turbo test` 调度。Playwright E2E 需要启动浏览器和 dev server，成本更高，应通过独立 `e2e` task 运行，不混入常规 `pnpm test`。

6. Playwright mocked E2E 使用固定端口的 `max dev` 和 `page.route`。

   mocked E2E 以开发服务器运行前端，`admin` 固定打开 `/iam-admin/...`，`sso` 固定打开 `/portal/...`。端口通过 `cross-env PORT=<port> max dev` 固定，避免两个应用同时运行时抢端口。Playwright 使用 `page.route` mock API 响应，不在第一期注入 MSW browser worker，降低 service worker、base path 和静态资源路径复杂度。

7. 单测使用 MSW，E2E 使用 Playwright route，各司其职。

   单测/组件测试使用 MSW node server，便于验证 service wrapper、组件请求和错误处理。Playwright E2E 使用 `page.route` 精确控制每个浏览器场景的接口响应。两套 mock 共享 fixture 命名习惯，但不强制共享实现。

8. Umi runtime mock 集中维护。

   页面/组件测试中涉及 `@umijs/max` 的 `history`、`request`、`useModel`、`useAccess` 等 runtime API 时，应集中在 `test/mocks/umijs-max.ts` 维护。业务测试文件不应散落手写 `vi.mock("@umijs/max", ...)`，避免后续 Umi 升级或 mock 行为调整时多处修改。

9. 首批单测优先覆盖业务边界，不做大页面 snapshot。

   `apps/sso` 首批优先覆盖 `form-check`、`sso` URL helper、`login-credential`、`human-verification`、`auth` service 和登录页核心行为。`apps/admin` 首批优先覆盖 `format`、`auth`、`user`/`client` service wrapper 与 `StatusTag` 等轻量组件。复杂页面的完整流程放在 Playwright mocked smoke 或后续迭代中。

10. 第一阶段只生成覆盖率报告，不设置全局硬阈值。

   当前前端自动化测试覆盖为零，第一期直接设置全局硬阈值容易鼓励低价值覆盖率测试。应先提供 `test:coverage` 报告，让覆盖现状可见；后续可对 `src/lib`、`src/utils`、`src/services` 逐步设置局部阈值。

11. E2E 分为 mocked PR smoke 与后续 integrated smoke。

   第一阶段 `pnpm e2e` 只运行 mocked smoke，不依赖真实 API、PostgreSQL、Redis、验证码或登录态。真实后端联调应作为后续 `e2e:integrated`、发布前检查或 nightly 流程设计，避免让 PR 级 E2E 变得脆弱和昂贵。

12. fixtures 类型对齐前端 service 类型与 contracts，但数据 app-local 显式维护。

   fixtures 可以使用 `satisfies` 对齐 `UserVo`、`ClientVo` 等前端 service 类型和 `@iam/contracts` 枚举；不应运行时导入后端测试 fake 或数据库 fixture。前端测试 fixture 表达的是 UI 契约，不复制后端测试世界。

## Risks / Trade-offs

- [Risk] 引入两个前端各自的测试依赖会让 `package.json` 变长。-> Mitigation: 依赖 app-local 能保持过滤执行稳定，pnpm store 会复用实际包内容。
- [Risk] AntD/ProComponents 在 `jsdom` 中仍可能需要补充浏览器 API mock。-> Mitigation: 在 `test/setup.ts` 集中维护 `ResizeObserver`、`matchMedia`、`scrollTo` 等缺失 API，不把兼容 mock 散落到用例中。
- [Risk] Playwright mocked E2E 与真实后端行为可能漂移。-> Mitigation: fixtures 使用前端 service 类型和 contracts 约束，后续再补 integrated smoke 覆盖真实链路。
- [Risk] 第一阶段不设覆盖率阈值可能导致覆盖增长缓慢。-> Mitigation: OpenSpec/PR 规则要求前端业务逻辑或关键流程变更必须补自动化测试或说明豁免原因。
- [Risk] `max dev` 启动时间会影响 E2E 速度。-> Mitigation: E2E 独立于根级 `pnpm test`，本地允许 `reuseExistingServer`，CI 可按路径变更选择性运行。

## Migration Plan

1. 在 `apps/admin` 和 `apps/sso` 增加测试依赖、Vitest 配置、测试 setup、MSW mock 和 app-local render helper。
2. 增加前端 `test`、`test:watch`、`test:coverage`、`dev:e2e`、`e2e` 和 `e2e:ui` 脚本。
3. 在根目录增加 `e2e` 编排，并在 `turbo.json` 增加 `e2e` task。
4. 补充首批单测与 4 条 mocked Playwright smoke。
5. 更新 README、AGENTS.md 或相邻测试文档，说明前端测试命令和 OpenSpec 验收规则。
6. 运行 `pnpm --filter @iam/admin test`、`pnpm --filter @iam/sso test`、`pnpm test`、`pnpm --filter @iam/admin e2e`、`pnpm --filter @iam/sso e2e` 和 `pnpm e2e` 验证接入。

## Open Questions

无。当前设计决策已在探索阶段确认，后续实现若遇到 Umi/AntD 环境兼容问题，应优先通过测试 setup 局部处理，不扩大为运行时重构。
