# 编码风格与命名约定

全仓库使用 TypeScript，统一采用 2 空格缩进、双引号、分号和 120 列目标宽度。宽度是排版偏好，不强制拆分不可拆分文本。

## Formatter 边界

- Biome 负责 JS/TS、JSX/TSX、JSON/JSONC、CSS 的排版与代码规则；Less、YAML、Markdown 只由 Prettier 排版。
- Less 额外使用 Stylelint 检查规则，不自动应用无法区分安全性的修复。YAML 的语义由实际消费工具的专属验证负责，
  Markdown 继续使用文档检查，不引入通用 YAML linter 或 prose lint。
- root 与 workspace 共用 `format`、`format:check`、`lint`、`lint:fix`：format 只排版，lint 检查规则与 import 整理；
  带 `:check` 的排版检查和普通 lint 均只读，lint:fix 只应用安全修复及 import 整理。副作用 import 保留顺序。
- 仓库自有且受支持的文件使用相同工具分工；生成输出、vendored 资源、冻结历史、依赖锁文件和外来 skill 副本排除。
  未支持类型不冒充已检查；排除规则及命令入口见[构建、测试与开发命令](commands.md)。

## 规则选择

Biome 推荐规则是当前基线。原 Antfu 预设不逐条复刻；项目显式定制按下表处理：

| 原约束                                                            | 当前处理                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 双引号、分号、120 列软限制；前端单引号与 80 列                    | 全仓统一 formatter 风格，宽度不作为独立 lint 错误。                            |
| 前端 `consistent-type-definitions: type`                          | `useConsistentTypeDefinitions` 要求 type，保留 `.d.ts` 的声明合并例外。        |
| `react-refresh/only-export-components`                            | `useComponentExportOnlyModules` 警告；测试文件继续豁免。                       |
| Service backend `no-console`                                      | 对原 service owner 保留 `noConsole` 警告；根工具和其他 workspace 不新增限制。  |
| process/buffer global 与后端 type/interface 自由选择              | 不新增限制。                                                                   |
| import 排序及 type specifier 风格                                 | 采用 Biome 推荐规则与 import 整理，裸副作用 import 不重排；format 不参与整理。 |
| 测试标题大小写                                                    | 不保留额外标题风格规则。                                                       |
| Gateway template-curly、两项 regexp 与 prefer-type-error 的关闭项 | 不复制旧引擎规则配置，使用 Biome 推荐规则；具体误报只能按实际语义作局部说明。  |
| Less 的三项颜色/媒体查询兼容配置                                  | 保留 Stylelint 的原兼容取舍，仅检查 Less。                                     |
| 通用 YAML lint                                                    | 按 ADR-0041 移除；Prettier 排版与专属配置验证各自负责。                        |

推荐规则中的 warning 保持工具定义的级别，不等于阻断错误；typecheck 仍负责完整类型检查。

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
