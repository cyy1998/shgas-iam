# Modernize Repository Dependencies and Toolchain

**Status:** approved

**Created:** 2026-07-18

**Approved:** 2026-07-18

## Problem Statement

IAM monorepo 目前有 15 份 package manifest。以 2026-07-18 的 npm 官方 registry 为基线，`pnpm outdated -r` 报告 34 个唯一的过期直接依赖；仓库还把 pnpm 11.5.0 固定在根 manifest、容器构建和开发文档等多个入口。维护者希望更新全部可更新的直接依赖与 pnpm 本身，重新生成一致的锁文件，并保持现有业务、外部 contract、数据库 schema、构建产物和用户流程不变。

这些更新不能作为一次无差别的版本替换处理。React 18、Ant Design 5 和 ProComponents 2 必须作为一个兼容性集合迁移；npm 的 `latest` 标签仍把 `@ant-design/pro-components` 指向不支持 Ant Design 6 的 2.8.10，真正兼容的版本位于 v3 beta。Vitest 从 0.34.6 跳到 4.1.10，跨越 v1、v2、v3、v4 的配置、mock、pool、hook、coverage 和 Vite peer 变化。ESLint 10 已移除 `.eslintrc`，而 Umi Max 当前内置的前端 lint preset 仍面向 ESLint 8 与 Stylelint 14。TypeScript 7.0 已稳定发布，但不再提供编译器 API，ESLint 等工具仍需要 TypeScript 6 API。

“全部更新”还需要有明确例外。仓库运行时继续固定 Node 24，因此 `@types/node` 不能仅因 registry 最新版本为 26 就跨到 Node 26 类型；Node 与 Bun 本身也不属于本次 package dependency 和 pnpm 更新。内部 `workspace:*` 依赖不是外部版本升级目标。锁文件中的传递依赖由目标 pnpm 重新解析，但本次不人为把每个传递依赖提升为新的直接依赖。

## Solution

采用可回滚的分批升级，把 package manager、低风险依赖、后端 breaking changes、测试工具链、静态检查工具链、TypeScript 工具链和前端平台分别迁移并验证。每一批只处理该批兼容性问题，在通过聚焦验证后才进入下一批；最终使用 pnpm 11.14.0 生成唯一锁文件并运行全仓验证。

版本目标冻结为 2026-07-18 的 npm 官方 registry 快照。以下常规更新保留现有 dependency/devDependency 归属和 manifest 的 range 风格，锁文件解析到表中目标版本：

| Package | Current | Target |
| --- | ---: | ---: |
| `@ant-design/icons` | 6.2.5 | 6.3.2 |
| `@antfu/eslint-config` | 9.0.0 | 9.1.0 |
| `@bull-board/api` | 8.0.2 | 8.1.2 |
| `@bull-board/hono` | 8.0.2 | 8.1.2 |
| `@hono/zod-openapi` | 1.4.0 | 1.5.1 |
| `@trpc/client` | 11.17.0 | 11.18.0 |
| `@trpc/server` | 11.17.0 | 11.18.0 |
| `@umijs/max` | 4.6.58 | 4.6.79 |
| `bullmq` | 5.79.2 | 5.80.6 |
| `cap-widget` | 0.1.53 | 0.1.56 |
| `hono` | 4.12.23 | 4.12.30 |
| `ioredis` | 5.11.0 | 5.11.1 |
| `msw` | 2.14.6 | 2.15.0 |
| `mysql2` | 3.22.4 | 3.23.0 |
| `oidc-provider` | 9.8.4 | 9.9.1 |
| `prettier` | 3.8.3 | 3.9.5 |
| `tsx` | 4.22.4 | 4.23.1 |
| `turbo` | 2.9.16 | 2.10.5 |

以下目标涉及 major、0.x breaking-risk 或强耦合 peer dependency，必须在对应迁移批次中连同配置和调用代码一起处理：

