# Admin API 拆分实施计划

> **对于代理工作人员：** 所需的子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐个任务地实施此计划。步骤使用复选框 ( `- [ ]` ) 语法进行跟踪。

**目标：** 将当前的 `apps/api` 管理后端拆分为独立的 `apps/admin-api` 服务，同时提取共享合约、数据库架构和后端基础设施包。

**架构：** 迁移是分阶段进行的。首先将现有的共享枚举包重命名为 `@iam/contracts` ，然后将 Drizzle 架构/迁移提取到 `@iam/db` 中，然后将 Hono/tRPC/OpenAPI 基础设施提取到 `@iam/api-core` 中。现有 `apps/api` 在新包上稳定后，创建 `apps/admin-api` ，迁移管理员 REST/tRPC 和管理员拥有的服务/存储库代码，将 `apps/admin` 类型导入切换到 `@iam/admin-api/trpc` ，最后从 `apps/api` 中删除管理员暴露。

**技术堆栈：** pnpm 工作区、Turborepo、Bun、Hono、`@hono/zod-openapi`、tRPC v11、Drizzle ORM v1 RC、PostgreSQL、Redis、Umi Max、TypeScript。

---

## 文件结构

最终的结构应该是：

```text
apps/
  api/
    app.config.ts                    # auth/sso/public/open/internal only; no admin tier
    src/
      app.ts
      index.ts
      routes/
        auth/
        internal/
        open/
        public/
        sso/
      services/                      # core API services only
  admin-api/
    package.json
    tsconfig.json
    eslint.config.js
    app.config.ts
    src/
      app.ts
      index.ts
      env.ts
      routes/
        admin/
          _middleware.ts
          client/
          user/
          organization/
          position/
          employment/
        trpc/
          _middleware.ts
          trpc.index.ts
      services/
        client/
        user/
        organization/
        position/
        employment/
        role/
        privilege/
      trpc/
        trpc.router.ts
        routers/admin/index.ts
      types/lib.d.ts                 # app-specific Hono binding types
apps/admin/
  src/lib/api-client.ts              # imports AppRouter from @iam/admin-api/trpc
  .umirc.ts                          # /rpc dev proxy points to admin-api
packages/
  contracts/
    package.json                     # name @iam/contracts
    src/enums/*
    src/index.ts
  db/
    package.json                     # name @iam/db
    tsconfig.json
    drizzle.config.ts
    src/
      index.ts
      singleton.ts
      query-utils.ts
      schema/
      relations/
      migrations/
  api-core/
    package.json                     # name @iam/api-core
    tsconfig.json
    src/
      core/
      errors/
      http/
      logger/
      middlewares/
      redis/
      trpc/
      types/
      utils/
```

责任规则：

- `@iam/contracts` 是唯一前端安全的共享包。它可以导出枚举、状态代码和 UI 选项帮助程序。
- `@iam/db` 仅限后端，拥有 Drizzle 架构、关系、迁移、 `db` 、 `DbClient` 、 `DbTransaction` 和查询助手。
- `@iam/api-core` 仅限后端，拥有 Hono/tRPC/OpenAPI 基础设施。它不得导入 `apps/*` 或应用服务模块。
- `apps/admin-api` 可以从旧的管理实现中复制代码，但迁移后不得导入 `@api/services/*` 、 `@api/routes/admin/*` 或 `@api/trpc/*` 。

---

## 任务 0：基线检查

**文件：**
- 读取：`docs/superpowers/specs/2026-05-12-admin-api-split-design.md`
- 读取：`package.json`
- 读取：`pnpm-workspace.yaml`
- 读取：`turbo.json`

- [ ] **第 1 步：确认工作树是干净的**

Run:

```bash
git status --short
```

预期：无输出。如果输出存在，​​请检查它并避免覆盖用户更改。

- [ ] **步骤 2：运行基线类型检查**

Run:

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/admin typecheck
pnpm --filter @iam/sso typecheck
```

预期：每个命令都以代码 0 退出。如果命令在任何编辑之前失败，请在任务注释中记录失败，并仅在确定是否不相关后继续。

- [ ] **第 3 步：为当前 API 运行基线 lint**

Run:

```bash
pnpm --filter @iam/api lint
```

预期：以代码 0 退出或仅报告预先存在的警告。不要修复此任务中不相关的 lint 问题。

- [ ] **第 4 步：提交**

如果没有文件更改，则无需提交。

---

## 任务 1：将 `@iam/shared` 重命名为 `@iam/contracts`

**文件：**
- 移动：`packages/shared/` -> `packages/contracts/`
- 修改：`packages/contracts/package.json`
- 创建：`packages/contracts/eslint.config.js`
- 修改：`packages/contracts/tsconfig.json`
- 修改：`apps/api/package.json`
- 修改：`apps/admin/package.json`
- 修改：`apps/sso/package.json`
- 修改：在 `apps/api/src/` 、 `apps/admin/src/` 、 `apps/sso/src/` 、 `packages/contracts/src/` 下导入
- 修改：`apps/api/Dockerfile`
- 修改：`pnpm-lock.yaml`

- [ ] **第1步：移动包目录**

Run:

```bash
git mv packages/shared packages/contracts
```

预期：`packages/contracts/package.json` 存在且 `packages/shared` 不再存在。

- [ ] **第 2 步：重命名包**

编辑 `packages/contracts/package.json` 使其完全正确：

```json
{
  "name": "@iam/contracts",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "pnpm exec tsgo --noEmit"
  },
  "devDependencies": {
    "@antfu/eslint-config": "^8.0.0",
    "@typescript/native-preview": "7.0.0-dev.20260504.1",
    "eslint": "^10.0.0",
    "eslint-plugin-format": "^2.0.1",
    "typescript": "^6.0.3"
  }
}
```

- [ ] **第 3 步：为合约添加 lint 配置**

创建 `packages/contracts/eslint.config.js` ：

```js
import antfu from "@antfu/eslint-config";

