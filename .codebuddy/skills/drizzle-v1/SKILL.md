---
name: drizzle-v1
description: Use when working on Drizzle ORM v1 Relations v2, RQB v2 queries, through() many-to-many, or migration off old Drizzle APIs.
---


# Drizzle ORM v1 (Relations Query v2) 指南

## 版本信息

- **当前版本**: `drizzle-orm@1.0.0-rc.1`（2026-04-30 发布）
- **官方文档**: v1 RC 以 Relations v2 / RQB v2 为主线
- **关键变化**: Relations 定义方式、对象式查询 API、多对多 `through()`、schema 层 casing、opt-in JIT mappers

## rc.1 必知变更

1. **casing 是破坏性变更**：不要再写 `drizzle({ casing: "snake_case" })`。在 PostgreSQL 项目中用 `snakeCase.table` / `snakeCase.schema` / `snakeCase.view` 在 schema 定义层声明命名转换。
2. **Postgres 移除了 RQB v1 `db._query`**：升级到 rc.1 后不要再把旧查询迁移到 `db._query` 作为过渡方案；Postgres 下应直接迁移到 `db.query.*` 的 RQB v2 写法。
3. **JIT mappers 是 opt-in**：可在热点 prepared query 场景开启 `jit: true`，但先用 typecheck、关键查询和数据类型映射做回归验证。
4. **内部 codec system**：Postgres driver 间的 select、JSON、array 等数据映射更一致，升级后仍要重点烟测 JSONB、数组、timestamp、bytea 等列。
5. **validator 包内聚**：优先从 `drizzle-orm/zod`、`drizzle-orm/valibot`、`drizzle-orm/typebox`、`drizzle-orm/arktype` 导入，不再使用独立 `drizzle-zod` 入口。

## drizzle() 初始化

传入 `relations`，不要再在 db 实例上传 `casing`：

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import { relations } from "./relations";

