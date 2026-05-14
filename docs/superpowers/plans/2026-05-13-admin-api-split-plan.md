# Admin API Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current `apps/api` admin backend into an independent `apps/admin-api` service while extracting shared contracts, database schema, and backend infrastructure packages.

**Architecture:** The migration is phased. First rename the existing shared enum package to `@iam/contracts`, then extract Drizzle schema/migrations into `@iam/db`, then extract Hono/tRPC/OpenAPI infrastructure into `@iam/api-core`. After the existing `apps/api` is stable on the new packages, create `apps/admin-api`, migrate admin REST/tRPC and admin-owned service/repository code, switch `apps/admin` type imports to `@iam/admin-api/trpc`, and finally remove admin exposure from `apps/api`.

**Tech Stack:** pnpm workspace, Turborepo, Bun, Hono, `@hono/zod-openapi`, tRPC v11, Drizzle ORM v1 RC, PostgreSQL, Redis, Umi Max, TypeScript.

---

## File Structure

The final structure should be:

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

Responsibility rules:

- `@iam/contracts` is the only frontend-safe shared package. It may export enums, status codes, and UI option helpers.
- `@iam/db` is backend-only and owns Drizzle schema, relations, migrations, `db`, `DbClient`, `DbTransaction`, and query helpers.
- `@iam/api-core` is backend-only and owns Hono/tRPC/OpenAPI infrastructure. It must not import `apps/*` or app service modules.
- `apps/admin-api` may copy code from the old admin implementation, but after migration it must not import `@api/services/*`, `@api/routes/admin/*`, or `@api/trpc/*`.

---

## Task 0: Baseline Checks

**Files:**
- Read: `docs/superpowers/specs/2026-05-12-admin-api-split-design.md`
- Read: `package.json`
- Read: `pnpm-workspace.yaml`
- Read: `turbo.json`

- [ ] **Step 1: Confirm the worktree is clean**

Run:

```bash
git status --short
```

Expected: no output. If output exists, inspect it and avoid overwriting user changes.

- [ ] **Step 2: Run baseline type checks**