export default antfu({
  formatters: true,
  stylistic: {
    semi: true,
    quotes: "double",
  },
  rules: {
    "max-len": [
      "warn",
      {
        code: 120,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
        ignoreUrls: true,
      },
    ],
  },
});
```

保留旧共享包中的 `packages/contracts/tsconfig.json` 。如果缺少 `include` ，请设置：

```json
"include": ["src/**/*"]
```

- [ ] **第 4 步：更新工作区依赖项**

将 `@iam/shared` 替换为 `@iam/contracts`：

```text
apps/api/package.json
apps/admin/package.json
apps/sso/package.json
```

依赖项应该是：

```json
"@iam/contracts": "workspace:*"
```

- [ ] **第 5 步：更新 TypeScript 导入**

Run:

```bash
rg -l '@iam/shared' apps packages | xargs perl -pi -e 's#@iam/shared#@iam/contracts#g'
```

预期：导入站点现在引用 `@iam/contracts` 。

- [ ] **第6步：更新API Dockerfile包复制路径**

在 `apps/api/Dockerfile` 中，替换包路径：

```dockerfile
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/contracts/ ./packages/contracts/
```

从 Dockerfile 中删除旧的 `packages/shared` 复制路径。

- [ ] **第 7 步：刷新锁定文件**

Run:

```bash
pnpm install --lockfile-only
```

预期： `pnpm-lock.yaml` 引用 `@iam/contracts` 而不是 `@iam/shared` 。

- [ ] **第 8 步：验证旧包名称是否已消失**

Run:

```bash
rg '@iam/shared|packages/shared' apps packages package.json pnpm-lock.yaml
```

预期：无输出。

- [ ] **步骤 9：验证类型检查**

Run:

```bash
pnpm --filter @iam/contracts typecheck
pnpm --filter @iam/contracts lint
pnpm --filter @iam/api typecheck
pnpm --filter @iam/admin typecheck
pnpm --filter @iam/sso typecheck
```

预期：所有三个命令均以代码 0 退出。

- [ ] **第 10 步：提交**

Run:

```bash
git add packages/contracts apps/api/package.json apps/admin/package.json apps/sso/package.json apps/api/Dockerfile pnpm-lock.yaml
git add -u packages/shared apps/api apps/admin apps/sso
git commit -m "refactor(contracts): 重命名共享契约包"
```

预期：一次集中提交仅包含包重命名和导入更新。

---

## 任务 2：将 Drizzle 数据库层提取到 `@iam/db` 中

**文件：**
- 创建：`packages/db/package.json`
- 创建：`packages/db/tsconfig.json`
- 创建：`packages/db/eslint.config.js`
- 创建：`packages/db/src/singleton.ts`
- 移动：`apps/api/src/db/schema/` -> `packages/db/src/schema/`
- 移动：`apps/api/src/db/relations/` -> `packages/db/src/relations/`
- 移动：`apps/api/src/db/migrations/` -> `packages/db/src/migrations/`
- 移动：`apps/api/src/db/index.ts` -> `packages/db/src/index.ts`
- 移动：`apps/api/src/db/query-utils.ts` -> `packages/db/src/query-utils.ts`
- 移动：`apps/api/drizzle.config.ts` -> `packages/db/drizzle.config.ts`
- 修改：`apps/api/package.json`
- 修改：在`apps/api/src/`下导入
- 修改：`apps/api/Dockerfile`
- 修改：`pnpm-lock.yaml`

- [ ] **第 1 步：创建包 shell**

创建 `packages/db/package.json` ：

```json
{
  "name": "@iam/db",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./relations": "./src/relations/index.ts",
    "./query-utils": "./src/query-utils.ts"
  },
  "scripts": {
    "lint": "eslint . drizzle.config.ts",
    "typecheck": "pnpm exec tsgo --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "@iam/contracts": "workspace:*",
    "drizzle-orm": "1.0.0-rc.1",
    "postgres": "^3.4.9",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@antfu/eslint-config": "^8.0.0",
    "@types/bun": "latest",
    "@typescript/native-preview": "7.0.0-dev.20260504.1",
    "drizzle-kit": "1.0.0-rc.1",
    "eslint": "^10.0.0",
    "eslint-plugin-format": "^2.0.1",
    "typescript": "^6.0.3"
  }
}
```

创建 `packages/db/tsconfig.json` ：

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],
    "moduleDetection": "force",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "paths": {
      "@db/*": ["./src/*"]
    },
    "allowImportingTsExtensions": true,
    "strict": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": false,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*", "drizzle.config.ts"]
}
```

创建 `packages/db/eslint.config.js` ：

```js
import antfu from "@antfu/eslint-config";

export default antfu({
  formatters: true,
  stylistic: {
    semi: true,
    quotes: "double",
  },
  rules: {
    "node/prefer-global/process": "off",
    "max-len": [
      "warn",
      {
        code: 120,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
        ignoreUrls: true,
      },
    ],
  },
});
```

- [ ] **第 2 步：移动数据库文件**

Run:

```bash
mkdir -p packages/db/src
git mv apps/api/src/db/schema packages/db/src/schema
git mv apps/api/src/db/relations packages/db/src/relations
git mv apps/api/src/db/migrations packages/db/src/migrations
git mv apps/api/src/db/query-utils.ts packages/db/src/query-utils.ts
git mv apps/api/src/db/index.ts packages/db/src/index.ts
git mv apps/api/drizzle.config.ts packages/db/drizzle.config.ts
```

预期：`apps/api/src/db` 没有留下架构、关系、迁移、索引或查询实用程序文件。

- [ ] **第3步：添加数据库本地单例**

创建 `packages/db/src/singleton.ts` ：

```ts
type Destroy<T> = (value: T) => void | Promise<void>;

const globalSingletons = globalThis as typeof globalThis & {
  __iamSingletons?: Map<string, unknown>;
  __iamSingletonDestroyers?: Map<string, Destroy<unknown>>;
};

function getStore() {
  globalSingletons.__iamSingletons ??= new Map<string, unknown>();
  globalSingletons.__iamSingletonDestroyers ??= new Map<string, Destroy<unknown>>();
  return {
    values: globalSingletons.__iamSingletons,
    destroyers: globalSingletons.__iamSingletonDestroyers,
  };
}

export function createSingleton<T>(
  key: string,
  factory: () => T,
  options: { destroy?: Destroy<T> } = {},
): T {
  const store = getStore();
  if (!store.values.has(key)) {
    const value = factory();
    store.values.set(key, value);
    if (options.destroy) {
      store.destroyers.set(key, options.destroy as Destroy<unknown>);
    }
  }
  return store.values.get(key) as T;
}
```

- [ ] **第 4 步：更新数据库包导入**

编辑 `packages/db/src/index.ts` ：

```ts
import { relations } from "./relations";
import { createSingleton } from "./singleton";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

function createQueryClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return postgres(connectionString);
}

const queryClient = createSingleton("postgres:drizzle", createQueryClient, {
  destroy: client => client.end(),
});

export const db = drizzle({
  client: queryClient,
  relations,
});

export default db;

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbClient = typeof db | DbTransaction;

export async function closeDb() {
  await queryClient.end();
}
```

编辑 `packages/db/src/relations/index.ts` 使其架构导入为：

```ts
import * as schema from "../schema";
```

编辑 `packages/db/src/relations/types.ts` 使其架构导入为：

```ts
import type * as schema from "../schema";
```

Run:

```bash
rg -l '@api/db/schema' packages/db/src | xargs -r perl -pi -e 's#@api/db/schema#@iam/db/schema#g'
rg -l '@api/enums' packages/db/src | xargs -r perl -pi -e 's#@api/enums#@iam/contracts#g'
```

预期：`rg '@api/' packages/db/src` 不返回任何输出。

- [ ] **第 5 步：更新 Drizzle 配置**

编辑 `packages/db/drizzle.config.ts` ：

```ts
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "",
  },
});
```

- [ ] **第 6 步：更新 API 导入以使用 `@iam/db` **

Run:

```bash
rg -l '@api/db/schema' apps/api/src | xargs -r perl -pi -e 's#@api/db/schema#@iam/db/schema#g'
rg -l '@api/db/query-utils' apps/api/src | xargs -r perl -pi -e 's#@api/db/query-utils#@iam/db/query-utils#g'
rg -l '@api/db"' apps/api/src | xargs -r perl -pi -e 's#@api/db"#@iam/db"#g'
```

预期：`rg '@api/db' apps/api/src` 不返回任何输出。

- [ ] **第 7 步：更新 API 包脚本和依赖项**

在 `apps/api/package.json` 中，添加：

```json
"@iam/db": "workspace:*"
```

更改数据库脚本以转发到 `@iam/db` ：

```json
"db:generate": "pnpm --filter @iam/db db:generate",
"db:migrate": "pnpm --filter @iam/db db:migrate",
"db:push": "pnpm --filter @iam/db db:push"
```

将 `drizzle-orm` 、 `postgres` 和 `drizzle-kit` 保留在 `apps/api/package.json` 中，直到审核 API 服务中的所有直接 `drizzle-orm` 导入。这些服务仍然导入 SQL 帮助程序，例如 `eq` 、 `and` 和 `count` 。

- [ ] **步骤 8：更新 Dockerfile 工作区包副本**

在 `apps/api/Dockerfile` 中，为 `packages/db` 添加包元数据和源代码复制行：

```dockerfile
COPY packages/db/package.json ./packages/db/
COPY packages/db/ ./packages/db/
```

保留任务 1 中的 `packages/contracts` 复制行。

- [ ] **步骤 9：刷新锁定文件并验证**

Run:

```bash
pnpm install --lockfile-only
pnpm --filter @iam/db typecheck
pnpm --filter @iam/api typecheck
pnpm --filter @iam/db lint
pnpm --filter @iam/api lint
```

预期：所有命令均以代码 0 退出。

- [ ] **步骤 10：验证 Drizzle 命令接线**

Run:

```bash
pnpm --filter @iam/db exec drizzle-kit --config drizzle.config.ts check
```

预期：drizzle-kit 加载 `packages/db/drizzle.config.ts` 并且不会因缺少架构路径而失败。如果 `check` 在此 drizzle-kit 版本中不可用，请运行 `pnpm --filter @iam/db db:generate --help` 并验证包命令是否解析。