| Package | Current | Target |
| --- | ---: | ---: |
| `@ant-design/cssinjs` | 1.24.0 | 2.1.2 |
| `@types/react` | 18.3.30 | 19.2.17 |
| `@types/react-dom` | 18.3.7 | 19.2.3 |
| `@vitest/coverage-v8` | 0.34.6 | 4.1.10 |
| `antd` | 5.29.3 | 6.5.1 |
| `bcrypt-ts` | 8.0.1 | 9.0.1 |
| `csv-parse` | 6.2.1 | 7.0.1 |
| `eslint` | 8.35.0 / 10.4.1 | 10.7.0 |
| `react` | 18.3.1 | 19.2.7 |
| `react-dom` | 18.3.1 | 19.2.7 |
| `stylelint` | 14.8.2 | 17.14.0 |
| `@scalar/hono-api-reference` | 0.10.20 | 0.11.11 |
| `vitest` | 0.34.6 | 4.1.10 |

下列是完成兼容迁移所需的特殊动作，而不是简单采用 `latest` 标签：

- pnpm 从 11.5.0 更新到 11.14.0，并同步所有受版本控制的 package-manager pin、容器安装入口、使用说明和技术栈记录。
- Admin 使用的 `@ant-design/pro-components` 从 2.8.10 系列更新并精确固定到 `3.1.14-2`；这是当前兼容 Ant Design 6 的 beta 目标。SSO 未使用该包，直接删除其声明。
- 删除 `@typescript/native-preview`。类型检查改用稳定 TypeScript 7.0.2，并以 `@typescript/native` npm alias 暴露稳定 `tsc`；同时让名为 `typescript` 的依赖指向 `@typescript/typescript6@6.0.2`，继续为 typescript-eslint、编辑器集成和其他需要编译器 API 的工具提供官方兼容层。
- 前端从 Umi 的旧 ESLint/Stylelint preset 迁移到当前显式配置。ESLint 使用 `@antfu/eslint-config` 9.1.0 的 flat config；Stylelint 使用 `stylelint-config-standard` 40.0.0 和 `postcss-less` 6.0.0 支持现有 Less。Prettier 继续拥有格式化职责，Stylelint 不重新启用已移除的 stylistic rules。
- `@types/node` 保持 24.13.2，直到仓库运行时从 Node 24 升级；它是最终 outdated 审计中的允许例外，不是遗漏项。

## User Stories

