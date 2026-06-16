## Context

本仓库根目录 `pnpm lint` 通过 Turborepo 执行各 workspace 的 `lint` 任务。`apps/admin` 与 `apps/sso` 是 Umi Max + React 前端应用，目前存在 `.eslintrc.js` 与 Prettier 配置，但 `package.json` 未暴露 `lint` / `lint:fix` 脚本，因此不会被 `turbo lint` 覆盖。

两个前端应用继承 `@umijs/max/eslint`，该配置链路与 Umi Max 4 自带的 ESLint 8、Stylelint 14 兼容。后端和 shared 包已经使用较新的 ESLint flat config 体系，本变更不要求前端同步该版本体系，避免把“接入 lint”扩大为前端 lint 架构迁移。

## Goals / Non-Goals

**Goals:**

- 让 `@iam/admin` 与 `@iam/sso` 提供完整 `lint` 与 `lint:fix` 命令。
- 让根目录 `pnpm lint` 能覆盖两个前端应用，并在当前代码上通过。
- 修复现有 Umi Max lint 暴露出的 Less、TypeScript、React 规范问题。
- 明确前端 lint 依赖边界，避免被后端/shared 包的 ESLint 版本影响。

**Non-Goals:**

- 不将前端迁移到 ESLint flat config。
- 不统一全仓 ESLint 版本。
- 不改变前端页面视觉设计、业务流程、API 调用或路由行为。
- 不借机重构前端目录结构或替换 Umi Max lint 体系。

## Decisions

1. 使用包级 `eslint` 与 `stylelint` 脚本作为完整前端 lint 入口。

   两个前端应用已经有 `.eslintrc.js` 与 `.stylelintrc.js`，分别继承 `@umijs/max/eslint` 与 `@umijs/max/stylelint`。实施中发现 Umi 的 `max lint` 包装器会从 `@umijs/lint` 的虚拟仓库路径向上解析到后端/shared 使用的 ESLint 10，导致 `.eslintrc.js` 项目报 flat config 缺失错误。因此 lint 脚本直接调用包级 `eslint` 与 `stylelint` 二进制，并通过现有 Umi Max 配置获得同一套规则。

   备选方案是继续使用 `max lint`。该方案符合 Umi 命令习惯，但在当前 pnpm workspace 解析路径下不稳定，因此不采用。

2. 在 `apps/admin` 与 `apps/sso` 内显式声明 Umi Max 兼容 lint 依赖。

   两个前端应用应显式依赖 `eslint@8.35.0` 与 `stylelint@14.8.2`，匹配当前 `@umijs/max@4.6.58` 依赖范围，避免命令解析到后端/shared 包使用的 ESLint 10。这样前端脚本可以继续使用 `.eslintrc.js` 与 `.stylelintrc.js`，不触发 flat config 缺失错误。

   备选方案是迁移前端到 ESLint 10 flat config。该方案范围更大，需要重写 Umi Max 继承配置和插件兼容性验证，不符合本次“不需要同步 ESLint 版本”的约束。

3. 修复样式 lint 错误优先保留运行时视觉与浏览器兼容性。

   `alpha-value-notation` 这类机械样式问题应直接改为规则要求的表达方式。对 `-webkit-backdrop-filter`、`-webkit-sticky` 等 vendor prefix 问题，应先判断是否已有无前缀声明或是否仍需兼容 Safari；若确实需要保留前缀，应通过最小范围的 Stylelint 配置或局部忽略表达意图，而不是删除必要兼容代码。

4. 验证以包级 lint 和根 lint 为准。

   实施完成后必须至少运行 `pnpm --filter @iam/admin lint`、`pnpm --filter @iam/sso lint` 与根目录 `pnpm lint`。若 lint 修复触及样式兼容逻辑，再运行相应前端 `typecheck` 或 `build` 作为补充验证。

## Risks / Trade-offs

- [Risk] 前端显式固定 ESLint 8 会让仓库同时保留 ESLint 8 与 ESLint 10。 → Mitigation: 这是 Umi Max 4 与后端/shared lint 体系并存的有意边界，后续若升级 Umi 或迁移 flat config 再统一处理。
- [Risk] 删除 vendor prefix 可能影响部分浏览器视觉效果。 → Mitigation: 实施时优先检查相邻无前缀声明；必要时通过 Stylelint 规则例外保留兼容声明。
- [Risk] `lint:fix` 自动修复可能带来较多样式 diff。 → Mitigation: 先运行并审阅 diff，确认只包含 lint 相关格式或等价表达变化。
- [Risk] 接入后根 `pnpm lint` 时间增加。 → Mitigation: Turborepo 会缓存 lint 任务，且完整覆盖前端是本变更目标。