- [ ] **第 11 步：提交**

Run:

```bash
git add packages/db apps/api/package.json apps/api/Dockerfile pnpm-lock.yaml
git add -u apps/api/src/db apps/api/drizzle.config.ts apps/api/src
git commit -m "refactor(db): 抽取数据库契约包"
```

---

## 任务3：提取API核心基础设施包

**文件：**
- 创建：`packages/api-core/package.json`
- 创建：`packages/api-core/tsconfig.json`
- 创建：`packages/api-core/eslint.config.js`
- 在`packages/api-core/src/`下创建目录
- 从 `apps/api/src/lib/core/` 移动或复制
- 从 `apps/api/src/errors/` 移动或复制
- 从 `apps/api/src/middlewares/error.handler.ts` 移动或复制
- 从 `apps/api/src/middlewares/not-found-handler.ts` 移动或复制
- 从 `apps/api/src/utils/http/response.ts` 移动或复制
- 从 `apps/api/src/utils/common.utils.ts` 移动或复制
- 从 `apps/api/src/utils/encryption.utils.ts` 移动或复制
- 从 `apps/api/src/utils/page.util.ts` 移动或复制
- 从 `apps/api/src/utils/tools/glob.ts` 移动或复制
- 从 `apps/api/src/utils/zod/env-validator.ts` 移动或复制
- 从 `apps/api/src/lib/logger/index.ts` 移动或复制
- 从 `apps/api/src/lib/clients/redis.ts` 移动或复制
- 从 `apps/api/src/trpc/trpc.ts` 移动或复制
- 修改：`apps/api/package.json`
- 修改：在`apps/api/src/`下导入
- 修改：`pnpm-lock.yaml`

- [ ] **第 1 步：创建包元数据**

创建 `packages/api-core/package.json` ：

```json
{
  "name": "@iam/api-core",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./core": "./src/core/index.ts",
    "./errors": "./src/errors/index.ts",
    "./http": "./src/http/index.ts",
    "./logger": "./src/logger/index.ts",
    "./middlewares": "./src/middlewares/index.ts",
    "./redis": "./src/redis/index.ts",
    "./trpc": "./src/trpc/index.ts",
    "./types": "./src/types/lib.ts",
    "./utils": "./src/utils/index.ts"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "pnpm exec tsgo --noEmit"
  },
  "dependencies": {
    "@hono/zod-openapi": "^1.1.4",
    "@iam/contracts": "workspace:*",
    "@scalar/hono-api-reference": "^0.10.7",
    "@trpc/server": "^11.16.0",
    "hono": "^4.12.8",
    "hono-pino": "^0.10.3",
    "ioredis": "^5.8.1",
    "pino": "^10.3.1",
    "pino-pretty": "^13.1.3",
    "sm-crypto": "^0.3.13",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@antfu/eslint-config": "^8.0.0",
    "@types/bun": "latest",
    "@types/sm-crypto": "^0.3.4",
    "@typescript/native-preview": "7.0.0-dev.20260504.1",
    "eslint": "^10.0.0",
    "eslint-plugin-format": "^2.0.1",
    "typescript": "^6.0.3"
  }
}
```

使用与 `apps/api/tsconfig.json` 相同的编译器选项创建 `packages/api-core/tsconfig.json` ，并将路径替换为：

```json
"paths": {
  "@api-core/*": ["./src/*"]
}
```

通过复制 `apps/api/eslint.config.js` 并将 `ignores` 更改为以下内容来创建 `packages/api-core/eslint.config.js`：

```js
ignores: []
```

- [ ] **第 2 步：移动纯基础设施文件**

Run:

```bash
mkdir -p packages/api-core/src/{core,errors,http,logger,middlewares,redis,trpc,types,utils}
cp -R apps/api/src/lib/core/* packages/api-core/src/core/
cp -R apps/api/src/errors/* packages/api-core/src/errors/
cp apps/api/src/middlewares/error.handler.ts packages/api-core/src/middlewares/error-handler.ts
cp apps/api/src/middlewares/not-found-handler.ts packages/api-core/src/middlewares/not-found-handler.ts
cp apps/api/src/utils/http/response.ts packages/api-core/src/http/response.ts
cp apps/api/src/utils/common.utils.ts packages/api-core/src/utils/common.ts
cp apps/api/src/utils/encryption.utils.ts packages/api-core/src/utils/encryption.ts
cp apps/api/src/utils/page.util.ts packages/api-core/src/utils/page.ts
cp apps/api/src/utils/tools/glob.ts packages/api-core/src/utils/glob.ts
cp apps/api/src/utils/zod/env-validator.ts packages/api-core/src/utils/env-validator.ts
cp apps/api/src/lib/logger/index.ts packages/api-core/src/logger/index.ts
cp apps/api/src/lib/clients/redis.ts packages/api-core/src/redis/index.ts
cp apps/api/src/trpc/trpc.ts packages/api-core/src/trpc/index.ts
cp apps/api/src/types/lib.d.ts packages/api-core/src/types/lib.ts
```

预期：文件已复制，尚未从 `apps/api` 中删除。保留副本直到 `apps/api` 导入更新通过可以使回滚更容易。

- [ ] **第3步：添加包桶导出**

创建 `packages/api-core/src/index.ts` ：

```ts
export * from "./core";
export * from "./errors";
export * from "./http";
export * from "./logger";
export * from "./middlewares";
export * from "./redis";
export * from "./trpc";
export * from "./utils";
```

创建 `packages/api-core/src/core/index.ts` ：

```ts
export * from "./business-op";
export * from "./create-app";
export * from "./create-router";
export * from "./define-config";
export * as HttpStatusCodes from "./http-status-codes";
export * as HttpStatusPhrases from "./http-status-phrases";
export * from "./pagination/schema";
export * from "./pagination/type";
export * from "./singleton";
```

创建 `packages/api-core/src/errors/index.ts` ：

```ts
export * from "./AuthzError";
export * from "./AuthzForbiddenError";
export * from "./AuthzMaintaincingError";
export * from "./AuthzUnauthorizedError";
export * from "./CustomError";
export * from "./EmploymentNotEditableError";
export * from "./EmploymentNotFoundError";
export * from "./OrganizationHasChildrenError";
export * from "./OrganizationHasEmploymentError";
export * from "./PositionHasEmploymentError";
export * from "./UserHasActiveEmploymentError";
export * from "./UserNotFoundError";
```

创建 `packages/api-core/src/http/index.ts` ：

```ts
export * from "./response";
```

创建 `packages/api-core/src/middlewares/index.ts` ：

```ts
export * from "./auth";
export * from "./error-handler";
export { default as notFound } from "./not-found-handler";
```

创建 `packages/api-core/src/utils/index.ts` ：

```ts
export * from "./common";
export * from "./encryption";
export * from "./env-validator";
export * from "./glob";
export * from "./page";
```

- [ ] **第 4 步：使记录器和 Redis 环境注入**

编辑 `packages/api-core/src/logger/index.ts` 以删除 `@api/env` 并导出工厂：

```ts
import type { TransportTargetOptions } from "pino";
import pino from "pino";
import { createSingleton } from "../core/singleton";

export type LoggerConfig = {
  nodeEnv: string;
  logLevel?: string;
};

function buildTransportTargets(config: LoggerConfig): TransportTargetOptions[] {
  const level = config.logLevel || "info";
  if (config.nodeEnv === "development") {
    return [{ target: "pino-pretty", level, options: {} }];
  }
  return [{ target: "pino/file", level, options: { destination: 1 } }];
}

export function createLogger(config: LoggerConfig) {
  return createSingleton("logger", () =>
    pino({ level: config.logLevel || "info" }, pino.transport({ targets: buildTransportTargets(config) })));
}
```

编辑 `packages/api-core/src/redis/index.ts` 以删除 `@api/env` 并导出工厂：

```ts
import Redis from "ioredis";
import { createSingleton } from "../core/singleton";

export type RedisConfig = {
  host: string;
  port: number;
  password?: string;
  db: number;
};

export function createRedisClient(config: RedisConfig) {
  return createSingleton<Redis>(
    `redis:${config.host}:${config.port}:${config.db}`,
    () => new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
    }),
    { destroy: async client => void await client.quit() },
  );
}
```