Run:

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/admin typecheck
pnpm --filter @iam/sso typecheck
```

Expected: each command exits with code 0. If a command fails before any edit, record the failure in the task notes and continue only after deciding whether it is unrelated.

- [ ] **Step 3: Run baseline lint for the current API**

Run:

```bash
pnpm --filter @iam/api lint
```

Expected: exits with code 0 or only reports pre-existing warnings. Do not fix unrelated lint issues in this task.

- [ ] **Step 4: Commit**

No commit is needed if no files changed.

---

## Task 1: Rename `@iam/shared` To `@iam/contracts`

**Files:**
- Move: `packages/shared/` -> `packages/contracts/`
- Modify: `packages/contracts/package.json`
- Create: `packages/contracts/eslint.config.js`
- Modify: `packages/contracts/tsconfig.json`
- Modify: `apps/api/package.json`
- Modify: `apps/admin/package.json`
- Modify: `apps/sso/package.json`
- Modify: imports under `apps/api/src/`, `apps/admin/src/`, `apps/sso/src/`, `packages/contracts/src/`
- Modify: `apps/api/Dockerfile`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Move the package directory**

Run:

```bash
git mv packages/shared packages/contracts
```

Expected: `packages/contracts/package.json` exists and `packages/shared` no longer exists.

- [ ] **Step 2: Rename the package**

Edit `packages/contracts/package.json` so it is exactly:

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
    "lint": "eslint src/",
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

- [ ] **Step 3: Add lint config for contracts**

Create `packages/contracts/eslint.config.js`:

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

Keep `packages/contracts/tsconfig.json` from the old shared package. If it lacks an `include`, set:

```json
"include": ["src/**/*"]
```

- [ ] **Step 4: Update workspace dependencies**

Replace `@iam/shared` with `@iam/contracts` in:

```text
apps/api/package.json
apps/admin/package.json
apps/sso/package.json
```

The dependency entry should be:

```json
"@iam/contracts": "workspace:*"
```

- [ ] **Step 5: Update TypeScript imports**

Run:

```bash
rg -l '@iam/shared' apps packages | xargs perl -pi -e 's#@iam/shared#@iam/contracts#g'
```

Expected: import sites now reference `@iam/contracts`.

- [ ] **Step 6: Update the API Dockerfile package copy paths**

In `apps/api/Dockerfile`, replace package paths:

```dockerfile
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/contracts/ ./packages/contracts/
```

Remove the old `packages/shared` copy paths from the Dockerfile.

- [ ] **Step 7: Refresh the lockfile**

Run:

```bash
pnpm install --lockfile-only
```

Expected: `pnpm-lock.yaml` references `@iam/contracts` instead of `@iam/shared`.

- [ ] **Step 8: Verify old package name is gone**

Run:

```bash
rg '@iam/shared|packages/shared' apps packages package.json pnpm-lock.yaml
```

Expected: no output.

- [ ] **Step 9: Verify type checks**

Run:

```bash
pnpm --filter @iam/contracts typecheck
pnpm --filter @iam/contracts lint
pnpm --filter @iam/api typecheck
pnpm --filter @iam/admin typecheck
pnpm --filter @iam/sso typecheck
```

Expected: all three commands exit with code 0.

- [ ] **Step 10: Commit**

Run:

```bash
git add packages/contracts apps/api/package.json apps/admin/package.json apps/sso/package.json apps/api/Dockerfile pnpm-lock.yaml
git add -u packages/shared apps/api apps/admin apps/sso
git commit -m "refactor(contracts): 重命名共享契约包"
```

Expected: one focused commit containing only the package rename and import updates.

---

## Task 2: Extract Drizzle Database Layer Into `@iam/db`

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/eslint.config.js`
- Create: `packages/db/src/singleton.ts`
- Move: `apps/api/src/db/schema/` -> `packages/db/src/schema/`
- Move: `apps/api/src/db/relations/` -> `packages/db/src/relations/`
- Move: `apps/api/src/db/migrations/` -> `packages/db/src/migrations/`
- Move: `apps/api/src/db/index.ts` -> `packages/db/src/index.ts`
- Move: `apps/api/src/db/query-utils.ts` -> `packages/db/src/query-utils.ts`
- Move: `apps/api/drizzle.config.ts` -> `packages/db/drizzle.config.ts`
- Modify: `apps/api/package.json`
- Modify: imports under `apps/api/src/`
- Modify: `apps/api/Dockerfile`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Create the package shell**

Create `packages/db/package.json`:

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
    "lint": "eslint src/ drizzle.config.ts",
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

Create `packages/db/tsconfig.json`:

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

Create `packages/db/eslint.config.js`:

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

- [ ] **Step 2: Move database files**

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

Expected: `apps/api/src/db` has no schema, relations, migrations, index, or query-utils files left.

- [ ] **Step 3: Add DB-local singleton**

Create `packages/db/src/singleton.ts`:

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

- [ ] **Step 4: Update DB package imports**

Edit `packages/db/src/index.ts`:

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

Edit `packages/db/src/relations/index.ts` so its schema import is:

```ts
import * as schema from "../schema";
```

Edit `packages/db/src/relations/types.ts` so its schema import is:

```ts
import type * as schema from "../schema";
```

Run:

```bash
rg -l '@api/db/schema' packages/db/src | xargs -r perl -pi -e 's#@api/db/schema#@iam/db/schema#g'
rg -l '@api/enums' packages/db/src | xargs -r perl -pi -e 's#@api/enums#@iam/contracts#g'
```

Expected: `rg '@api/' packages/db/src` returns no output.

- [ ] **Step 5: Update Drizzle config**

Edit `packages/db/drizzle.config.ts`:

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

- [ ] **Step 6: Update API imports to use `@iam/db`**

Run:

```bash
rg -l '@api/db/schema' apps/api/src | xargs -r perl -pi -e 's#@api/db/schema#@iam/db/schema#g'
rg -l '@api/db/query-utils' apps/api/src | xargs -r perl -pi -e 's#@api/db/query-utils#@iam/db/query-utils#g'
rg -l '@api/db"' apps/api/src | xargs -r perl -pi -e 's#@api/db"#@iam/db"#g'
```

