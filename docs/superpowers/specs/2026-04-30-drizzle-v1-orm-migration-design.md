# Drizzle v1 ORM 迁移设计

## 目标

将 `apps/api` 从 Prisma 完整迁移到 Drizzle v1。最终状态会移除 Prisma runtime、Prisma schema、Prisma 生成的 client 与 Zod schema，以及 Prisma migration 工具。Drizzle 将成为数据库 schema 定义、运行时查询、迁移和基于表派生的 Zod schema 的唯一来源。

## 决策

- 迁移方式：分阶段完成整体替换。
- Schema 来源：基于当前 `apps/api/src/db/schema.prisma` 采用 code-first。
- 数据策略：保留现有数据库数据。第一份 Drizzle migration 是 baseline，不得重建现有表。
- 查询风格：混合模式。简单 CRUD 可使用 Drizzle relational queries 或 query builder helper；复杂的授权、组织、任职和嵌套关系过滤使用显式 SQL builder 查询。

## 目标结构

```text
apps/api/
  drizzle.config.ts
  src/db/
    index.ts
    errors.ts
    schema/
      index.ts
      iam.ts
      relations.ts
      zod.ts
    migrations/
      meta/
      0000_baseline.sql
```

`src/db/index.ts` 导出 Drizzle database singleton 和 transaction/executor 类型。业务代码只从 `@/db` 导入，避免服务和仓储感知 driver 初始化。

`src/db/schema/iam.ts` 定义 `schema.prisma` 中所有现有表：users、organizations、organization closure、positions、employment、clients、roles、role join tables、privileges、privilege delegation、delegation detail 和 login logs。TypeScript 属性名保留当前业务命名，例如 `orgCode` 和 `createTime`；数据库列名保留现有名称，例如 `org_code` 和 `create_time`。

`src/db/schema/relations.ts` 将 Drizzle relations 与表定义分开。`src/db/schema/zod.ts` 导出 `createSelectSchema`、`createInsertSchema` 和 `createUpdateSchema` 的结果，用来替代从 `@/db/generated/schemas` 导入的 schema。

## 迁移阶段

### 阶段 1：Drizzle 基础设施

增加 Drizzle 依赖与配置。创建 code-first 表定义、relations、Drizzle client singleton 和 baseline migration。Baseline migration 只记录当前 schema 状态，不得对现有环境执行破坏性 DDL。

### 阶段 2：替换 Zod Schema

将 service 层对 `@/db/generated/schemas` 的导入替换为 Drizzle 派生的 Zod schema。继续保留现有 service DTO 文件，例如 `user.schema.ts` 和 `organization.schema.ts`，作为稳定的 OpenAPI 与 route validation 层。只有它们的基础 schema 导入来源发生变化。

### 阶段 3：迁移 Repository

按风险迁移 repository：

1. 低风险模块：`client`、`session`、`position`、`privilege`。
2. 中风险模块：`organization`、`employment`、`user`。
3. 最高风险模块：`role` 和 permission aggregation queries。

Repository 函数继续接受可选 executor 参数，现在类型为 Drizzle executor 或 transaction。简单读写使用 `select`、`insert`、`update`、`delete` 或带 `with` 的 `db.query.*`。复杂 Prisma nested filters、`some` 条件、relation counts、`groupBy` 和 permission inheritance 会改写为使用 joins、`exists`、`and`、`or`、`inArray`、`ilike` 与 `sql` 的显式 SQL。

### 阶段 4：移除 Prisma

所有 repositories 和 services 编译通过且冒烟测试通过后，移除 `prisma`、`@prisma/client`、`@prisma/adapter-pg`、`prisma-zod-generator`、`schema.prisma`、`src/db/generated`，以及 docs 和 scripts 中的 Prisma 命令。

## 事务

Service 的事务边界在概念上保持不变。类似 `prisma.$transaction(async tx => ...)` 的调用会变成 `db.transaction(async tx => ...)`。Repository 函数在 service transaction 内调用时接收 transaction 对象。需要时可使用 Drizzle savepoint 支持嵌套事务，但第一轮迁移不应引入新的事务嵌套。

## 错误处理

使用 `src/db/errors.ts` 中的 PostgreSQL error helper 替换 Prisma 特定错误处理。业务 service 应调用 `isUniqueViolation(err)`、`isForeignKeyViolation(err)`、`isNotNullViolation(err)` 和 `isCheckViolation(err)` 等 helper。这些 helper 映射 PostgreSQL SQLSTATE code，包括 `23505`、`23503`、`23502` 和 `23514`。

## 验证与发布

每个阶段都必须通过：

- `pnpm --filter @iam/api typecheck`
- `pnpm --filter @iam/api lint`

每个已迁移模块都需要通过 Scalar UI 中受影响的 REST 或 tRPC endpoint 做冒烟覆盖。高风险路径需要固定样例检查，包括用户搜索、组织树和 closure 查询、任职分页、角色继承与权限委托。

应用 baseline 前，请将当前生产 schema 与 `schema.prisma` 比对。如果线上数据库存在差异，应有意更新 Drizzle 表定义后再声明 baseline。首次部署只应应用 Drizzle metadata，不应执行重建表的 DDL。

建议为 repository 行为补充基于 PostgreSQL 的集成测试。仅使用 mock 的测试不足以覆盖本次迁移，因为主要风险在 SQL 语义。