- [ ] **第 5 步：使核心类型与应用程序无关**

编辑 `packages/api-core/src/types/lib.ts` ：

```ts
import type { RouteConfig as HonoRouteConfig, RouteHandler } from "@hono/zod-openapi";

export type BaseVariables = {
  logger: PinoLogger;
  requestId: string;
  tierBasePath: string;
};

export type UserVariables<TUserDetail = unknown> = {
  userId: number;
  username: string;
  userDetailDto: TUserDetail;
};

export type BaseBindings = {
  Variables: BaseVariables;
};

export type AuthenticatedBindings<TUserDetail = unknown> = {
  Variables: UserVariables<TUserDetail> & BaseVariables;
};

export type PublicBindings<TUserDetail = unknown> = AuthenticatedBindings<TUserDetail>;

export type PublicRouteHandler<R extends HonoRouteConfig, TUserDetail = unknown> =
  RouteHandler<R, PublicBindings<TUserDetail>>;

export type BaseRouteHandler<R extends HonoRouteConfig> = RouteHandler<R, BaseBindings>;
```

- [ ] **第 6 步：使 `define-config` 环境中性**

编辑 `packages/api-core/src/core/define-config.ts` 使 `OpenAPIConfig.enabled` 接受 `Record<string, unknown>` ：

```ts
export type OpenAPIConfig = {
  enabled?: boolean | ((env: Record<string, unknown>) => boolean);
  version?: string;
  docEndpoint?: string;
  scalar?: Partial<ApiReferenceConfiguration>;
};
```

保持其余 `TierConfig` 、 `RpcConfig` 和 `AppConfig` 导出不变。

- [ ] **第 7 步：使 `createApp` 应用程序提供**

编辑 `packages/api-core/src/core/create-app.ts` 以便导出：

```ts
export type CreateAppOptions = {
  env: Record<string, unknown>;
  logger: import("pino").Logger;
  routes: Record<string, { default: AnyRouter }>;
  middlewares: Record<string, { default: TierMiddleware[] }>;
};

export default function createApp(config: AppConfig, options: CreateAppOptions) {
  const app = createRouter();
  const allMiddlewares = options.middlewares;
  const allRoutes = options.routes;
  // keep the existing body, replacing env with options.env and logger with options.logger
}
```

实现不得在内部调用 `globImport`。每个应用程序都会从​​其自己的源树传递 `import.meta.glob` 结果。

- [ ] **步骤 8：添加可注入的身份验证中间件工厂**

创建 `packages/api-core/src/middlewares/auth.ts` ：

```ts
import type { Context, Next } from "hono";
import type { Redis } from "ioredis";
import { AuthzForbiddenError } from "../errors/AuthzForbiddenError";
import { AuthzUnauthorizedError } from "../errors/AuthzUnauthorizedError";
import { CustomError } from "../errors/CustomError";
import { reviveIsoDates } from "../utils/common";
import { deleteCookie, getCookie } from "hono/cookie";
import { z } from "zod";

export type SessionUser = {
  id: number;
  username: string;
  roles: string[];
};

export type SessionAuthOptions<TUser extends SessionUser> = {
  redis: Redis;
  userSchema: z.ZodType<TUser>;
};

export type AdminAuthOptions<TUser extends SessionUser> = SessionAuthOptions<TUser> & {
  allowedClientCodes: string[];
  adminRoleCodes: string[];
};

async function readSessionUser<TUser extends SessionUser>(
  c: Context,
  options: SessionAuthOptions<TUser>,
): Promise<TUser> {
  const clientCode = c.req.header("Client");
  const sessionId = clientCode === "iam"
    ? getCookie(c, "global_session") ?? c.req.header("Authorization") ?? null
    : getCookie(c, `local_${clientCode}_session`) ?? c.req.header("Authorization") ?? null;

  if (!clientCode) {
    throw new CustomError("非法请求");
  }
  if (!sessionId) {
    throw new AuthzUnauthorizedError("未登录");
  }

  const redisKey = clientCode === "iam"
    ? `global_session:${sessionId}`
    : `local_${clientCode}_session:${sessionId}`;
  const userString = await options.redis.get(redisKey);
  if (!userString) {
    deleteCookie(c, clientCode === "iam" ? `global_session:${sessionId}` : `local_${clientCode}_session:${sessionId}`);
    deleteCookie(c, "orcas_sso_sessionid");
    throw new AuthzUnauthorizedError("未登录");
  }

  return options.userSchema.parse(JSON.parse(userString, reviveIsoDates));
}

export function createPublicAuthenticationHandler<TUser extends SessionUser>(
  options: SessionAuthOptions<TUser>,
) {
  return async (c: Context, next: Next) => {
    const user = await readSessionUser(c, options);
    c.set("userId", user.id);
    c.set("username", user.username);
    c.set("userDetailDto", user);
    return await next();
  };
}

export function createAdminAuthenticationHandler<TUser extends SessionUser>(
  options: AdminAuthOptions<TUser>,
) {
  return async (c: Context, next: Next) => {
    const clientCode = c.req.header("Client");
    if (!clientCode || !options.allowedClientCodes.includes(clientCode)) {
      throw new AuthzForbiddenError("无管理端访问权限");
    }

    const user = await readSessionUser(c, options);
    const hasAdminRole = user.roles.some(role => options.adminRoleCodes.includes(role));
    if (!hasAdminRole) {
      throw new AuthzForbiddenError("无管理端访问权限");
    }

    c.set("userId", user.id);
    c.set("username", user.username);
    c.set("userDetailDto", user);
    return await next();
  };
}

export function createInternalAuthenticationHandler<TClient>(
  options: { getClientBySecret: (secret: string) => Promise<TClient | null> },
) {
  return async (c: Context, next: Next) => {
    const clientSecret = c.req.header("apikey");
    if (!clientSecret) {
      throw new AuthzUnauthorizedError("非法访问");
    }
    const clientDto = await options.getClientBySecret(clientSecret);
    if (!clientDto) {
      throw new AuthzUnauthorizedError("无效secret");
    }
    return await next();
  };
}
```

- [ ] **第 9 步：更新 `@iam/api-core` 内复制的导入 **

Run:

```bash
rg -l '@api/enums/service.status' packages/api-core/src | xargs -r perl -pi -e 's#@api/enums/service.status#@iam/contracts#g'
rg -l '@api/errors' packages/api-core/src | xargs -r perl -pi -e 's#@api/errors#@iam/api-core/errors#g'
rg -l '@api/utils/http/response' packages/api-core/src | xargs -r perl -pi -e 's#@api/utils/http/response#@iam/api-core/http#g'
rg -l '@api/lib/core' packages/api-core/src | xargs -r perl -pi -e 's#@api/lib/core#@iam/api-core/core#g'
rg -l '@api/trpc/trpc' packages/api-core/src | xargs -r perl -pi -e 's#@api/trpc/trpc#@iam/api-core/trpc#g'
```

然后通过运行以下命令修复剩余的相对导入：

```bash
rg '@api/' packages/api-core/src
```

预期：无输出。

- [ ] **第 10 步：更新 `apps/api` 以使用 `@iam/api-core` **

在 `apps/api/package.json` 中，添加：

```json
"@iam/api-core": "workspace:*"
```

创建 `apps/api/src/lib/logger/index.ts` 作为应用程序级记录器包装器：

```ts
import env from "@api/env";
import { createLogger } from "@iam/api-core/logger";

export const logger = createLogger({
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
});
```

创建 `apps/api/src/lib/clients/redis.ts` 作为应用程序级 Redis 包装器：

```ts
import env from "@api/env";
import { createRedisClient } from "@iam/api-core/redis";

const redis = createRedisClient({
  host: env.REDIS_URL,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  db: env.REDIS_DB,
});

export default redis;
```

保留这些包装器，以便现有应用程序服务可以导入 `@api/lib/logger` 和 `@api/lib/clients/redis` 直到稍后清理。

- [ ] **步骤 11：更新应用程序级 `createApp` 接线**

编辑 `apps/api/src/app.ts` ：