Expected: `rg '@api/db' apps/api/src` returns no output.

- [ ] **Step 7: Update API package scripts and dependencies**

In `apps/api/package.json`, add:

```json
"@iam/db": "workspace:*"
```

Change DB scripts to forward to `@iam/db`:

```json
"db:generate": "pnpm --filter @iam/db db:generate",
"db:migrate": "pnpm --filter @iam/db db:migrate",
"db:push": "pnpm --filter @iam/db db:push"
```

Keep `drizzle-orm`, `postgres`, and `drizzle-kit` in `apps/api/package.json` until all direct `drizzle-orm` imports in API services are reviewed. The services still import SQL helpers such as `eq`, `and`, and `count`.

- [ ] **Step 8: Update Dockerfile workspace package copy**

In `apps/api/Dockerfile`, add package metadata and source copy lines for `packages/db`:

```dockerfile
COPY packages/db/package.json ./packages/db/
COPY packages/db/ ./packages/db/
```

Keep the `packages/contracts` copy lines from Task 1.

- [ ] **Step 9: Refresh lockfile and verify**

Run:

```bash
pnpm install --lockfile-only
pnpm --filter @iam/db typecheck
pnpm --filter @iam/api typecheck
pnpm --filter @iam/db lint
pnpm --filter @iam/api lint
```

Expected: all commands exit with code 0.

- [ ] **Step 10: Verify Drizzle command wiring**

Run:

```bash
pnpm --filter @iam/db exec drizzle-kit --config drizzle.config.ts check
```

Expected: drizzle-kit loads `packages/db/drizzle.config.ts` and does not fail due to missing schema path. If `check` is unavailable in this drizzle-kit version, run `pnpm --filter @iam/db db:generate --help` and verify the package command resolves.

- [ ] **Step 11: Commit**

Run:

```bash
git add packages/db apps/api/package.json apps/api/Dockerfile pnpm-lock.yaml
git add -u apps/api/src/db apps/api/drizzle.config.ts apps/api/src
git commit -m "refactor(db): 抽取数据库契约包"
```

---

## Task 3: Extract API Core Infrastructure Package

**Files:**
- Create: `packages/api-core/package.json`
- Create: `packages/api-core/tsconfig.json`
- Create: `packages/api-core/eslint.config.js`
- Create directories under `packages/api-core/src/`
- Move or copy from `apps/api/src/lib/core/`
- Move or copy from `apps/api/src/errors/`
- Move or copy from `apps/api/src/middlewares/error.handler.ts`
- Move or copy from `apps/api/src/middlewares/not-found-handler.ts`
- Move or copy from `apps/api/src/utils/http/response.ts`
- Move or copy from `apps/api/src/utils/common.utils.ts`
- Move or copy from `apps/api/src/utils/encryption.utils.ts`
- Move or copy from `apps/api/src/utils/page.util.ts`
- Move or copy from `apps/api/src/utils/tools/glob.ts`
- Move or copy from `apps/api/src/utils/zod/env-validator.ts`
- Move or copy from `apps/api/src/lib/logger/index.ts`
- Move or copy from `apps/api/src/lib/clients/redis.ts`
- Move or copy from `apps/api/src/trpc/trpc.ts`
- Modify: `apps/api/package.json`
- Modify: imports under `apps/api/src/`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Create package metadata**

Create `packages/api-core/package.json`:

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
    "lint": "eslint src/",
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

Create `packages/api-core/tsconfig.json` with the same compiler options as `apps/api/tsconfig.json`, replacing paths with:

```json
"paths": {
  "@api-core/*": ["./src/*"]
}
```

Create `packages/api-core/eslint.config.js` by copying `apps/api/eslint.config.js` and changing `ignores` to:

```js
ignores: []
```

- [ ] **Step 2: Move pure infrastructure files**

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

Expected: files are copied, not removed from `apps/api` yet. Keeping copies until `apps/api` import updates pass makes rollback easier.

- [ ] **Step 3: Add package barrel exports**

Create `packages/api-core/src/index.ts`:

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

Create `packages/api-core/src/core/index.ts`:

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

Create `packages/api-core/src/errors/index.ts`:

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

