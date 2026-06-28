## Why

当前 `apps/admin` 和 `apps/sso` 已接入 lint、typecheck 和 build，但没有实质性的前端单元测试或 E2E 测试流程；根级 `pnpm test` 会通过 Turborepo 调度，却无法证明两个前端应用被测试覆盖。随着 SSO 登录、admin 管理页和跨包契约持续演进，需要建立稳定、可重复、分层的前端自动化测试门禁，减少页面流程、请求契约和关键交互回归。

## What Changes

- 为 `@iam/admin` 和 `@iam/sso` 引入 Vitest + React Testing Library + MSW 的单元/组件测试基建。
- 为 `@iam/admin` 和 `@iam/sso` 引入 Playwright mocked E2E smoke 基建。
- 让前端单测进入根级 `pnpm test` / `turbo test`，消除 `<NONEXISTENT>` 前端 test task 的假阳性。
- 新增独立根级 `pnpm e2e` / `turbo e2e` 流程，用于运行 mocked Playwright smoke，不混入轻量单测门禁。
- 为两个前端补充首批高价值单测与 4 条 mocked E2E smoke，优先覆盖 SSO 登录相关逻辑和 admin 基础页面壳子。
- 文档化后续 OpenSpec 前端变更的测试验收规则，包括何时需要单测、service 测试、E2E 或人工 smoke 说明。

## Capabilities

### New Capabilities

- `frontend-test-workflow`: 覆盖前端单测、组件测试、mocked E2E、根级测试编排、覆盖率报告和后续前端变更验收规则。

### Modified Capabilities

- 无。

## Impact

- 影响 `apps/admin` 和 `apps/sso` 的 `package.json`、测试配置、测试工具目录、首批测试用例和 Playwright 配置。
- 影响根目录 `package.json` 和 `turbo.json` 的测试/E2E 编排。
- 新增前端测试相关 devDependencies，例如 `vitest`、`jsdom`、`@testing-library/*`、`msw`、`@playwright/test` 和 `cross-env`。
- 影响 README、AGENTS.md 或相邻前端测试文档中的测试命令与验收说明。
- 不改变前端运行时业务行为、REST/tRPC API 契约、后端服务逻辑或数据库 schema。
