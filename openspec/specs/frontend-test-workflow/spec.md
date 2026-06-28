# frontend-test-workflow Specification

## Purpose

描述 `apps/admin` 与 `apps/sso` 前端应用的自动化测试流程要求，覆盖 Vitest 单元/组件测试、MSW mock、Playwright mocked E2E、根级 Turborepo 编排、覆盖率报告和后续前端变更验收规则。

## Requirements

### Requirement: 前端应用提供可执行单测命令
`@iam/admin` 与 `@iam/sso` SHALL 在各自 `package.json` 中提供实际执行 Vitest 的 `test`、`test:watch` 和 `test:coverage` 脚本；这些脚本 MUST 不依赖根目录隐式测试依赖。

#### Scenario: 包级单测可执行
- **WHEN** 开发者运行 `pnpm --filter @iam/admin test` 或 `pnpm --filter @iam/sso test`
- **THEN** 对应前端应用 MUST 执行 `vitest run` 或等效 Vitest 单测命令
- **AND** 命令 MUST 不再是 Turborepo 中的 `<NONEXISTENT>` task

#### Scenario: 包级 watch 和 coverage 可执行
- **WHEN** 开发者运行 `pnpm --filter @iam/admin test:watch`、`pnpm --filter @iam/sso test:watch`、`pnpm --filter @iam/admin test:coverage` 或 `pnpm --filter @iam/sso test:coverage`
- **THEN** 对应前端应用 MUST 分别启动 Vitest watch 模式或生成覆盖率报告

### Requirement: 根级 test 覆盖前端单测
根目录 `pnpm test` SHALL 通过 Turborepo 覆盖 `@iam/admin` 与 `@iam/sso` 的实际 `test` 任务，并继续覆盖已有后端、shared 和 gateway 测试任务。

#### Scenario: 根级 test 调度前端 test
- **WHEN** 开发者在仓库根目录运行 `pnpm test`
- **THEN** Turborepo MUST 将 `@iam/admin#test` 和 `@iam/sso#test` 纳入执行范围
- **AND** 这两个 task MUST 运行实际 Vitest 命令

#### Scenario: 前端测试失败会导致根级 test 失败
- **WHEN** `@iam/admin` 或 `@iam/sso` 的 Vitest 用例失败
- **THEN** 根目录 `pnpm test` MUST 返回失败状态

### Requirement: 前端单测基建使用 app-local 配置和 mock
`@iam/admin` 与 `@iam/sso` SHALL 各自提供 app-local Vitest 配置、测试 setup、React Testing Library render helper、MSW node mock 和 Umi runtime mock；测试 setup MUST 集中处理 `jsdom` 缺失的浏览器 API。

#### Scenario: 测试工具目录存在
- **WHEN** 开发者查看 `apps/admin/test` 或 `apps/sso/test`
- **THEN** 对应目录 MUST 包含 setup、render helper、MSW server/handlers/fixtures 和 Umi runtime mock 的实现

#### Scenario: Umi runtime mock 集中维护
- **WHEN** 页面或组件测试需要控制 `@umijs/max` 的 `history`、`request`、`useModel` 或 `useAccess`
- **THEN** 测试 MUST 通过 app-local Umi runtime mock 统一控制这些行为
- **AND** 测试文件 SHOULD NOT 重复散落手写完整 `@umijs/max` mock

#### Scenario: 单测使用 MSW 拦截请求
- **WHEN** service 或组件单测触发 HTTP 请求
- **THEN** 测试 MUST 能通过 app-local MSW handlers 返回确定性响应
- **AND** 用例 MUST NOT 依赖真实 `localhost:30000` 或 `localhost:30001` 后端服务

### Requirement: 首批单测覆盖高风险前端边界
本变更 SHALL 为 `apps/sso` 和 `apps/admin` 补充首批高价值单测，优先覆盖纯逻辑、service 请求边界、错误处理和少量关键组件行为，而不是大页面 snapshot。

#### Scenario: SSO 高风险逻辑有单测覆盖
- **WHEN** 开发者运行 `pnpm --filter @iam/sso test`
- **THEN** 测试 MUST 覆盖 SSO 表单校验、SSO URL helper、登录凭证生成、人机校验封装、auth service 或登录页核心行为中的高风险逻辑

#### Scenario: Admin 基础前端边界有单测覆盖
- **WHEN** 开发者运行 `pnpm --filter @iam/admin test`
- **THEN** 测试 MUST 覆盖 admin 格式化工具、登录跳转/退出工具、user/client service wrapper 或轻量状态展示组件中的基础边界

### Requirement: 前端应用提供独立 mocked E2E 流程
`@iam/admin` 与 `@iam/sso` SHALL 使用 Playwright 提供独立 mocked E2E smoke 流程；E2E MUST 使用固定端口启动前端 dev server，并通过 Playwright route mock API 响应。