1. 作为仓库维护者，我希望所有外部直接依赖都有明确的目标版本或书面例外，以便“全部更新”可以被审计而不是凭感觉判断。
2. 作为仓库维护者，我希望根目录和全部 workspaces 对同名依赖采用一致目标，以便不会因 manifest 漂移加载不同 API 或类型。
3. 作为开发者，我希望本机、CI 和容器统一使用 pnpm 11.14.0，以便安装行为和锁文件解释保持一致。
4. 作为发布维护者，我希望冻结锁文件安装成功，以便部署不会在发布时重新解析出未经验证的依赖树。
5. 作为后端维护者，我希望 Hono、OpenAPI、tRPC、Redis、MySQL、OIDC、queue 和 worker 依赖更新后现有请求与任务行为不变，以便升级不改变业务 contract。
6. 作为身份认证维护者，我希望 `bcrypt-ts` 9 继续验证现有密码散列并生成可验证的新散列，以便用户登录和密码变更不会失效。
7. 作为导入流程维护者，我希望 `csv-parse` 7 继续接受和拒绝与当前规则相同的 CSV 输入，以便批量导入语义不漂移。
8. 作为 API 使用者，我希望 Scalar、OpenAPI 和 Swagger 入口继续可访问并展示有效 schema，以便依赖升级不破坏 API 自助文档。
9. 作为测试维护者，我希望 Vitest 4.1.10 与 coverage provider 精确对齐，以便测试和覆盖率不会因 runner/provider 混版而失真。
10. 作为测试维护者，我希望现有 Vitest 测试的 mock、hook、fake timer、pool 和环境隔离语义在迁移后仍被验证，以便跨四个大版本不会静默改变测试含义。
11. 作为前端维护者，我希望 React、React DOM 和类型包统一到 19.2 系列，以便运行时与 TypeScript 声明不会错配。
12. 作为 Admin 用户，我希望列表、搜索、表单、详情抽屉、弹窗和布局在 Ant Design 6 与 ProComponents 3 上保持原有功能，以便升级对管理操作透明。
13. 作为 SSO 用户，我希望登录、验证码、重置密码、用户信息和系统维护页面在 React 19 与 Ant Design 6 上保持原有流程，以便认证入口不中断。
14. 作为视觉维护者，我希望依赖 Ant Design/ProComponents 内部 DOM class 的现有 Less 样式被逐页检查，以便组件 DOM 调整不会造成无提示的布局或主题回归。
15. 作为 Admin 维护者，我希望 ProComponents 2 中已移除的 API 被迁移到 v3 等价 API，以便不通过 `any`、类型忽略或兼容 wrapper 掩盖问题。
16. 作为 SSO 维护者，我希望删除完全未使用的 ProComponents 声明，以便 SSO 不承担 beta UI 依赖和额外 bundle 风险。
17. 作为 lint 维护者，我希望 ESLint 10 使用受支持的 flat config，以便不依赖已经被删除的 `.eslintrc` 兼容模式。
18. 作为样式维护者，我希望 Stylelint 17 能解析现有 Less 并只承担代码质量检查，以便格式化继续由 Prettier 单一负责。
19. 作为开发者，我希望 lint 规则迁移后真实问题被修复或有明确说明，以便通过批量 disable 获得绿灯不会掩盖缺陷。
20. 作为 TypeScript 维护者，我希望稳定 TypeScript 7 执行全仓类型检查，以便不再依赖每日变化的 native preview 包。
21. 作为工具链维护者，我希望仍需编译器 API 的工具获得官方 TypeScript 6 兼容包，以便升级 TS7 不破坏 ESLint、插件或编辑器工作流。
22. 作为 Node 服务维护者，我希望 Node 类型保持在 24.x 运行时边界，以便代码不会在类型层面误用 Node 26 才存在的 API。
23. 作为 package 维护者，我希望每个高风险升级都在最接近其可观察行为的 seam 上验证，以便失败可以定位到单个升级批次。
24. 作为代码审查者，我希望依赖更新与必要兼容代码分批提交，以便可以独立评审、定位回归并回滚。
25. 作为安全维护者，我希望最终记录 production dependency audit 结果，以便已知风险不会被锁文件变化悄悄带入。
26. 作为文档维护者，我希望所有可见的 pnpm 版本和开发命令与实际配置一致，以便新开发环境不会安装旧 package manager。
27. 作为仓库维护者，我希望过时的版本专用 pnpm 例外在升级后被清理或重新证明必要，以便配置不会保留失效的历史补丁。
28. 作为业务负责人，我希望本次升级不改变 IAM 领域规则、数据库 schema、HTTP/tRPC/OIDC contract 或持久化数据，以便依赖现代化可以独立发布。
29. 作为未来维护者，我希望最终 outdated 报告只剩有理由的 Node 24 类型例外，以便下一次升级有清晰基线。
30. 作为发布维护者，我希望完整 lint、typecheck、test、build、前端 smoke 和冻结安装均通过，以便可以把升级结果作为一个可发布依赖基线。

## Implementation Decisions