Create `packages/api-core/src/http/index.ts`:

```ts
export * from "./response";
```

Create `packages/api-core/src/middlewares/index.ts`:

```ts
export * from "./auth";
export * from "./error-handler";
export { default as notFound } from "./not-found-handler";
```

Create `packages/api-core/src/utils/index.ts`:

```ts
export * from "./common";
export * from "./encryption";
export * from "./env-validator";
export * from "./glob";
export * from "./page";
```

- [ ] **Step 4: Make logger and Redis env-injected**

Edit `packages/api-core/src/logger/index.ts` to remove `@api/env` and export a factory:

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

Edit `packages/api-core/src/redis/index.ts` to remove `@api/env` and export a factory:

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

- [ ] **Step 5: Make core types app-neutral**

Edit `packages/api-core/src/types/lib.ts`:

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

- [ ] **Step 6: Make `define-config` env-neutral**

Edit `packages/api-core/src/core/define-config.ts` so `OpenAPIConfig.enabled` accepts `Record<string, unknown>`:

```ts
export type OpenAPIConfig = {
  enabled?: boolean | ((env: Record<string, unknown>) => boolean);
  version?: string;
  docEndpoint?: string;
  scalar?: Partial<ApiReferenceConfiguration>;
};
```

Keep the remaining `TierConfig`, `RpcConfig`, and `AppConfig` exports unchanged.

- [ ] **Step 7: Make `createApp` app-supplied**

Edit `packages/api-core/src/core/create-app.ts` so it exports:

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

The implementation must not call `globImport` internally. Each app passes `import.meta.glob` results from its own source tree.

- [ ] **Step 8: Add injectable auth middleware factories**

Create `packages/api-core/src/middlewares/auth.ts`:

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

- [ ] **Step 9: Update copied imports inside `@iam/api-core`**

Run:

```bash
rg -l '@api/enums/service.status' packages/api-core/src | xargs -r perl -pi -e 's#@api/enums/service.status#@iam/contracts#g'
rg -l '@api/errors' packages/api-core/src | xargs -r perl -pi -e 's#@api/errors#@iam/api-core/errors#g'
rg -l '@api/utils/http/response' packages/api-core/src | xargs -r perl -pi -e 's#@api/utils/http/response#@iam/api-core/http#g'
rg -l '@api/lib/core' packages/api-core/src | xargs -r perl -pi -e 's#@api/lib/core#@iam/api-core/core#g'
rg -l '@api/trpc/trpc' packages/api-core/src | xargs -r perl -pi -e 's#@api/trpc/trpc#@iam/api-core/trpc#g'
```

Then fix remaining relative imports by running:

```bash
rg '@api/' packages/api-core/src
```

Expected: no output.

- [ ] **Step 10: Update `apps/api` to consume `@iam/api-core`**

In `apps/api/package.json`, add:

```json
"@iam/api-core": "workspace:*"
```

Create `apps/api/src/lib/logger/index.ts` as the app-level logger wrapper:

```ts
import env from "@api/env";
import { createLogger } from "@iam/api-core/logger";

export const logger = createLogger({
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
});
```

Create `apps/api/src/lib/clients/redis.ts` as the app-level Redis wrapper:

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

Keep these wrappers so existing app services can import `@api/lib/logger` and `@api/lib/clients/redis` until later cleanup.

- [ ] **Step 11: Update app-level `createApp` wiring**

Edit `apps/api/src/app.ts`:

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

- [ ] **Step 12: Update imports from extracted infrastructure**

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

Expected: imports now point to `@iam/api-core`, except app-level wrappers `@api/lib/logger` and `@api/lib/clients/redis`.

- [ ] **Step 13: Replace authentication middleware implementation in `apps/api`**

Edit `apps/api/src/middlewares/authentication.handler.ts`:

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

- [ ] **Step 14: Verify package boundaries**

Run:

```bash
rg '@api/' packages/api-core/src
rg 'apps/' packages/api-core/src
```

Expected: both commands produce no output.

- [ ] **Step 15: Refresh lockfile and verify**

Run:

```bash
pnpm install --lockfile-only
pnpm --filter @iam/api-core typecheck
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api-core lint
pnpm --filter @iam/api lint
```