#### Scenario: 包级 E2E 可执行
- **WHEN** 开发者运行 `pnpm --filter @iam/admin e2e` 或 `pnpm --filter @iam/sso e2e`
- **THEN** Playwright MUST 启动或复用对应前端 dev server
- **AND** 测试 MUST 使用固定 base path 打开 `apps/admin` 的 `/iam-admin/...` 或 `apps/sso` 的 `/portal/...`

#### Scenario: E2E 不依赖真实后端
- **WHEN** Playwright mocked E2E 运行
- **THEN** 测试 MUST 通过 `page.route` 或等效 Playwright route 能力 mock API 响应
- **AND** 测试 MUST NOT 依赖真实 API、PostgreSQL、Redis、验证码服务或真实登录态

### Requirement: 根级 e2e 独立编排 mocked smoke
根目录 SHALL 提供独立 `pnpm e2e` 流程，通过 Turborepo 调度 `@iam/admin` 与 `@iam/sso` 的 E2E task；该流程 MUST 独立于根级 `pnpm test`。

#### Scenario: 根级 e2e 调度前端 E2E
- **WHEN** 开发者在仓库根目录运行 `pnpm e2e`
- **THEN** Turborepo MUST 将 `@iam/admin#e2e` 和 `@iam/sso#e2e` 纳入执行范围

#### Scenario: 根级 test 不运行 Playwright
- **WHEN** 开发者在仓库根目录运行 `pnpm test`
- **THEN** 命令 MUST NOT 启动 Playwright 浏览器测试或前端 E2E dev server

### Requirement: 首批 E2E smoke 覆盖关键页面可用性
本变更 SHALL 为 `apps/sso` 和 `apps/admin` 补充首批 mocked Playwright smoke，用于验证关键页面能够打开、核心交互可触发、请求契约可被前端消费。

#### Scenario: SSO mocked smoke 覆盖登录和重置密码
- **WHEN** 开发者运行 `pnpm --filter @iam/sso e2e`
- **THEN** Playwright MUST 覆盖 `/portal/login` 的登录成功或失败提示路径
- **AND** Playwright MUST 覆盖 `/portal/reset-password` 的基础表单与 mock 成功路径

#### Scenario: Admin mocked smoke 覆盖管理端壳子和客户端页
- **WHEN** 开发者运行 `pnpm --filter @iam/admin e2e`
- **THEN** Playwright MUST 覆盖 `/iam-admin/users` 的管理端 layout、菜单或用户列表基础可用性
- **AND** Playwright MUST 覆盖 `/iam-admin/clients` 的客户端列表和创建/编辑弹窗基础可用性

### Requirement: 覆盖率先报告后收紧
前端测试流程 SHALL 提供覆盖率报告能力；第一期 MUST NOT 设置导致当前前端全局覆盖率低而失败的硬阈值。

#### Scenario: 覆盖率报告可生成
- **WHEN** 开发者运行 `pnpm --filter @iam/admin test:coverage` 或 `pnpm --filter @iam/sso test:coverage`
- **THEN** 对应前端应用 MUST 生成覆盖率报告

#### Scenario: 第一阶段不因全局覆盖率低失败
- **WHEN** 第一阶段首批测试接入完成
- **THEN** 前端测试 MUST NOT 因历史未覆盖页面导致全局覆盖率低而失败

### Requirement: 前端变更验收规则包含测试分层
OpenSpec 或项目文档 SHALL 明确后续前端变更的测试验收规则：纯逻辑和 service/API 契约变更需要自动化测试，关键页面流程变更需要 mocked E2E 或明确豁免，纯视觉微调可使用 lint/build 或人工 smoke。

#### Scenario: 纯逻辑或 service 变更要求单测
- **WHEN** 一个后续 OpenSpec change 修改前端纯逻辑、请求封装、service wrapper 或 API 契约消费
- **THEN** 该 change 的任务 MUST 包含新增或更新对应 Vitest 测试，或记录明确的未自动化覆盖原因

#### Scenario: 关键页面流程变更要求 E2E 或豁免
- **WHEN** 一个后续 OpenSpec change 修改登录、重置密码、管理端核心 CRUD、客户端配置或其它关键页面流程
- **THEN** 该 change 的任务 MUST 包含新增或更新 mocked E2E smoke，或记录明确的未自动化覆盖原因

#### Scenario: 视觉微调不强制单测
- **WHEN** 一个后续 OpenSpec change 仅修改前端样式、布局或文案且不改变业务逻辑
- **THEN** 该 change MUST 至少运行相应 lint、build、截图 smoke 或人工 smoke 中的合理验证
- **AND** 该 change MUST NOT 被强制要求补充无业务断言价值的单测
