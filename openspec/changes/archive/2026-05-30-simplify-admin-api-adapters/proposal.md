## Why

`apps/admin-api` 当前为复用 REST 和 tRPC 入口，把简单 CRUD 也拆成 `handlers.ts`、`ops.ts`、`trpc.ts`、`service`
多层跳转。现有 `handlers.ts` 和 `trpc.ts` 多数只是薄适配，抽象收益没有完全抵消阅读、定位和新增接口时的认知成本。
当前 `user`、`position`、`organization`、`employment`、`client`、`audit` 六个 admin 模块都落在这个模式里，适合一次性统一整理。

## What Changes

- 保留 service 作为业务逻辑核心，明确 REST/tRPC 入口只承担协议适配、输入组装、响应包裹和上下文传递。
- 引入更机械的 admin API adapter helper，用少量声明注册 REST handler 和 tRPC procedure，减少每个模块重复维护薄 `handlers.ts` / `trpc.ts` / `ops.ts` 的成本。
- 调整 `ops` 层使用边界：只有 REST 与 tRPC 共享复杂编排、上下文解析或输出转换时才保留显式 `*.ops.ts`；简单 CRUD 可以直接通过 adapter helper 连接 service。
- 一次性把当前所有 admin REST/tRPC 双入口模块迁移到统一 adapter helper 体系，避免同一变更里长期并存两套入口组织方式。
- 不改变现有 REST 路径、请求/响应 schema、tRPC router 名称和业务语义。

## Capabilities

### New Capabilities

- `admin-api-adapter-simplification`: 约束 admin-api REST/tRPC 双入口模块的适配层结构、复用边界和迁移要求。

### Modified Capabilities

无。

## Impact

- 影响 `apps/admin-api/src/routes/admin/**` 中当前所有同时提供 REST 和 tRPC 的模块：user、position、organization、employment、client、audit。
- 影响共享 helper 所在位置，预计在 `apps/admin-api/src/lib/` 或 `packages/api-core/src/` 中新增或调整 admin adapter 工具。
- 不引入数据库 schema、外部依赖、环境变量或公开 API contract 变更。