```ts
/* eslint-disable antfu/no-top-level-await */
import createApp from "@iam/api-core/core/create-app";
import appConfig from "~api/app.config";
import env from "./env";
import { logger } from "./lib/logger";

const routes = import.meta.glob("./routes/**/*.index.ts", { eager: true }) as Record<string, { default: any }>;
const middlewares = import.meta.glob("./routes/*/_middleware.ts", { eager: true }) as Record<string, { default: any[] }>;

const app = createApp(appConfig, {
  env,
  logger,
  routes,
  middlewares,
});

export type AppType = typeof app;
export default app;
```

- [ ] **步骤 12：更新提取的基础设施的导入**

Run:

```bash
rg -l '@api/lib/core' apps/api/src | xargs -r perl -pi -e 's#@api/lib/core#@iam/api-core/core#g'
rg -l '@api/errors' apps/api/src | xargs -r perl -pi -e 's#@api/errors#@iam/api-core/errors#g'
rg -l '@api/utils/http/response' apps/api/src | xargs -r perl -pi -e 's#@api/utils/http/response#@iam/api-core/http#g'
rg -l '@api/utils/page.util' apps/api/src | xargs -r perl -pi -e 's#@api/utils/page.util#@iam/api-core/utils#g'
rg -l '@api/utils/common.utils' apps/api/src | xargs -r perl -pi -e 's#@api/utils/common.utils#@iam/api-core/utils#g'
rg -l '@api/utils/encryption.utils' apps/api/src | xargs -r perl -pi -e 's#@api/utils/encryption.utils#@iam/api-core/utils#g'
rg -l '@api/types/lib' apps/api/src | xargs -r perl -pi -e 's#@api/types/lib#@iam/api-core/types#g'
rg -l '@api/trpc/trpc' apps/api/src | xargs -r perl -pi -e 's#@api/trpc/trpc#@iam/api-core/trpc#g'
```

预期：导入现在指向 `@iam/api-core` ，但应用程序级包装器 `@api/lib/logger` 和 `@api/lib/clients/redis` 除外。

- [ ] **步骤 13：替换 `apps/api` 中的身份验证中间件实现 **

编辑 `apps/api/src/middlewares/authentication.handler.ts` ：

```ts
import redis from "@api/lib/clients/redis";
import * as clientService from "@api/services/client/client.service";
import { UserDetailDtoSchema } from "@api/services/user/user.schema";
import {
  createInternalAuthenticationHandler,
  createPublicAuthenticationHandler,
} from "@iam/api-core/middlewares";

export const publicAuthenticationHandler = createPublicAuthenticationHandler({
  redis,
  userSchema: UserDetailDtoSchema,
});

export const internalAuthenticationHandler = createInternalAuthenticationHandler({
  getClientBySecret: clientService.getClientBySecret,
});
```

- [ ] **步骤 14：验证包边界**

Run:

```bash
rg '@api/' packages/api-core/src
rg 'apps/' packages/api-core/src
```

预期：两个命令都不会产生输出。

- [ ] **第 15 步：刷新锁定文件并验证**

Run:

```bash
pnpm install --lockfile-only
pnpm --filter @iam/api-core typecheck
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api-core lint
pnpm --filter @iam/api lint
```

预期：所有命令均以代码 0 退出。

- [ ] **第 16 步：提交**

Run:

```bash
git add packages/api-core apps/api/package.json apps/api/src pnpm-lock.yaml
git commit -m "refactor(api-core): 抽取后端基础设施包"
```

---

## 任务 4：脚手架 `apps/admin-api`

**文件：**
- 创建：`apps/admin-api/package.json`
- 创建：`apps/admin-api/tsconfig.json`
- 创建：`apps/admin-api/eslint.config.js`
- 创建：`apps/admin-api/app.config.ts`
- 创建：`apps/admin-api/src/env.ts`
- 创建：`apps/admin-api/src/app.ts`
- 创建：`apps/admin-api/src/index.ts`
- 创建：`apps/admin-api/src/types/lib.d.ts`
- 修改：`pnpm-lock.yaml`

- [ ] **第 1 步：创建包元数据**

创建 `apps/admin-api/package.json` ：

```json
{
  "name": "@iam/admin-api",
  "type": "module",
  "version": "1.0.0",
  "private": true,
  "exports": {
    ".": "./src/app.ts",
    "./trpc": "./src/trpc/trpc.router.ts"
  },
  "module": "index.ts",
  "devEngines": {
    "runtime": {
      "name": "bun"
    }
  },
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "serve": "bun run src/index.ts",
    "lint": "eslint .",
    "lint:fix": "eslint --fix src/",
    "typecheck": "pnpm exec tsgo --noEmit"
  },
  "dependencies": {
    "@hono/zod-openapi": "^1.1.4",
    "@iam/api-core": "workspace:*",
    "@iam/contracts": "workspace:*",
    "@iam/db": "workspace:*",
    "@scalar/hono-api-reference": "^0.10.7",
    "@trpc/server": "^11.16.0",
    "bcrypt-ts": "^7.1.0",
    "drizzle-orm": "1.0.0-rc.1",
    "hono": "^4.12.8",
    "hono-pino": "^0.10.3",
    "ioredis": "^5.8.1",
    "pino": "^10.3.1",
    "pino-pretty": "^13.1.3",
    "postgres": "^3.4.9",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@antfu/eslint-config": "^8.0.0",
    "@types/bun": "latest",
    "@typescript/native-preview": "7.0.0-dev.20260504.1",
    "eslint": "^10.0.0",
    "eslint-plugin-format": "^2.0.1",
    "typescript": "^6.0.3"
  }
}
```

- [ ] **第 2 步：创建 TypeScript 和 ESLint 配置**

创建 `apps/admin-api/tsconfig.json` ：

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "jsx": "react-jsx",
    "lib": ["ESNext"],
    "moduleDetection": "force",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "paths": {
      "@admin-api/*": ["./src/*"],
      "~admin-api/*": ["./*"]
    },
    "allowImportingTsExtensions": true,
    "allowJs": true,
    "strict": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": false,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  }
}
```

通过复制 `apps/api/eslint.config.js` 创建 `apps/admin-api/eslint.config.js` ，保留双引号和分号。

- [ ] **第 3 步：创建管理 API 环境架构**

创建 `apps/admin-api/src/env.ts` ：

```ts
import { z } from "@hono/zod-openapi";

const EnvSchema = z.object({
  PASSWORD_HASH_ROUNDS: z.coerce.number().default(10),
  PORT: z.coerce.number().default(30001),
  NODE_ENV: z.string().default("development"),
  REDIS_URL: z.string(),
  REDIS_PORT: z.coerce.number(),
  REDIS_PASSWORD: z.string().optional().transform(value => value || undefined),
  REDIS_DB: z.coerce.number(),
  LOG_LEVEL: z.string().default("info"),
  ADMIN_CLIENT_CODES: z.string().default("iam"),
  ADMIN_ROLE_CODES: z.string().default("iam:admin"),
});

export type Env = z.infer<typeof EnvSchema>;

const env = EnvSchema.parse(process.env);

export default env;
```

- [ ] **第 4 步：创建应用程序配置**

创建 `apps/admin-api/app.config.ts` ：

```ts
import { defineConfig } from "@iam/api-core/core";

export default defineConfig({
  prefix: "",
  version: "1.0.0",
  openapi: {
    enabled: env => env.NODE_ENV !== "production",
    docEndpoint: "/doc",
    scalar: {
      theme: "elysiajs",
      layout: "modern",
      defaultHttpClient: { targetKey: "js", clientKey: "fetch" },
      cdn: "/static/scalar/api-reference.js",
    },
  },
  tiers: [
    { name: "admin", title: "管理端API" },
    { name: "rpc", title: "管理端RPC API", routeDir: "trpc" },
  ],
});
```

- [ ] **第 5 步：创建应用程序和入口点**

创建 `apps/admin-api/src/app.ts` ：

```ts
/* eslint-disable antfu/no-top-level-await */
import createApp from "@iam/api-core/core/create-app";
import { createLogger } from "@iam/api-core/logger";
import appConfig from "~admin-api/app.config";
import env from "./env";