Expected: all commands exit with code 0.

- [ ] **Step 16: Commit**

Run:

```bash
git add packages/api-core apps/api/package.json apps/api/src pnpm-lock.yaml
git commit -m "refactor(api-core): 抽取后端基础设施包"
```

---

## Task 4: Scaffold `apps/admin-api`

**Files:**
- Create: `apps/admin-api/package.json`
- Create: `apps/admin-api/tsconfig.json`
- Create: `apps/admin-api/eslint.config.js`
- Create: `apps/admin-api/app.config.ts`
- Create: `apps/admin-api/src/env.ts`
- Create: `apps/admin-api/src/app.ts`
- Create: `apps/admin-api/src/index.ts`
- Create: `apps/admin-api/src/types/lib.d.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Create package metadata**

Create `apps/admin-api/package.json`:

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
    "lint": "eslint src/",
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

- [ ] **Step 2: Create TypeScript and ESLint config**

Create `apps/admin-api/tsconfig.json`:

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

Create `apps/admin-api/eslint.config.js` by copying `apps/api/eslint.config.js`, keeping double quotes and semicolons.

- [ ] **Step 3: Create admin API env schema**

Create `apps/admin-api/src/env.ts`:

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

- [ ] **Step 4: Create app config**

Create `apps/admin-api/app.config.ts`:

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

- [ ] **Step 5: Create app and entrypoint**

Create `apps/admin-api/src/app.ts`:

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

Create `apps/admin-api/src/index.ts`:

```ts
import app from "./app";
import env from "./env";

export default {
  port: env.PORT,
  fetch: app.fetch,
};
```

- [ ] **Step 6: Add app-specific binding types**

Create `apps/admin-api/src/types/lib.d.ts`:

```ts
import type { PublicBindings as CorePublicBindings, PublicRouteHandler as CorePublicRouteHandler } from "@iam/api-core/types";
import type { RouteConfig as HonoRouteConfig } from "@hono/zod-openapi";