- 目标版本以本规格列出的 2026-07-18 registry 快照为准；实施期间即使 registry 发布更新版本，也不静默追随。改变目标需要先修订规格。
- 升级按 package manager、常规依赖、后端 breaking-risk、Vitest、ESLint/Stylelint、TypeScript、React/Ant Design/ProComponents、全仓收敛的顺序实施。
- pnpm 11.14.0 先落地，后续所有 manifest 与 lockfile 操作都使用该版本。所有受版本控制的 pnpm pin 必须一致，版本专用例外不得继续引用已淘汰目标。
- 同一直接依赖在多个 workspace 出现时一次性对齐到相同目标，不允许把某个 workspace 永久留在旧版本作为无记录的兼容层。
- 常规更新仍需运行受影响 package 的测试、lint 与 typecheck；“minor/patch”不作为跳过验证的理由。
- `bcrypt-ts`、`csv-parse` 和 `@scalar/hono-api-reference` 分别按密码、导入和 API 文档行为迁移。只修改适配新 API 所需代码，不顺带重构所属模块。
- Vitest 与 `@vitest/coverage-v8` 精确固定在同一个 4.1.10 版本，并作为独立批次迁移。Vitest 自带的现代 Vite 只服务测试 runner，不推动 Umi 构建链的一般性替换。
- ESLint 10 不使用 legacy compatibility mode。后端和根配置延续现有 Antfu 规则意图；前端以显式 Antfu flat config 替代 Umi 的 ESLint 8 preset，并声明自身直接工具依赖。
- Stylelint 17 不使用 Umi 的 Stylelint 14 preset。新配置显式支持 Less，删除已废弃 stylistic rules，让 Prettier 继续作为唯一格式化器。
- lint 迁移产生的新诊断逐项判断：修复真实问题；仅当规则与仓库既有约定冲突时做最小、带原因的配置调整；不得用全局关闭或大范围 ignore 清空结果。
- TypeScript 采用官方 7.0 双轨迁移：稳定 7.0.2 CLI 负责所有 workspace 的 typecheck，官方 TypeScript 6.0.2 compatibility package 负责 API consumers。所有 `tsgo` 脚本迁为稳定 `tsc`，preview 包完全移除。
- TypeScript workspace override 与各 manifest 必须表达同一双轨策略，不允许某些 package 继续解析 preview 或直接把无 API 的 TypeScript 7 暴露给 typescript-eslint。
- React 19.2.7、React DOM 19.2.7、对应类型、Ant Design 6.5.1、icons 6.3.2、cssinjs 2.1.2、Umi Max 4.6.79 和 ProComponents 3.1.14-2 作为一个前端兼容集合验证。
- ProComponents 不是被其他包替代。Admin 精确固定当前 beta 目标并迁移全部已移除 API；SSO 因无任何 import 而删除该直接依赖。
- 当前静态盘点确认 Admin 有六处 `hideInSearch`，迁移为 v3 支持的等价搜索配置；实施时仍需按官方清单重新扫描全部被移除 API，不能把当前扫描当作完整证明。
- React 19 使用现代 JSX transform。现有生产源码未发现 `ReactDOM.render`、`findDOMNode`、function `defaultProps`、`propTypes` 或 `react-dom/test-utils`；实施时重新扫描并以类型检查和运行时 smoke 验证第三方兼容性。
- Ant Design 6 会改变组件内部 DOM，仓库又有大量 `.ant-*` / `.ant-pro-*` 自定义选择器，因此前端批次必须包含实际浏览器视觉检查，不以编译成功替代。
- 保留现有外部 API、OIDC claim、数据库 schema、queue contract、业务校验和页面流程。兼容性修正不得改变可观察业务含义。
- 不编辑生成目录或 vendored Swagger 静态产物。由构建工具生成的文件只用于验证，不作为手工迁移目标。
- 最终锁文件由 pnpm 11.14.0 一次收敛，随后执行 frozen-lockfile 安装。传递依赖随该解析结果更新，但只有解决兼容问题所必需的包才新增为直接依赖。
- 最终 outdated 审计允许 `@types/node` 24.13.2 相对 registry 26.1.1 的单一运行时例外；alias、beta tag 和新配置依赖按本规格的显式目标审计。
- 每个 ticket 保持单一升级目的并留下验证证据；全部 tickets 完成后运行 Standards 与 Spec 双轴评审，再决定是否合并。

## Testing Decisions