const db = drizzle({
  client: getQueryClient(),
  relations,
  // 可选：仅在热点查询验证通过后开启
  // jit: true,
});
```

### Schema 层 casing

PostgreSQL 项目使用 `snakeCase` helper，让 TS 属性保持 camelCase，数据库列名自动为 snake_case：

```typescript
import { snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";

const pgTable = snakeCase.table;

export const systemUsers = pgTable("system_users", {
  id: uuid().primaryKey(),
  fullName: text(), // DB 列名 full_name
  createdAt: timestamp().defaultNow(), // DB 列名 created_at
});
```

有 PostgreSQL schema/namespace 时，把 helper 用在 schema 层：

```typescript
import { snakeCase } from "drizzle-orm/pg-core";

const adminSchema = snakeCase.schema("admin");

export const users = adminSchema.table("users", {
  // 所有列名同样按 snake_case 映射
});
```

可用实体：`snakeCase.table`、`snakeCase.view`、`snakeCase.materializedView`、`snakeCase.schema`；反向需求用 `camelCase.*`。

## Relations 定义

### 基本结构

使用 `defineRelations` 在一处定义所有关系：

```typescript
// src/db/relations/index.ts
import { defineRelations } from "drizzle-orm";
import * as schema from "@/db/schema";

export const relations = defineRelations(schema, (r) => ({
  users: {
    posts: r.many.posts(),
  },
  posts: {
    author: r.one.users({
      from: r.posts.authorId,
      to: r.users.id,
    }),
  },
}));
```

### 本项目的分片模式

本项目使用 `defineRelations` + 按文件拆分函数 + spread 注册：

```typescript
// src/db/relations/index.ts
import { defineRelations } from "drizzle-orm";
import * as schema from "@/db/schema";
import { userRolesRelations } from "./admin/user-roles";

export const relations = defineRelations(schema, (r) => ({
  ...userRolesRelations(r),
}));
```

```typescript
// src/db/relations/admin/user-roles.ts
import type { ExtractTablesFromSchema, RelationsBuilder } from "drizzle-orm";
import type * as schema from "@/db/schema";
import { Status } from "@/db/schema";

type Schema = ExtractTablesFromSchema<typeof schema>;

export const userRolesRelations = (r: RelationsBuilder<Schema>) => ({
  systemUsers: {
    roles: r.many.systemRoles({
      from: r.systemUsers.id.through(r.systemUserRoles.userId),
      to: r.systemRoles.id.through(r.systemUserRoles.roleId),
    }),
    enabledRoles: r.many.systemRoles({
      from: r.systemUsers.id.through(r.systemUserRoles.userId),
      to: r.systemRoles.id.through(r.systemUserRoles.roleId),
      where: { status: Status.ENABLED },
    }),
  },
  systemRoles: {
    users: r.many.systemUsers(),
  },
});
```

**关键模式**：
- 类型使用 `ExtractTablesFromSchema<typeof schema>` + `RelationsBuilder<Schema>`
- 返回对象直接 spread 到 `defineRelations` 中
- 按 `src/db/relations/{tier}/{feature}.ts` 组织文件
- 同一表的关系分散在多个 part 时，spread 会覆盖同名 key；必要时在 `index.ts` 手动合并同一表对象

### 一对一 / 一对多

```typescript
// one: 指定 from -> to 映射
posts: {
  author: r.one.users({
    from: r.posts.authorId,
    to: r.users.id,
  }),
},

// many: 可以只定义 many 侧
users: {
  posts: r.many.posts({
    from: r.users.id,
    to: r.posts.authorId,
  }),
},
```

### 多对多 (through)

使用 `.through()` 指定连接表，无需手动查询连接表再映射：

```typescript
users: {
  groups: r.many.groups({
    from: r.users.id.through(r.usersToGroups.userId),
    to: r.groups.id.through(r.usersToGroups.groupId),
  }),
},
groups: {
  participants: r.many.users(),
},
```

### 预定义过滤器 (where)

在关系定义中预设过滤条件，查询时直接使用关系名：

```typescript
systemUsers: {
  enabledRoles: r.many.systemRoles({
    from: r.systemUsers.id.through(r.systemUserRoles.userId),
    to: r.systemRoles.id.through(r.systemUserRoles.roleId),
    where: { status: Status.ENABLED },
  }),
},
```

> `where` 只能过滤目标表（`to` 端）的列。跨表复杂条件使用查询层过滤或 core query。

### optional 与 alias

```typescript
posts: {
  author: r.one.users({
    from: r.posts.authorId,
    to: r.users.id,
    optional: false, // 类型非 nullable
    alias: "author_post", // 替代旧 relationName
  }),
},
```

## 查询 API

### where（对象语法）

```typescript
// 简单等值
db.query.users.findFirst({
  where: { id: userId },
});

// 多条件 AND
db.query.users.findMany({
  where: { status: Status.ENABLED, username: "admin" },
});

// 操作符
db.query.users.findMany({
  where: {
    id: { gt: 10 },
    name: { like: "M%" },
  },
});

// 按关系过滤
db.query.users.findMany({
  where: {
    id: { gt: 10 },
    posts: {
      content: { like: "M%" },
    },
  },
});

// 关系存在性过滤
db.query.users.findMany({
  with: { posts: true },
  where: { posts: true },
});
```

#### 常用 where 操作符

```typescript
where: {
  OR: [],
  AND: [],
  NOT: {},
  RAW: (table) => sql`${table.id} = 1`,

  [relation]: {},

  [column]: {
    eq: 1,
    ne: 1,
    gt: 1,
    gte: 1,
    lt: 1,
    lte: 1,
    in: [1, 2],
    notIn: [1, 2],
    like: "M%",
    ilike: "m%",
    notLike: "M%",
    notIlike: "m%",
    isNull: true,
    isNotNull: true,
    arrayOverlaps: [1, 2],
    arrayContained: [1, 2],
    arrayContains: [1, 2],
    OR: [],
    AND: [],
    NOT: {},
  },
}
```

### orderBy / columns / with

```typescript
db.query.users.findMany({
  columns: { id: true, username: true, avatar: true },
  orderBy: { createdAt: "desc", username: "asc" },
  with: {
    roles: {
      columns: { id: true, name: true },
      orderBy: { name: "asc" },
    },
  },
});
```

自定义 SQL 排序：

```typescript
db.query.posts.findMany({
  orderBy: (t) => sql`${t.id} asc`,
});
```

### offset（支持关系对象）

```typescript
db.query.posts.findMany({
  limit: 5,
  offset: 2,
  with: {
    comments: {
      offset: 3,
      limit: 3,
    },
  },
});
```

### extras（自定义计算字段）

```typescript
import { sql } from "drizzle-orm";

db.query.posts.findMany({
  extras: {
    contentLength: (table, { sql }) => sql<number>`length(${table.content})`,
  },
  with: {
    comments: {
      extras: {
        commentSize: (table, { sql }) => sql<number>`length(${table.content})`,
      },
    },
  },
});
```

> `extras` 目前不支持聚合函数；需要聚合时使用 core queries。`extras` 字段上不要再写 `.as("<alias>")`，字段名由 object key 决定。

子查询示例：

```typescript
import { eq } from "drizzle-orm";
import { posts } from "@/db/schema";

db.query.users.findMany({
  with: { posts: true },
  extras: {
    totalPostsCount: (table) => db.$count(posts, eq(posts.authorId, table.id)),
  },
});
```

### Prepared Statements 与 JIT

```typescript
import { sql } from "drizzle-orm";

const prepared = db.query.users.findMany({
  limit: sql.placeholder("uLimit"),
  offset: sql.placeholder("uOffset"),
  where: {
    OR: [{ id: { eq: sql.placeholder("id") } }, { id: 3 }],
  },
  with: {
    posts: {
      where: { id: { eq: sql.placeholder("pid") } },
      limit: sql.placeholder("pLimit"),
    },
  },
}).prepare("users_with_posts");

const result = await prepared.execute({
  pLimit: 1,
  uLimit: 3,
  uOffset: 1,
  id: 2,
  pid: 6,
});
```

`jit: true` 会让 prepared query 复用生成后的 mapper，更适合高频查询；不要在未做回归前全局开启。

## 多对多查询对比

### v1 之前（绕过连接表）

```typescript
const response = await db.query.users.findMany({
  with: {
    usersToGroups: {
      columns: {},
      with: { group: true },
    },
  },
});

// 还需要手动 map: usersToGroups.map((row) => row.group)
```

### v1 新版（through 直查）

```typescript
const response = await db.query.users.findMany({
  with: { groups: true },
});
```

## 新增 Relations 文件步骤

1. 创建 `src/db/relations/{tier}/{feature}.ts`
2. 定义类型化函数，返回关系对象
3. 在 `src/db/relations/index.ts` 中 spread 注册

```typescript
// src/db/relations/{tier}/{feature}.ts
import type { ExtractTablesFromSchema, RelationsBuilder } from "drizzle-orm";
import type * as schema from "@/db/schema";

type Schema = ExtractTablesFromSchema<typeof schema>;

export const featureRelations = (r: RelationsBuilder<Schema>) => ({
  parentTable: {
    children: r.many.childTable({
      from: r.parentTable.id,
      to: r.childTable.parentTableId,
    }),
  },
  childTable: {
    parent: r.one.parentTable({
      from: r.childTable.parentTableId,
      to: r.parentTable.id,
    }),
  },
});
```

## 从旧版迁移速查

| 旧写法 | v1 rc.1 写法 |
| --- | --- |
| `relations()` 每表单独定义 | `defineRelations(schema, (r) => ({}))` |
| `fields: [posts.authorId]` | `from: r.posts.authorId` |
| `references: [users.id]` | `to: r.users.id` |
| `relationName: "xxx"` | `alias: "xxx"` |
| `where: (t, { eq }) => eq(t.id, 1)` | `where: { id: 1 }` |
| `orderBy: (t, { asc }) => [asc(t.id)]` | `orderBy: { id: "asc" }` |
| `drizzle(url, { schema })` | `drizzle({ client, relations })` |
| `drizzle({ casing: "snake_case" })` | `snakeCase.table(...)` / `snakeCase.schema(...)` |
| `import { createSelectSchema } from "drizzle-zod"` | `import { createSelectSchema } from "drizzle-orm/zod"` |
| Postgres 旧查询迁到 `db._query` | 不适用于 rc.1；直接迁到 `db.query` RQB v2 |

## 渐进迁移策略

Postgres 项目升级到 rc.1 时，不要依赖 `db._query` 渐进迁移。建议按模块切换：

1. 先迁移 schema 层 casing：所有新表用 `snakeCase.table` / `snakeCase.schema`。
2. 将旧 `relations()` 改为 `defineRelations()`，并把关系文件集中到 `src/db/relations/`。
3. 将旧回调式 `where` / `orderBy` 改为对象语法。
4. 对多对多关系用 `through()` 消除连接表手动映射。
5. 运行 typecheck 和关键查询烟测后，再考虑开启 `jit: true`。

## drizzle-kit pull 自动迁移

```bash
pnpm drizzle-kit pull
```

会在 `drizzle/relations.ts` 生成新语法的关系定义，可复制到 `src/db/relations/` 后再整理导入路径和分片结构。

## 升级步骤（从旧版到 v1 RC）

1. 运行 `pnpm drizzle-kit up`：更新 migrations 文件夹结构（移除旧 `journal.json`，按文件夹分组）。
2. 更新 validator 包导入：
   - `drizzle-zod` -> `drizzle-orm/zod`
   - `drizzle-valibot` -> `drizzle-orm/valibot`
   - `drizzle-typebox` -> `drizzle-orm/typebox`
   - `drizzle-arktype` -> `drizzle-orm/arktype`
3. 迁移 schema 层 casing，删除 db 初始化里的 `casing`。
4. 迁移 Relations 和查询，Postgres 不再使用 `db._query`。
5. 如使用 `makePgArray` / `parsePgArray`，导入路径改为 `drizzle-orm/pg-core/array`。

## 常见陷阱

1. 不要混用 `defineRelations` 和旧版 `relations()`。
2. 单列 `from` / `to` 直接传值；多列才用数组。
3. 多个 part spread 时，同表同 key 会被后者覆盖。
4. `through()` 需要连接表已在 schema 中导出。
5. 预定义关系 `where` 只能过滤目标表列。
6. `extras` 不支持聚合函数，也不要依赖 `.as()` 别名。
7. `jit: true` 是性能选项，不是语义修复；先验证再打开。
8. rc.1 下 Postgres 没有 `db._query` 退路。

## 官方文档参考

- [v1.0.0-rc.1 Release](https://github.com/drizzle-team/drizzle-orm/releases/tag/v1.0.0-rc.1)
- [Relations v2 定义](https://orm.drizzle.team/docs/relations-v2)
- [Relational Queries](https://orm.drizzle.team/docs/rqb-v2)
- [从 Relations v1 迁移到 v2](https://orm.drizzle.team/docs/relations-v1-v2)
- [升级到 v1 RC](https://orm.drizzle.team/docs/upgrade-v1)