export type AdminBindings = CorePublicBindings;
export type AdminRouteHandler<R extends HonoRouteConfig> = CorePublicRouteHandler<R>;
```

- [ ] **Step 7: Refresh lockfile and verify scaffold**

Run:

```bash
pnpm install --lockfile-only
pnpm --filter @iam/admin-api typecheck
pnpm --filter @iam/admin-api lint
```

Expected: both commands exit with code 0.

- [ ] **Step 8: Commit**

```bash
git add apps/admin-api pnpm-lock.yaml
git commit -m "feat(admin-api): 初始化管理后端服务"
```

---

## Task 5: Migrate Admin Routes, tRPC, And Admin-Owned Services

**Files:**
- Create: `apps/admin-api/src/routes/admin/**`
- Create: `apps/admin-api/src/routes/trpc/**`
- Create: `apps/admin-api/src/trpc/**`
- Create: `apps/admin-api/src/services/client/**`
- Create: `apps/admin-api/src/services/user/**`
- Create: `apps/admin-api/src/services/organization/**`
- Create: `apps/admin-api/src/services/position/**`
- Create: `apps/admin-api/src/services/employment/**`
- Create: `apps/admin-api/src/services/role/**`
- Create: `apps/admin-api/src/services/privilege/**`
- Modify imports under `apps/admin-api/src/`

- [ ] **Step 1: Copy admin route and tRPC files**

Run:

```bash
mkdir -p apps/admin-api/src/routes apps/admin-api/src/trpc
cp -R apps/api/src/routes/admin apps/admin-api/src/routes/admin
cp -R apps/api/src/routes/trpc apps/admin-api/src/routes/trpc
cp -R apps/api/src/trpc/* apps/admin-api/src/trpc/
```

Expected: `apps/admin-api/src/routes/admin` contains `client`, `user`, `organization`, `position`, `employment`.

- [ ] **Step 2: Copy admin-required service files**

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

Expected: admin-api has its own copy of admin service/repository code and no runtime dependency on `apps/api/src/services`.

- [ ] **Step 3: Update admin-api imports**

Run these replacements inside `apps/admin-api/src`:

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

Then inspect:

```bash
rg '@api/' apps/admin-api/src
```

Expected: no output after manual fixes.

- [ ] **Step 4: Tighten admin-api binding types**

Edit `apps/admin-api/src/types/lib.d.ts`:

```ts
import type { PublicBindings as CorePublicBindings, PublicRouteHandler as CorePublicRouteHandler } from "@iam/api-core/types";
import type { RouteConfig as HonoRouteConfig } from "@hono/zod-openapi";
import type { UserDetailDto } from "@admin-api/services/user/user.type";

export type AdminBindings = CorePublicBindings<UserDetailDto>;
export type AdminRouteHandler<R extends HonoRouteConfig> = CorePublicRouteHandler<R, UserDetailDto>;
```

- [ ] **Step 5: Remove non-admin service dependencies**

Edit `apps/admin-api/src/services/user/user.service.ts` so it does not import `mobile.service`, `session.service`, or other core-only services. Keep the admin functions used by `routes/admin/user/user.ops.ts`:

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

Remove functions that only support public password reset, mobile binding, or SSO login flows from this admin copy.

- [ ] **Step 6: Keep admin ops as the shared REST/tRPC layer**

Verify these files import local admin-api services:

```bash
rg '@admin-api/services' apps/admin-api/src/routes/admin
```

Expected: matches in `*.ops.ts` and `client.handlers.ts`.

- [ ] **Step 7: Verify no old API service imports remain**

Run:

```bash
rg '@api/services|@api/routes/admin|@api/trpc|@api/db|@api/lib/core|@api/errors' apps/admin-api/src
```

Expected: no output.

- [ ] **Step 8: Typecheck admin-api**

Run:

```bash
pnpm --filter @iam/admin-api typecheck
```

Expected: exits with code 0. Fix remaining import and type errors inside `apps/admin-api` without changing `apps/api`.

- [ ] **Step 9: Lint admin-api**

Run:

```bash
pnpm --filter @iam/admin-api lint
```

Expected: exits with code 0 or only warning-level `max-len` messages matching the existing API style.

- [ ] **Step 10: Commit**

Run:

```bash
git add apps/admin-api pnpm-lock.yaml
git commit -m "feat(admin-api): 迁移管理端路由和服务"
```

---

## Task 6: Add Admin Authentication To Admin API

**Files:**
- Modify: `apps/admin-api/src/routes/admin/_middleware.ts`
- Modify: `apps/admin-api/src/routes/trpc/_middleware.ts`
- Create or modify: `apps/admin-api/src/lib/clients/redis.ts`
- Modify: `apps/admin-api/src/env.ts`

- [ ] **Step 1: Add Redis wrapper for admin-api**

Create `apps/admin-api/src/lib/clients/redis.ts`:

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

- [ ] **Step 2: Add env helpers for allowlists**

Edit `apps/admin-api/src/env.ts` to export:

```ts
export const adminClientCodes = env.ADMIN_CLIENT_CODES.split(",")
  .map(code => code.trim())
  .filter(Boolean);

export const adminRoleCodes = env.ADMIN_ROLE_CODES.split(",")
  .map(code => code.trim())
  .filter(Boolean);
```

- [ ] **Step 3: Protect `/admin/*`**

Edit `apps/admin-api/src/routes/admin/_middleware.ts`:

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

- [ ] **Step 4: Protect `/rpc`**

Edit `apps/admin-api/src/routes/trpc/_middleware.ts`:

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

- [ ] **Step 5: Verify auth behavior by typecheck**

Run:

```bash
pnpm --filter @iam/admin-api typecheck
pnpm --filter @iam/admin-api lint
```

Expected: both commands exit with code 0.

- [ ] **Step 6: Optional local smoke test**

If Redis and the development database are running, start admin-api:

```bash
pnpm --filter @iam/admin-api dev
```

Then in another terminal run:

```bash
curl -i -H 'Client: iam' http://localhost:30001/admin/doc
curl -i -H 'Client: iam' http://localhost:30001/rpc
```

Expected: protected route requests without a valid session return 401. The OpenAPI doc endpoint may remain unauthenticated if `createApp` registers docs before tier middleware; record the observed behavior and keep route handlers protected.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/admin-api/src
git commit -m "feat(admin-api): 增加管理端鉴权"
```

---

## Task 7: Switch Admin Frontend Type Contract And Dev Proxy

**Files:**
- Modify: `apps/admin/package.json`
- Modify: `apps/admin/src/lib/api-client.ts`
- Modify: `apps/admin/src/services/*.ts`
- Modify: `apps/admin/src/pages/**/*.tsx`
- Modify: `apps/admin/.umirc.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Update frontend dependency**