- 实施第一批改动前记录当前依赖基线的 frozen install、全仓 lint、typecheck、test 和 build 结果。既有失败必须先记录并与升级回归区分。
- package-manager seam 是使用 pnpm 11.14.0 执行安装、读取 workspace、运行 filtered scripts 和 frozen-lockfile 重装；同时静态审计所有受版本控制的 pnpm pin 完全一致。
- 常规依赖批次运行所有受影响 package 的聚焦测试、lint 和 typecheck；涉及运行时入口时追加对应 build 或启动 smoke。
- Hono/OpenAPI/tRPC 更新通过 API 与 Admin API 的现有 route、contract 和 service tests 验证；Scalar 更新追加 API reference HTTP smoke，证明页面与 schema 资源可访问。
- Redis、BullMQ 与 Bull Board 更新通过 jobs/worker 的 queue、processor 和 dashboard 聚焦测试验证；不得通过仅导入模块的低层测试替代任务行为。
- `bcrypt-ts` 9 的最高 seam 是现有认证、密码校验和密码更新行为测试，至少覆盖旧散列验证、新散列 round-trip、错误密码拒绝和相关登录流程。
- `csv-parse` 7 的最高 seam 是真实导入用例，覆盖有效 CSV、标题/字段映射、空值或引号边界以及当前拒绝路径，不测试库内部 parser helper。
- Vitest 批次先运行 Admin、SSO 和 OIDC 全部测试，再运行两个前端 coverage 命令。迁移必须检查 console warning、unhandled rejection、mock reset、hook cleanup 和 coverage include/exclude，不只比较测试数量。
- Vitest 配置只迁移受官方 v1-v4 breaking changes 影响的字段。没有可观察问题时不为 runner 内部实现添加测试。
- ESLint/Stylelint 批次分别运行根、全部后端 packages、Admin 和 SSO 的 lint 与 fix-dry-run 等价检查，并确认 flat config 能从 monorepo 根和 workspace 两种调用位置解析。
- Stylelint 必须实际解析全部现有 Less/CSS；Prettier check 确认 lint 配置迁移没有建立第二套相互冲突的格式化规则。
- TypeScript 批次对每个 workspace 运行稳定 TypeScript 7 typecheck，并运行全仓 typecheck。额外审计实际解析的 CLI 为 7.0.2、工具侧 `typescript` API 为官方 compatibility 6.0.2、仓库中不存在 native preview。
- TypeScript 7 新默认值和已删除 option 通过全部非生成 tsconfig 的类型检查验证。生成的 Umi tsconfig 由目标 Umi setup 重建后消费，不手工修补。
- React/Ant Design 批次运行 Admin 与 SSO 的 unit tests、typecheck 和 production build。React 运行时、类型包、Ant Design、icons、cssinjs 与 ProComponents 的解析版本必须与目标集合一致，不允许业务 app 混入旧 major。
- Admin 浏览器 smoke 覆盖应用布局、导航、至少一个 ProTable 搜索/分页页面、创建或编辑 ModalForm、详情 Drawer/ProDescriptions，以及审计日志六个迁移列的搜索可见性。
- SSO 浏览器 smoke 覆盖登录、验证码交互、密码重置、用户信息和维护页；关键页面检查桌面与窄屏布局。
- 前端 smoke 必须检查浏览器 console 中的 React、Ant Design、ProComponents、CSS-in-JS hydration/style 和 deprecated API 警告，并针对自定义 `.ant-*` 选择器做截图或人工视觉证据。
- 前端 Playwright 测试是用户流程最高 seam；只有现有自动化没有覆盖的视觉兼容点才补充测试或明确人工 smoke。不得为组件库内部 DOM 添加脆弱的低层结构断言。
- 最终集成使用 pnpm 11.14.0 执行 frozen-lockfile install、全仓 lint、typecheck、test、build、相关 Playwright smoke、文档检查和 `git diff --check`。
- 最终执行 `pnpm audit --prod` 并记录结果。与本次目标无关且无法在范围内解决的传递风险需要明确列出，不能静默忽略或擅自扩大为业务重构。
- 最终执行 direct-dependency outdated 审计，并把结果与本规格逐项对照。除 Node 24 的 `@types/node` 例外及已解释的 alias/beta 语义外，不得残留未确认的过期直接依赖。
- 完成所有 tickets 后进行 Standards 与 Spec 双轴 review；发现行为改变、宽泛 lint suppression、旧 major 混装或缺少验证证据时不得把规格标记完成。