const logger = createLogger({
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
});

const routes = import.meta.glob("./routes/**/*.index.ts", { eager: true }) as Record<string, { default: any }>;
const middlewares = import.meta.glob("./routes/*/_middleware.ts", { eager: true }) as Record<string, { default: any[] }>;

const app = createApp(appConfig, {
  env,
  logger,
  routes,
  middlewares,
});

export type AdminApiAppType = typeof app;
export default app;
```

创建 `apps/admin-api/src/index.ts` ：

```ts
import app from "./app";
import env from "./env";

export default {
  port: env.PORT,
  fetch: app.fetch,
};
```

- [ ] **第 6 步：添加特定于应用程序的绑定类型**

创建 `apps/admin-api/src/types/lib.d.ts` ：

```ts
import type { PublicBindings as CorePublicBindings, PublicRouteHandler as CorePublicRouteHandler } from "@iam/api-core/types";
import type { RouteConfig as HonoRouteConfig } from "@hono/zod-openapi";

export type AdminBindings = CorePublicBindings;
export type AdminRouteHandler<R extends HonoRouteConfig> = CorePublicRouteHandler<R>;
```

- [ ] **第 7 步：刷新锁定文件并验证脚手架**

Run:

```bash
pnpm install --lockfile-only
pnpm --filter @iam/admin-api typecheck
pnpm --filter @iam/admin-api lint
```

预期：两个命令均以代码 0 退出。

- [ ] **第 8 步：提交**

```bash
git add apps/admin-api pnpm-lock.yaml
git commit -m "feat(admin-api): 初始化管理后端服务"
```

---

## 任务 5：迁移管理路由、tRPC 和管理员拥有的服务

**文件：**
- 创建：`apps/admin-api/src/routes/admin/**`
- 创建：`apps/admin-api/src/routes/trpc/**`
- 创建：`apps/admin-api/src/trpc/**`
- 创建：`apps/admin-api/src/services/client/**`
- 创建：`apps/admin-api/src/services/user/**`
- 创建：`apps/admin-api/src/services/organization/**`
- 创建：`apps/admin-api/src/services/position/**`
- 创建：`apps/admin-api/src/services/employment/**`
- 创建：`apps/admin-api/src/services/role/**`
- 创建：`apps/admin-api/src/services/privilege/**`
- 修改 `apps/admin-api/src/` 下的导入

- [ ] **第 1 步：复制管理路由和 tRPC 文件**

Run:

```bash
mkdir -p apps/admin-api/src/routes apps/admin-api/src/trpc
cp -R apps/api/src/routes/admin apps/admin-api/src/routes/admin
cp -R apps/api/src/routes/trpc apps/admin-api/src/routes/trpc
cp -R apps/api/src/trpc/* apps/admin-api/src/trpc/
```

预期： `apps/admin-api/src/routes/admin` 包含 `client` 、 `user` 、 `organization` 、 `position` 、 `employment` 。

- [ ] **步骤 2：复制管理员所需的服务文件**

Run:

```bash
mkdir -p apps/admin-api/src/services
cp -R apps/api/src/services/client apps/admin-api/src/services/client
cp -R apps/api/src/services/user apps/admin-api/src/services/user
cp -R apps/api/src/services/organization apps/admin-api/src/services/organization
cp -R apps/api/src/services/position apps/admin-api/src/services/position
cp -R apps/api/src/services/employment apps/admin-api/src/services/employment
cp -R apps/api/src/services/role apps/admin-api/src/services/role
cp -R apps/api/src/services/privilege apps/admin-api/src/services/privilege
```

预期： admin-api 有自己的管理服务/存储库代码副本，并且对 `apps/api/src/services` 没有运行时依赖性。

- [ ] **第 3 步：更新 admin-api 导入**

在 `apps/admin-api/src` 内运行这些替换：

```bash
rg -l '@api/db/schema' apps/admin-api/src | xargs -r perl -pi -e 's#@api/db/schema#@iam/db/schema#g'
rg -l '@api/db/query-utils' apps/admin-api/src | xargs -r perl -pi -e 's#@api/db/query-utils#@iam/db/query-utils#g'
rg -l '@api/db"' apps/admin-api/src | xargs -r perl -pi -e 's#@api/db"#@iam/db"#g'
rg -l '@api/enums' apps/admin-api/src | xargs -r perl -pi -e 's#@api/enums/[^\";]+#@iam/contracts#g'
rg -l '@api/lib/core' apps/admin-api/src | xargs -r perl -pi -e 's#@api/lib/core#@iam/api-core/core#g'
rg -l '@api/errors' apps/admin-api/src | xargs -r perl -pi -e 's#@api/errors#@iam/api-core/errors#g'
rg -l '@api/utils/http/response' apps/admin-api/src | xargs -r perl -pi -e 's#@api/utils/http/response#@iam/api-core/http#g'
rg -l '@api/utils/page.util' apps/admin-api/src | xargs -r perl -pi -e 's#@api/utils/page.util#@iam/api-core/utils#g'
rg -l '@api/utils/common.utils' apps/admin-api/src | xargs -r perl -pi -e 's#@api/utils/common.utils#@iam/api-core/utils#g'
rg -l '@api/utils/encryption.utils' apps/admin-api/src | xargs -r perl -pi -e 's#@api/utils/encryption.utils#@iam/api-core/utils#g'
rg -l '@api/types/lib' apps/admin-api/src | xargs -r perl -pi -e 's#@api/types/lib#@admin-api/types/lib#g'
rg -l '@api/routes/admin' apps/admin-api/src | xargs -r perl -pi -e 's#@api/routes/admin#@admin-api/routes/admin#g'
rg -l '@api/services' apps/admin-api/src | xargs -r perl -pi -e 's#@api/services#@admin-api/services#g'
rg -l '@api/trpc/trpc' apps/admin-api/src | xargs -r perl -pi -e 's#@api/trpc/trpc#@iam/api-core/trpc#g'
rg -l '@api/trpc' apps/admin-api/src | xargs -r perl -pi -e 's#@api/trpc#@admin-api/trpc#g'
```

然后检查：

```bash
rg '@api/' apps/admin-api/src
```

预期：手动修复后没有输出。

- [ ] **第 4 步：加强 admin-api 绑定类型**

编辑 `apps/admin-api/src/types/lib.d.ts` ：

```ts
import type { PublicBindings as CorePublicBindings, PublicRouteHandler as CorePublicRouteHandler } from "@iam/api-core/types";
import type { RouteConfig as HonoRouteConfig } from "@hono/zod-openapi";
import type { UserDetailDto } from "@admin-api/services/user/user.type";

export type AdminBindings = CorePublicBindings<UserDetailDto>;
export type AdminRouteHandler<R extends HonoRouteConfig> = CorePublicRouteHandler<R, UserDetailDto>;
```

- [ ] **步骤 5：删除非管理服务依赖项**

编辑 `apps/admin-api/src/services/user/user.service.ts` ，使其不导入 `mobile.service` 、 `session.service` 或其他仅限核心的服务。保留 `routes/admin/user/user.ops.ts` 使用的管理功能：

```ts
export async function getUserDetailByUsernameForAdmin(username: string): Promise<UserDetailDto>;
export async function searchUsersFuzzyForAdmin(userPageQuery: UserPaginationQueryDto);
export async function setUserForAdmin(dto: {
  username: string;
  name: string;
  userType: string;
  password?: string;
  mobile?: string | null;
  wxId?: string | null;
  status?: number;
  orderNum?: number;
}): Promise<{ username: string; generatedPassword: string | null }>;
export async function updateUser(username: string, data: {
  name?: string;
  mobile?: string | null;
  wxId?: string | null;
  userType?: string;
  status?: number;
  orderNum?: number;
}): Promise<boolean>;
export async function updateUserStatus(username: string, status: number): Promise<boolean>;
export async function deleteUser(username: string): Promise<boolean>;
export async function resetPasswordByUsername(username: string): Promise<string>;
```

从此管理副本中删除仅支持公共密码重置、移动设备绑定或 SSO 登录流程的功能。

- [ ] **第 6 步：将管理操作保留为共享 REST/tRPC 层**

验证这些文件是否导入本地 admin-api 服务：

```bash
rg '@admin-api/services' apps/admin-api/src/routes/admin
```

预期：匹配 `*.ops.ts` 和 `client.handlers.ts` 。

- [ ] **步骤 7：验证没有保留旧的 API 服务导入**

Run:

```bash
rg '@api/services|@api/routes/admin|@api/trpc|@api/db|@api/lib/core|@api/errors' apps/admin-api/src
```

预期：无输出。

- [ ] **第 8 步：类型检查 admin-api**

Run:

```bash
pnpm --filter @iam/admin-api typecheck
```

预期：以代码 0 退出。修复 `apps/admin-api` 内剩余的导入和类型错误，而不更改 `apps/api` 。

- [ ] **第 9 步：Lint admin-api**

Run:

```bash
pnpm --filter @iam/admin-api lint
```

预期：退出时显示代码 0 或仅与现有 API 样式匹配的警告级别 `max-len` 消息。

- [ ] **第 10 步：提交**

Run:

```bash
git add apps/admin-api pnpm-lock.yaml
git commit -m "feat(admin-api): 迁移管理端路由和服务"
```

---

## 任务 6：将管理员身份验证添加到管理 API

**文件：**
- 修改：`apps/admin-api/src/routes/admin/_middleware.ts`
- 修改：`apps/admin-api/src/routes/trpc/_middleware.ts`
- 创建或修改：`apps/admin-api/src/lib/clients/redis.ts`
- 修改：`apps/admin-api/src/env.ts`

- [ ] **第 1 步：为 admin-api 添加 Redis 包装器**

创建 `apps/admin-api/src/lib/clients/redis.ts` ：

```ts
import env from "@admin-api/env";
import { createRedisClient } from "@iam/api-core/redis";

const redis = createRedisClient({
  host: env.REDIS_URL,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  db: env.REDIS_DB,
});

export default redis;
```

- [ ] **第 2 步：为白名单添加环境帮助程序**

编辑 `apps/admin-api/src/env.ts` 导出：

```ts
export const adminClientCodes = env.ADMIN_CLIENT_CODES.split(",")
  .map(code => code.trim())
  .filter(Boolean);

export const adminRoleCodes = env.ADMIN_ROLE_CODES.split(",")
  .map(code => code.trim())
  .filter(Boolean);
```

- [ ] **第 3 步：保护 `/admin/*` **

编辑 `apps/admin-api/src/routes/admin/_middleware.ts` ：

```ts
import redis from "@admin-api/lib/clients/redis";
import { UserDetailDtoSchema } from "@admin-api/services/user/user.schema";
import { adminClientCodes, adminRoleCodes } from "@admin-api/env";
import { defineMiddleware } from "@iam/api-core/core";
import { createAdminAuthenticationHandler } from "@iam/api-core/middlewares";

export default defineMiddleware([
  createAdminAuthenticationHandler({
    redis,
    userSchema: UserDetailDtoSchema,
    allowedClientCodes: adminClientCodes,
    adminRoleCodes,
  }),
]);
```

- [ ] **第 4 步：保护 `/rpc` **

编辑 `apps/admin-api/src/routes/trpc/_middleware.ts` ：

```ts
import redis from "@admin-api/lib/clients/redis";
import { UserDetailDtoSchema } from "@admin-api/services/user/user.schema";
import { adminClientCodes, adminRoleCodes } from "@admin-api/env";
import { defineMiddleware } from "@iam/api-core/core";
import { createAdminAuthenticationHandler } from "@iam/api-core/middlewares";

export default defineMiddleware([
  createAdminAuthenticationHandler({
    redis,
    userSchema: UserDetailDtoSchema,
    allowedClientCodes: adminClientCodes,
    adminRoleCodes,
  }),
]);
```

- [ ] **步骤 5：通过类型检查验证身份验证行为**

Run:

```bash
pnpm --filter @iam/admin-api typecheck
pnpm --filter @iam/admin-api lint
```

预期：两个命令均以代码 0 退出。

- [ ] **第 6 步：可选的局部烟雾测试**

如果 Redis 和开发数据库正在运行，请启动 admin-api：

```bash
pnpm --filter @iam/admin-api dev
```

然后在另一个终端运行：

```bash
curl -i -H 'Client: iam' http://localhost:30001/admin/doc
curl -i -H 'Client: iam' http://localhost:30001/rpc
```

预期：没有有效会话的受保护路由请求返回 401。如果 `createApp` 在层中间件之前注册文档，则 OpenAPI 文档端点可能保持未经身份验证的状态；记录观察到的行为并保护路由处理程序。

- [ ] **第 7 步：提交**

Run:

```bash
git add apps/admin-api/src
git commit -m "feat(admin-api): 增加管理端鉴权"
```

---

## 任务 7：切换管理前端类型合约和开发代理

**文件：**
- 修改：`apps/admin/package.json`
- 修改：`apps/admin/src/lib/api-client.ts`
- 修改：`apps/admin/src/services/*.ts`
- 修改：`apps/admin/src/pages/**/*.tsx`
- 修改：`apps/admin/.umirc.ts`
- 修改：`pnpm-lock.yaml`

- [ ] **第 1 步：更新前端依赖项**

在 `apps/admin/package.json` 中，替换 dev 依赖项：

```json
"@iam/admin-api": "workspace:*"
```

如果 `@iam/api` 仅用于 tRPC 类型，请将其从 `apps/admin/devDependencies` 中删除。

- [ ] **第 2 步：更新类型导入**

Run:

```bash
rg -l '@iam/api/trpc' apps/admin/src | xargs -r perl -pi -e 's#@iam/api/trpc#@iam/admin-api/trpc#g'
```

预期： `apps/admin` 从 `@iam/admin-api/trpc` 导入 `AppRouter` 。

- [ ] **第 3 步：更新管理开发代理**

在 `apps/admin/.umirc.ts` 中，将 `/rpc` 和 `/admin` 指向 admin-api：

```ts
proxy: {
  "/public": {
    target: "http://localhost:30000",
    changeOrigin: true,
  },
  "/auth": {
    target: "http://localhost:30000",
    changeOrigin: true,
  },
  "/sso": {
    target: "http://localhost:30000",
    changeOrigin: true,
  },
  "/internal": {
    target: "http://localhost:30000",
    changeOrigin: true,
  },
  "/open": {
    target: "http://localhost:30000",
    changeOrigin: true,
  },
  "/admin": {
    target: "http://localhost:30001",
    changeOrigin: true,
  },
  "/rpc": {
    target: "http://localhost:30001",
    changeOrigin: true,
  },
}
```

- [ ] **第 4 步：刷新锁定文件并验证前端**

Run:

```bash
pnpm install --lockfile-only
pnpm --filter @iam/admin typecheck
pnpm --filter @iam/admin-api typecheck
```

预期：两个命令均以代码 0 退出。

- [ ] **第 5 步：验证旧类型依赖关系是否已消失**

Run:

```bash
rg '@iam/api/trpc' apps/admin
```

预期：无输出。

- [ ] **第 6 步：提交**

Run:

```bash
git add apps/admin pnpm-lock.yaml
git commit -m "refactor(admin): 切换管理端后端契约"
```

---

## 任务 8：从 `apps/api` 中删除管理员暴露的信息

**文件：**
- 修改：`apps/api/app.config.ts`
- 删除：`apps/api/src/trpc/`
- 删除：`apps/api/src/routes/trpc/`
- 删除：`apps/api/src/routes/admin/`
- 修改：`apps/api/package.json` 如果 `./trpc` 导出不再在核心 API 之外使用

- [ ] **第 1 步：从 API 配置中删除管理层**

编辑 `apps/api/app.config.ts` 使 `tiers` 不再包含：

```ts
{ name: "admin", title: "管理端API" }
```

保持：

```ts
{ name: "public", title: "通用用户API" },
{ name: "open", title: "公开API" },
{ name: "internal", title: "内部API" },
{ name: "sso", title: "单点登录API" },
{ name: "auth", title: "认证API" }
```

同时删除 `rpc` 层。当前的核心 API RPC 路由器仅包含管理程序，并且管理 RPC 条目现在属于 `apps/admin-api` 。

- [ ] **第 2 步：从核心 API 中删除管理 tRPC 路由器**

删除核心 API tRPC 文件，因为它们仅服务于旧的管理路由器：

```bash
git rm -r apps/api/src/trpc
git rm -r apps/api/src/routes/trpc
```

从 `apps/api/package.json` 导出中删除 `./trpc` ，以便导出块仅公开：

```json
"exports": {
  ".": "./src/app.ts"
}
```

- [ ] **第 3 步：删除旧的管理路由目录**

Run:

```bash
git rm -r apps/api/src/routes/admin
```

- [ ] **第 4 步：验证核心 API 中不存在任何管理员暴露**

Run:

```bash
rg 'routes/admin|routers/admin|name: "admin"|title: "管理端API"' apps/api
```

预期：无输出。

- [ ] **第 5 步：验证核心 API 和管理 API**

Run:

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/admin-api typecheck
pnpm --filter @iam/api lint
pnpm --filter @iam/admin-api lint
```