In `apps/admin/package.json`, replace the dev dependency:

```json
"@iam/admin-api": "workspace:*"
```

Remove `@iam/api` from `apps/admin/devDependencies` if it is only used for tRPC types.

- [ ] **Step 2: Update type imports**

Run:

```bash
rg -l '@iam/api/trpc' apps/admin/src | xargs -r perl -pi -e 's#@iam/api/trpc#@iam/admin-api/trpc#g'
```

Expected: `apps/admin` imports `AppRouter` from `@iam/admin-api/trpc`.

- [ ] **Step 3: Update admin dev proxy**

In `apps/admin/.umirc.ts`, point `/rpc` and `/admin` to admin-api:

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

- [ ] **Step 4: Refresh lockfile and verify frontend**

Run:

```bash
pnpm install --lockfile-only
pnpm --filter @iam/admin typecheck
pnpm --filter @iam/admin-api typecheck
```

Expected: both commands exit with code 0.

- [ ] **Step 5: Verify old type dependency is gone**

Run:

```bash
rg '@iam/api/trpc' apps/admin
```

Expected: no output.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/admin pnpm-lock.yaml
git commit -m "refactor(admin): 切换管理端后端契约"
```

---

## Task 8: Remove Admin Exposure From `apps/api`

**Files:**
- Modify: `apps/api/app.config.ts`
- Delete: `apps/api/src/trpc/`
- Delete: `apps/api/src/routes/trpc/`
- Delete: `apps/api/src/routes/admin/`
- Modify: `apps/api/package.json` if `./trpc` export is no longer consumed outside core API

- [ ] **Step 1: Remove admin tier from API config**

Edit `apps/api/app.config.ts` so `tiers` no longer contains:

```ts
{ name: "admin", title: "管理端API" }
```

Keep:

```ts
{ name: "public", title: "通用用户API" },
{ name: "open", title: "公开API" },
{ name: "internal", title: "内部API" },
{ name: "sso", title: "单点登录API" },
{ name: "auth", title: "认证API" }
```

Remove the `rpc` tier as well. The current core API RPC router only contains admin procedures, and the admin RPC entry now belongs to `apps/admin-api`.

- [ ] **Step 2: Remove admin tRPC router from core API**

Delete the core API tRPC files because they only serve the old admin router:

```bash
git rm -r apps/api/src/trpc
git rm -r apps/api/src/routes/trpc
```

Remove `./trpc` from `apps/api/package.json` exports so the export block only exposes:

```json
"exports": {
  ".": "./src/app.ts"
}
```

- [ ] **Step 3: Remove old admin route directory**

Run:

```bash
git rm -r apps/api/src/routes/admin
```

- [ ] **Step 4: Verify no admin exposure remains in core API**

Run:

```bash
rg 'routes/admin|routers/admin|name: "admin"|title: "管理端API"' apps/api
```

Expected: no output.

- [ ] **Step 5: Verify core API and admin API**

Run:

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/admin-api typecheck
pnpm --filter @iam/api lint
pnpm --filter @iam/admin-api lint
```

Expected: all commands exit with code 0.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/api
git commit -m "refactor(api): 移除核心服务管理端入口"
```

---

## Task 9: Update Docker And Local Runtime Wiring

**Files:**
- Create: `apps/admin-api/Dockerfile`
- Modify: `docker/docker-compose-dev.yml`
- Modify: `docker/docker-compose-prod.yml`
- Modify: `apps/api/Dockerfile`

- [ ] **Step 1: Create admin-api Dockerfile**

Create `apps/admin-api/Dockerfile` based on `apps/api/Dockerfile`, changing API paths to admin-api paths:

```dockerfile
# Build context: monorepo root

