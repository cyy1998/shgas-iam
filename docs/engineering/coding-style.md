# 编码风格与命名约定

全仓库使用 TypeScript，统一采用 2 空格缩进、双引号、分号和 120 列目标宽度。宽度是排版偏好，不强制拆分不可拆分文本。

## Formatter 边界

- Biome 负责 JS/TS、JSX/TSX、JSON/JSONC、CSS 的排版与代码规则；Less、YAML、Markdown 只由 Prettier 排版。
- Less 额外使用 Stylelint 检查规则，不自动应用无法区分安全性的修复。YAML 的语义由实际消费工具的专属验证负责，
  Markdown 继续使用文档检查，不引入通用 YAML linter 或 prose lint。
- 仓库自有且受支持的文件使用相同工具分工；生成输出、vendored 资源、冻结历史、依赖锁文件和外来 skill 副本排除。
  未支持类型不冒充已检查；排除规则及命令入口见[构建、测试与开发命令](commands.md)。

## 规则选择

以 Biome 推荐规则为基线。全仓使用自动 import 整理，裸副作用 import 保留顺序。
前端类型定义用 `type`，`.d.ts` 保留声明合并例外。React Fast Refresh 的组件导出约束保留 warning，测试文件豁免。
Service backend 的既有 owner 保留 `noConsole` 警告。Less 的颜色和媒体查询兼容例外见 [Stylelint 配置](../../stylelint.config.mjs)。

Warning 沿用工具定义的级别，完整类型检查由 typecheck 负责。旧规则的迁移取舍见 [ADR-0041](../adr/0041-unify-format-and-lint-with-biome.md)。

## TypeScript 写法

- 后端业务查询优先使用共享契约或所属模块的枚举与常量，尤其是状态、类型和角色类字段。
- 简单的提前返回可保持单行，例如 `if (!entity) return null;`。
- Bun app 的 tsconfig 包含 Bun types。App-local 非生产维护 scripts 从生产 tsconfig 排除，并纳入格式与 lint。

## 命名

- 保留既有 domain file naming：`user.service.ts`、`user.repository.ts`、`user.schema.ts`、`user.routes.ts`、
  `user.handlers.ts`、`user.trpc.ts` 和 `user.type.ts`。
- React component 和 page 使用 PascalCase。
- 已经使用 import alias 的地方，优先沿用 `@admin`、`@sso` 或 workspace package import。
- 测试文件位置与命名统一见[测试规范](testing.md#路径与命名)。
