## Context

`apps/admin-api` 的 user、position、organization、employment、client、audit 等模块同时暴露 REST 和 tRPC。
当前复用方式是把业务操作封装成 `defineQueryOp` / `defineMutationOp`，再由 `*.handlers.ts` 调用 `.run()`，
由 `*.trpc.ts` 调用 `.toTRPC()`。这种结构能统一响应包裹和 tRPC 错误映射，但对简单 CRUD 来说会形成
`routes -> handlers -> ops -> service` 的固定跳转链。
本次变更的范围覆盖这 6 个当前存在的双入口模块，不再采用“先迁移一个模块再推广”的节奏。

约束：

- `*.routes.ts` 仍是 OpenAPI REST contract 的来源。
- service 仍是业务逻辑、事务边界和领域规则的核心。
- tRPC router 名称、REST 路径、Zod schema、响应 envelope 不能因为本次整理而改变。
- 迁移需要避免一次性改动所有 admin 模块导致回归面过大。

## Goals / Non-Goals

**Goals:**

- 降低简单 CRUD 在 REST/tRPC 双入口下的文件跳转和样板代码。
- 让 REST/tRPC 适配逻辑更机械化，使新增接口时能从 route 声明、输入映射和 service 调用直接看出行为。
- 保留复杂复用场景的显式 `ops` 层，而不是强制所有模块使用同一种抽象。
- 一次性把当前所有 admin 双入口模块迁移到统一 helper 体系，避免中间状态长期存在。

**Non-Goals:**

- 不改变 admin REST 或 tRPC 的公开 contract。
- 不重写 `createApp` 自动发现机制、OpenAPI route 定义方式或 tRPC 顶层路由组织。
- 不把业务逻辑从 service 移入 route、handler 或 adapter helper。
- 不在本次变更中同步重构 public API、SSO 或 frontend 调用层。

## Decisions

1. 新增 admin API adapter helper，而不是扩展 `business-op` 为更复杂的通用抽象。

   - 选择：在 admin-api 范围内提供面向 Hono REST handler 和 tRPC procedure 的注册/适配 helper。
   - 理由：当前问题主要出现在 `apps/admin-api` 的双入口 CRUD 模块；局部 helper 可以贴合 Hono route
     输入、audit context 和响应 envelope，不把 admin 特有概念推入 `packages/api-core`。
   - 替代方案：继续增强 `defineQueryOp` / `defineMutationOp`。该方案会保留现有 `ops` 中间层，难以降低跳转成本。

2. helper 以“声明操作 + 输入映射 + service 调用”为核心，REST 和 tRPC 从同一份声明派生。

   - 选择：每个操作声明需要包含 `kind`、`input`、`handler`，可选包含 REST 输入组装函数和上下文需求。
   - 理由：REST 的参数可能来自 `param`、`query`、`json` 的组合，而 tRPC 输入通常已经是单个对象；显式输入映射能避免隐式魔法。
   - 替代方案：从 OpenAPI route schema 自动推导所有输入。该方案实现复杂，且容易在 param/body 合并规则上产生不透明行为。

3. `ops` 层变为可选层，只服务复杂复用。

   - 选择：简单 CRUD 可直接使用 adapter helper 连接 service；存在复杂输出转换、跨 service 编排、特殊上下文解析或多入口差异时保留 `*.ops.ts`。
   - 理由：保留抽象逃生口，避免为减少文件数而把复杂逻辑塞进 helper 配置。
   - 替代方案：完全移除 `ops` 层。该方案会让复杂模块缺少清晰的复用承载位置。

4. 一次性迁移所有当前双入口模块。

   - 选择：对 user、position、organization、employment、client、audit 六个模块统一套用 helper 体系。
   - 理由：这些模块的 REST/tRPC 入口形态高度相似，统一迁移能消除同一变更中并存两套组织方式的问题，也避免后续重复返工。
   - 替代方案：先迁移单个模块再推广。该方案更保守，但不符合本次工作任务要把所有模块一起迁移的要求。

## Risks / Trade-offs

- [Risk] helper 过度配置化，形成新的隐藏复杂度 → Mitigation：只覆盖现有薄适配重复点，复杂逻辑继续留在 service 或可选 `ops`。
- [Risk] REST 与 tRPC 的错误映射或响应 envelope 行为不一致 → Mitigation：helper 内复用现有 `resp.ok` 和 tRPC 错误映射路径，并为代表性模块补充测试。
- [Risk] 输入映射规则不清晰导致 param/body 合并回归 → Mitigation：每个 REST 操作显式声明输入组装函数，测试覆盖 param、json 组合场景。
- [Risk] 一次性迁移面较大，回归范围扩散 → Mitigation：按模块拆分提交和验证，保持 REST/tRPC contract 不变，并在每个模块完成后立即做 focused typecheck / test。

## Migration Plan

1. 新增 admin API adapter helper 和针对 helper 的单元测试。
2. 依次迁移 user、position、organization、employment、client、audit 六个模块到新 helper，保持 REST/tRPC contract 不变。
3. 在每个模块迁移后运行对应 focused tests 和 typecheck，必要时补充 handler/tRPC registration 测试。
4. 全部模块完成后做一次全量 admin-api 验证，确认没有遗留旧入口组织方式。
5. 回滚策略：保留原 service 调用和 route schema，若 helper 行为不符合预期，可按模块回退到原 `handlers.ts` / `trpc.ts` / `ops.ts` 结构。

## Open Questions

- helper 是否放在 `apps/admin-api/src/lib/`：倾向先放在 admin-api 本地，等 public API 也出现同类需求后再考虑下沉到 `packages/api-core`。