预期：所有命令均以代码 0 退出。

- [ ] **第 6 步：提交**

Run:

```bash
git add apps/api
git commit -m "refactor(api): 移除核心服务管理端入口"
```

---

## 任务 9：更新 Docker 和本地运行时连接

**文件：**
- 创建：`apps/admin-api/Dockerfile`
- 修改：`docker/docker-compose-dev.yml`
- 修改：`docker/docker-compose-prod.yml`
- 修改：`apps/api/Dockerfile`

- [ ] **第 1 步：创建 admin-api Dockerfile**

基于 `apps/api/Dockerfile` 创建 `apps/admin-api/Dockerfile` ，将 API 路径更改为 admin-api 路径：

```dockerfile
# Build context: monorepo root

FROM docker.xuanyuan.run/node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HTTP_PROXY="http://176.169.105.96:3928"
ENV HTTPS_PROXY="http://176.169.105.96:3928"
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/api-core/package.json ./packages/api-core/
COPY apps/admin-api/package.json ./apps/admin-api/
ENV HTTP_PROXY="http://176.169.105.96:3928"
ENV HTTPS_PROXY="http://176.169.105.96:3928"
RUN pnpm install --frozen-lockfile

FROM docker.xuanyuan.run/oven/bun:1-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin-api/node_modules ./apps/admin-api/node_modules
COPY packages/contracts/ ./packages/contracts/
COPY packages/db/ ./packages/db/
COPY packages/api-core/ ./packages/api-core/
COPY apps/admin-api/ ./apps/admin-api/
WORKDIR /app/apps/admin-api
EXPOSE 30001
CMD ["bun", "run", "src/index.ts"]
```

