---
name: db-schema
description: Use when creating or modifying PostgreSQL schema, indexes, constraints, or Drizzle ORM / drizzle-orm/zod code.
---


# 数据库 Schema 开发指南

## 技术栈

- **ORM**: Drizzle ORM v1 RC（postgres.js driver）
- **Schema 验证**: `drizzle-orm/zod` + Zod v4
- **数据库**: PostgreSQL

## 文件结构

```
src/db/schema/
├── _shard/              # 共享定义
│   ├── base-columns.ts  # 基础列（id/createdAt/updatedAt/createdBy/updatedBy）
│   ├── enums.ts         # 数据库枚举定义
│   └── types/           # 共享类型
├── _infra/              # 基础设施表（非业务表）
│   └── queue/           # 队列任务
├── admin/               # 管理端表
│   ├── system/          # 系统管理
│   └── auth/            # 认证相关
├── client/              # 客户端表
└── index.ts             # 统一导出
```

> `_infra` 目录使用下划线前缀，存放基础设施相关的表（如审计日志、队列任务记录等），与业务表分开管理。

## 核心规则

### 导入方式

```typescript
import db from "@/db"; // 数据库实例（default export）
import { systemUsers } from "@/db/schema"; // Schema 定义
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
```

不要再从 `drizzle-zod` 导入 validator helper；v1 RC 使用 `drizzle-orm/zod`。

### 命名约定

- TS 属性名：camelCase
- 数据库表名、列名：snake_case
- 表名：`{tier}_{feature}s`（如 `system_users`），表名保持显式 snake_case
- 索引名：`{表名}_{字段名}_idx`
- 主键：统一命名为 `id`

Drizzle v1.0.0-rc.1 起不要依赖 `drizzle({ casing: "snake_case" })`。命名转换必须放到 schema 定义层：

```typescript
import { snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";

const pgTable = snakeCase.table;

export const systemUsers = pgTable("system_users", {
  id: uuid().primaryKey(),
  username: text().notNull(),
  displayName: text(), // DB 列名 display_name
  createdAt: timestamp().defaultNow(), // DB 列名 created_at
});
```

如果使用 PostgreSQL schema/namespace：

```typescript
import { snakeCase } from "drizzle-orm/pg-core";

const adminSchema = snakeCase.schema("admin");

export const users = adminSchema.table("users", {
  // 列名同样按 snake_case 映射
});
```

### 表定义边界

- 业务表放在 `src/db/schema/{tier}/{category}/`
- 基础设施表放在 `src/db/schema/_infra/`
- 共享列、枚举、JSON 类型放在 `src/db/schema/_shard/`
- 每个 schema 文件只定义当前业务聚合需要的表、索引、约束和 Zod schema
- 不要把 Relations v2 写在表定义文件中；关系放到 `src/db/relations/`，具体写法参考 `drizzle-v1` skill

### Zod Schema

```typescript
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { systemUsers } from "@/db/schema";

export const selectSystemUserSchema = createSelectSchema(systemUsers);
export const insertSystemUserSchema = createInsertSchema(systemUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateSystemUserSchema = createUpdateSchema(systemUsers).partial();
```

保持 Zod v4 写法；如需覆盖字段校验，在生成 schema 后用 `.extend()` / `.omit()` / `.pick()` 等组合。

### 批量插入

```typescript
// 正确：批量插入
await db.insert(table).values(items);

// 错误：循环单条插入
for (const item of items) {
  await db.insert(table).values(item);
}
```

## 模板参考

### 数据库 Schema

参考 [db-schema.md](../_shared/templates/db-schema.md)

包含：
- 标准表定义
- 字段类型参考
- 约束定义语法
- 主键设计规则
- 索引设计原则
- 枚举定义流程
- Relations 定义
- JSONB 使用规范
- Drizzle-kit 工作流程

读取共享模板时，以本文件的 v1 RC 覆盖规则为准：`pgTable` 示例应改成 `snakeCase.table`，validator 导入应改成 `drizzle-orm/zod`。

### Zod Schema

参考 [zod-schema.md](../_shared/templates/zod-schema.md)

包含：
- 标准 Schema 文件结构
- Schema 派生规则
- 最佳实践
- Zod v4 注意事项

读取共享模板时，不再使用 `drizzle-zod` 入口。

### PostgreSQL 表设计最佳实践

参考 [postgresql-design.md](templates/postgresql-design.md)

包含：
- 数据类型选择（避免使用的类型、推荐类型）
- 约束设计（PK、FK、UNIQUE、CHECK、EXCLUDE）
- 索引类型（B-tree、GIN、GiST、BRIN）
- 分区策略（RANGE、LIST、HASH）
- 特殊场景优化（更新密集、插入密集、Upsert）
- 安全 Schema 演进
- JSONB 使用指南
- 常用扩展（pgcrypto、pg_trgm、timescaledb、postgis、pgvector）

### 数据库迁移指南

参考 [migration.md](templates/migration.md)

包含：
- Drizzle 工作流程（push vs generate vs migrate）
- 迁移最佳实践（小单位迁移、安全添加/删除列）
- 生产检查清单（迁移前/中/后）
- 回滚策略
- 常见问题解答

## 开发流程

### 创建新表

1. 在 `src/db/schema/{tier}/{category}/` 下创建文件
2. 使用 `snakeCase.table` 定义表结构（继承 baseColumns）
3. 创建 selectSchema、insertSchema、updateSchema
4. 在 `src/db/schema/index.ts` 中导出
5. 如有关系，新增 `src/db/relations/{tier}/{feature}.ts` 并在 relations index 注册
6. 运行 `pnpm push`（开发环境）

### 修改现有表

1. 修改 schema 文件中的表定义
2. 同步更新 Zod schema、Relations、查询代码
3. 运行 `pnpm push`（开发环境）
4. 如果需要迁移数据，编写迁移脚本

### 升级到 Drizzle v1 RC

1. 运行 `pnpm drizzle-kit up` 更新 migrations 目录结构
2. 把 `drizzle-zod` 等独立 validator 导入迁到 `drizzle-orm/zod` 等内置入口
3. 把 db 初始化中的 `casing` 迁到 `snakeCase.table` / `snakeCase.schema`
4. Postgres 项目不要继续使用旧 `db._query`，直接迁到 RQB v2
5. 如使用 `makePgArray` / `parsePgArray`，导入路径改为 `drizzle-orm/pg-core/array`

### 生产部署

```bash
pnpm generate # 生成迁移文件
pnpm migrate  # 执行迁移
```

生产环境不要用 `push` 直接改库；先生成迁移、审查 SQL，再执行迁移。

## 重要提醒

- 不要修改已执行的迁移文件和 `meta/` 文件夹；未执行的迁移文件可以修改或删除后重新生成
- 使用枚举时确保 TS 枚举和 DB 枚举保持同步
- 外键选择：物理外键（需级联）vs 逻辑外键（应用层维护）
- 索引设计：不确定时先询问，避免过度设计
- JSONB、数组、timestamp、bytea 等列在升级 rc.1 后需要做重点烟测
- 只有在关键查询验证通过后，才考虑在 `drizzle()` 初始化中开启 `jit: true`