## Out of Scope

- 把 Node 24 运行时或容器基础镜像升级到 Node 26。
- 把 `@types/node` 升级到 26.x，或允许源码使用 Node 24 不支持的 API。
- 升级或替换 Bun 运行时；其仓库 pin 保持现状。
- 把 Umi Max 替换为其他前端框架、把构建链整体迁到新的 bundler，或照搬 Ant Design Pro 模板的 Tailwind/Biome 架构。
- 等待 ProComponents 3 stable 发布；本规格明确接受并精确固定当前兼容 Ant Design 6 的 beta 目标。
- 将每个传递依赖提升为直接依赖，或在没有兼容性需求时手工控制 pnpm resolver 的所有传递版本。
- 更新当前已经位于目标版本的直接依赖，或改变内部 `workspace:*` package contract。
- 修改 IAM 领域规则、授权语义、数据库 schema、migration、HTTP/tRPC/OpenAPI/OIDC contract、queue payload 或持久化数据。
- 在依赖兼容之外重构后端 service、repository、前端页面或测试架构。
- 手工编辑 Umi 生成目录、build output、coverage output 或 vendored Swagger bundle。
- 把依赖升级与新产品功能、视觉 redesign、路由重组或 API redesign 合并。
- 自动修复所有历史 production audit 风险；本次只负责记录并修复由目标升级可直接、安全解决的问题。
- 发布、部署、推送分支或创建 pull request；这些外部状态变更需要单独授权。

## Further Notes

- `@ant-design/pro-components@2.8.10` 没有被替代，它仍是 npm `latest` 的 v2 稳定版；问题是它的 peer range 只支持 Ant Design 4/5。当前 `beta` 为 3.1.14-2，支持 Ant Design 6，因此 Admin 必须迁到 v3，SSO 则因未使用而删除。
- Vitest 0.34.6 发布于 2023 年，4.1.10 发布于 2026 年；跨度大是因为项目一直停在 0.x，registry 直接显示当前 v4。迁移作为独立 ticket series 处理，不把四个 major 当作普通 patch。
- TypeScript 7 官方说明 7.0 暂不提供 API，并推荐与 `@typescript/typescript6` 并存；本规格采用该官方过渡方式，而不是退回 preview 或让 lint 工具导入无 API 的 TypeScript 7。
- 主要上游迁移资料包括 [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)、[Ant Design v5 to v6](https://ant.design/docs/react/migration-v6/)、[ProComponents 2 to 3 Migration Guide](https://procomponents.ant.design/en-US/docs/migration-guide/)、[Vitest Migration Guide](https://vitest.dev/guide/migration)、[ESLint v10 Migration Guide](https://eslint.org/docs/latest/use/migrate-to-10.0.0) 和 [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)。
- 维护者已确认票据拆分，规格于 2026-07-18 转为 `approved`。每个 ticket 仍需在进入 `implement` 前获得针对该 ticket 的明确授权；规格批准不自动授权全部实施。
- 如果实施发现 Umi、ProComponents beta、TypeScript 7 或其他上游在目标组合中存在无法通过局部适配解决的硬阻塞，必须停止对应 ticket，记录最小复现并回到规格 amendment，不得自行降级目标或扩大为框架迁移。

## Amendments

### 2026-07-18 — 保留升级过程中自然刷新的传递依赖

- 维护者确认：每个直接依赖升级批次中，由目标 pnpm 正常重新解析并更新的传递依赖一并保留，不再仅为缩小锁文件 diff 而恢复旧传递版本。
- 该规则不把传递依赖提升为直接依赖或 override，也不允许当前 ticket 提前升级后续 tickets 的直接依赖；兼容性问题仍在引入该变化的 ticket 内验证和处理。
