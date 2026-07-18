# 共享契约与数据库

本文记录 package 边界、repository 事务规则，以及 Drizzle/PostgreSQL 布局约定。修改数据库 schema 或 migration 前，
先使用 schema 相关 skill 并遵守 workflow 门禁。

## 共享 Package 边界

- 跨 app enum 和稳定常量放在 `packages/contracts`。
- 共享 DTO schema、DTO type、audit helper 和可复用 business error 放在 `packages/domain`。
- 共享 BullMQ helper 放在 `packages/jobs`。
- 角色分配的正向 Effective Role 与反向受影响用户解析放在 `packages/role-assignment-resolution`；该 package
  接收 composition root 提供的 `DbClient`，调用方不复制 assignment 或组织闭包规则。
- user-profile read-model producer/query/worker 逻辑放在 `packages/user-profile-read-model`。
- App-private enum、schema 和 error 可以留在所属 app 内。

## Repositories 与 Transactions

- 仓储使用来自 `@iam/db` 的 Drizzle，并通过 `createXRepository(db)` factory 创建；`db` 绑定 root
  `DbClient` 或 transaction `DbClient`。
- Business service 方法不应把 `tx` 参数传给 repository 调用。
- 事务性后端 workflow 应使用 app-local `UnitOfWork`。
- Transaction callback 接收 tx-bound repository 和 audit writer port。
- Redis/cache/OIDC/SMS/fetch side effect 必须在 callback 外执行，或通过 best-effort `afterCommit` 执行。

## Drizzle Schema 布局

- Drizzle table definition 放在 `packages/db/src/schema/<domain>/*.ts`。
- Relation definition 放在 `packages/db/src/relations/<domain>/*.ts`。
- Migration 放在 `packages/db/src/migrations/`。
- 保持 domain-level 和 top-level schema/relation export 同步，例如 `packages/db/src/schema/core/index.ts`、
  `packages/db/src/relations/core/index.ts`、`schema/index.ts` 和 `relations/index.ts`。
- 使用 `snakeCase.table` / `snakeCase.schema`；TypeScript property 名称保持 camelCase，数据库 table/column 名称
  使用 snake_case。
- 使用 `drizzle-orm/zod` 生成 table-derived Zod schema。
- Join table 的 primary key、index 和 uniqueness constraint 保持显式定义。