FROM docker.xuanyuan.run/node:24-bookworm AS base
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

- [ ] **Step 2: Update API Dockerfile package copies**

Ensure `apps/api/Dockerfile` copies:

```dockerfile
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/api-core/package.json ./packages/api-core/
COPY packages/contracts/ ./packages/contracts/
COPY packages/db/ ./packages/db/
COPY packages/api-core/ ./packages/api-core/
```

- [ ] **Step 3: Add admin-api to development compose**

In `docker/docker-compose-dev.yml`, add service `admin-api`:

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

- [ ] **Step 4: Add admin-api to production compose**

In `docker/docker-compose-prod.yml`, add service `admin-api` with the same database and Redis environment style as `api`, using:

```yaml
      PORT: 30001
      ADMIN_CLIENT_CODES: ${ADMIN_CLIENT_CODES:-iam}
      ADMIN_ROLE_CODES: ${ADMIN_ROLE_CODES:-iam:admin}
```

Publish it with:

```yaml
    ports:
      - "${ADMIN_API_PUBLISHED_PORT:-30001}:30001"
```

- [ ] **Step 5: Validate compose syntax**

Run:

```bash
docker compose -f docker/docker-compose-dev.yml config >/tmp/iam-compose-dev.yml
docker compose -f docker/docker-compose-prod.yml config >/tmp/iam-compose-prod.yml
```

Expected: both commands exit with code 0.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/admin-api/Dockerfile apps/api/Dockerfile docker/docker-compose-dev.yml docker/docker-compose-prod.yml
git commit -m "chore(docker): 增加管理后端服务部署配置"
```

---

## Task 10: Full Verification And Cleanup

**Files:**
- Modify only files needed to fix verification failures from prior tasks.

- [ ] **Step 1: Run workspace checks**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: both commands exit with code 0.

- [ ] **Step 2: Run focused package checks**

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

Expected: all commands exit with code 0.

- [ ] **Step 3: Verify forbidden dependencies**

Run:

```bash
rg '@iam/shared' apps packages package.json pnpm-lock.yaml
rg '@api/services|@api/routes/admin|@api/trpc|@api/db|@api/lib/core|@api/errors' apps/admin-api/src
rg 'routes/admin|routers/admin|name: "admin"|title: "管理端API"' apps/api
rg '@api/' packages/db/src packages/api-core/src
```

Expected: all four commands produce no output.

- [ ] **Step 4: Verify Drizzle package commands**

Run:

```bash
pnpm --filter @iam/db db:generate --help
pnpm --filter @iam/db db:migrate --help
pnpm --filter @iam/db db:push --help
```

Expected: all commands print drizzle-kit help text and exit with code 0.

- [ ] **Step 5: Optional local runtime smoke test**

If Postgres and Redis are available, run:

```bash
pnpm --filter @iam/api dev
pnpm --filter @iam/admin-api dev
```

Then smoke endpoints:

```bash
curl -i http://localhost:30000/
curl -i -H 'Client: iam' http://localhost:30001/admin/doc
curl -i -H 'Client: iam' http://localhost:30001/rpc
```

Expected:

- core API root returns Scalar UI or configured API reference when OpenAPI is enabled.
- admin REST docs are served when OpenAPI is enabled.
- unauthenticated protected admin calls return 401.

- [ ] **Step 6: Commit final cleanup**

If Step 1 through Step 5 required fixes, commit them:

```bash
git add .
git commit -m "chore(admin-api): 完成拆分验证清理"
```

If no files changed, no commit is needed.

---

## Execution Notes

- Prefer one task per commit.
- Keep generated frontend directories such as `apps/admin/src/.umi/` untouched.
- Do not edit `apps/api/static/` unless a Docker/runtime check requires static assets to be copied differently.
- Keep `apps/api/src/services/*` for core API behavior until a later, separate service cleanup task.
- Keep admin-api service code local to `apps/admin-api/src/services`; do not import service code from `apps/api`.
- If a package extraction reveals a circular dependency, move the smaller utility into the lower-level package only when it does not introduce app-specific semantics.