- [ ] **步骤 2：更新 API Dockerfile 包副本**

确保 `apps/api/Dockerfile` 副本：

```dockerfile
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/api-core/package.json ./packages/api-core/
COPY packages/contracts/ ./packages/contracts/
COPY packages/db/ ./packages/db/
COPY packages/api-core/ ./packages/api-core/
```

- [ ] **第3步：将admin-api添加到开发撰写**

在 `docker/docker-compose-dev.yml` 中，添加服务 `admin-api` ：

```yaml
  admin-api:
    build:
      context: ..
      dockerfile: apps/admin-api/Dockerfile
    restart: unless-stopped
    ports:
      - "30012:30001"
    environment:
      DATABASE_URL: postgresql://iam:iam_password@db:5432/iam_db
      REDIS_URL: redis
      REDIS_PORT: 6379
      REDIS_DB: 0
      PORT: 30001
      NODE_ENV: production
      LOG_LEVEL: info
      PASSWORD_HASH_ROUNDS: 10
      ADMIN_CLIENT_CODES: iam
      ADMIN_ROLE_CODES: iam:admin
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
```

- [ ] **第 4 步：将 admin-api 添加到生产组合**

在 `docker/docker-compose-prod.yml` 中，添加与 `api` 具有相同数据库和 Redis 环境风格的服务 `admin-api` ，使用：

```yaml
      PORT: 30001
      ADMIN_CLIENT_CODES: ${ADMIN_CLIENT_CODES:-iam}
      ADMIN_ROLE_CODES: ${ADMIN_ROLE_CODES:-iam:admin}
```

发布它：

```yaml
    ports:
      - "${ADMIN_API_PUBLISHED_PORT:-30001}:30001"
```

- [ ] **第 5 步：验证撰写语法**

Run:

```bash
docker compose -f docker/docker-compose-dev.yml config >/tmp/iam-compose-dev.yml
docker compose -f docker/docker-compose-prod.yml config >/tmp/iam-compose-prod.yml
```

预期：两个命令均以代码 0 退出。

- [ ] **第 6 步：提交**

Run:

```bash
git add apps/admin-api/Dockerfile apps/api/Dockerfile docker/docker-compose-dev.yml docker/docker-compose-prod.yml
git commit -m "chore(docker): 增加管理后端服务部署配置"
```

---

## 任务 10：全面验证和清理

**文件：**
- 仅修改修复先前任务验证失败所需的文件。

- [ ] **第 1 步：运行工作区检查**

Run:

```bash
pnpm typecheck
pnpm lint
```

预期：两个命令均以代码 0 退出。

- [ ] **第 2 步：运行重点包检查**

Run:

```bash
pnpm --filter @iam/contracts typecheck
pnpm --filter @iam/db typecheck
pnpm --filter @iam/api-core typecheck
pnpm --filter @iam/api typecheck
pnpm --filter @iam/admin-api typecheck
pnpm --filter @iam/admin typecheck
pnpm --filter @iam/sso typecheck
```

预期：所有命令均以代码 0 退出。

- [ ] **第 3 步：验证禁止的依赖项**

Run:

```bash
rg '@iam/shared' apps packages package.json pnpm-lock.yaml
rg '@api/services|@api/routes/admin|@api/trpc|@api/db|@api/lib/core|@api/errors' apps/admin-api/src
rg 'routes/admin|routers/admin|name: "admin"|title: "管理端API"' apps/api
rg '@api/' packages/db/src packages/api-core/src
```

预期：所有四个命令均不产生输出。

- [ ] **步骤 4：验证 Drizzle 包命令**

Run:

```bash
pnpm --filter @iam/db db:generate --help
pnpm --filter @iam/db db:migrate --help
pnpm --filter @iam/db db:push --help
```

预期：所有命令都会打印 drizzle-kit 帮助文本并以代码 0 退出。

- [ ] **第 5 步：可选的本地运行时冒烟测试**

如果 Postgres 和 Redis 可用，请运行：

```bash
pnpm --filter @iam/api dev
pnpm --filter @iam/admin-api dev
```

然后烟雾端点：

```bash
curl -i http://localhost:30000/
curl -i -H 'Client: iam' http://localhost:30001/admin/doc
curl -i -H 'Client: iam' http://localhost:30001/rpc
```

预期的：

- 启用 OpenAPI 时，核心 API 根返回标量 UI 或配置的 API 引用。
- 启用 OpenAPI 时提供管理 REST 文档。
- 未经身份验证的受保护管理调用返回 401。

- [ ] **第 6 步：进行最终清理**

如果步骤 1 到步骤 5 需要修复，请提交它们：

```bash
git add .
git commit -m "chore(admin-api): 完成拆分验证清理"
```

如果没有文件更改，则不需要提交。

---

## 执行注意事项

- 更喜欢每次提交一个任务。
- 保持生成的前端目录（例如 `apps/admin/src/.umi/` ）不变。
- 不要编辑 `apps/api/static/` ，除非 Docker/运行时检查需要以不同方式复制静态资产。
- 保留核心 API 行为的 `apps/api/src/services/*`，直到稍后执行单独的服务清理任务。
- 将 admin-api 服务代码保留在 `apps/admin-api/src/services` 本地；不要从 `apps/api` 导入服务代码。
- 如果包提取显示循环依赖关系，则仅当较小的实用程序不引入特定于应用程序的语义时，才将其移至较低级别的包中。
