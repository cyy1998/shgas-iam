# Monorepo 基础设施 + Admin 认证框架实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 iam-service 迁移为 Turborepo monorepo，创建 @iam/shared 类型包，搭建 React + ADP 管理后台并实现 SSO 认证流程，产出可登录的空 admin 后台。

**Architecture:** 三包结构：@iam/api（后端，迁入 apps/api/）、@iam/shared（纯 TS 枚举/类型）、@iam/admin（React + Ant Design Pro）。后端路由注册从动态 require 改为静态 import 以获得完整 AppType，前端通过 hc<AppType> 实现类型安全 API 调用，认证依赖 session cookie + /public/user-info。

**Tech Stack:** Turborepo 2.x, pnpm workspaces, Bun, Hono + @hono/zod-openapi, React 18, Ant Design Pro (Umi Max), TypeScript 6, hono/client

---

## 文件变更地图

**新建：**
- `turbo.json` — Turborepo 任务流水线
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/enums/service.status.ts`（从 api 迁入）
- `apps/admin/`（ADP 脚手架生成）
- `apps/admin/src/lib/api-client.ts` — hc<AppType> 单例
- `apps/admin/src/pages/403.tsx` — 无权限页
- `apps/admin/src/access.ts` — ADP 访问控制规则

**移动（git mv）：**
- `src/` → `apps/api/src/`
- `static/` → `apps/api/static/`
- `debug/` → `apps/api/debug/`
- `scripts/` → `apps/api/scripts/`
- `prisma.config.ts` → `apps/api/prisma.config.ts`
- `tsconfig.json` → `apps/api/tsconfig.json`
- `eslint.config.js` → `apps/api/eslint.config.js`
- `package.json` → `apps/api/package.json`（再创建新的根 package.json）

**修改：**
- `pnpm-workspace.yaml` — 添加 apps/\*, packages/\*
- `apps/api/package.json` — name 改为 @iam/api，添加 exports
- `apps/api/src/app.ts` — 添加 `export type AppType`
- `apps/api/src/lib/core/create-app.ts` — 动态 require 改为静态 import
- `apps/api/src/enums/service.status.ts` — 改为从 @iam/shared re-export
- `apps/admin/src/app.tsx` — initialState 认证检查
- `apps/admin/src/access.ts` — admin role 访问规则
- `apps/admin/.umirc.ts` — 开发代理配置

---

## Plan 范围说明

本 Plan 产出：可登录的空 admin 后台（有导航菜单但无业务内容）。
四个业务模块页面（用户/组织/职位/雇佣）在 **Plan 2**（`2026-04-17-admin-module-pages.md`）中实现。

---

### Task 1: 初始化 Monorepo 根配置

**Files:**
- Create: `turbo.json`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: 创建 `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "dependsOn": ["^build"],
      "persistent": true,
      "cache": false
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"]
    }
  }
}
```

- [ ] **Step 2: 更新 `pnpm-workspace.yaml`**

将现有内容替换为：

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
ignoredBuiltDependencies:
  - '@prisma/engines'
  - '@scarf/scarf'
  - bcrypt
  - prisma
  - prisma-zod-generator
```

- [ ] **Step 3: 确认 `.gitignore` 包含 `.turbo`**

检查根 `.gitignore`，如果没有 `.turbo`，追加：
```
.turbo
```

- [ ] **Step 4: Commit**

```bash
git add turbo.json pnpm-workspace.yaml .gitignore
git commit -m "chore: 初始化 Turborepo 根配置"
```

---

### Task 2: 将后端迁移至 apps/api/

**Files:**
- Move: 所有后端文件 → `apps/api/`
- Create: 新根 `package.json`
- Modify: `apps/api/package.json`

- [ ] **Step 1: 创建目录并移动所有后端文件**

```bash
mkdir -p apps/api
git mv src apps/api/src
git mv static apps/api/static
git mv debug apps/api/debug
git mv scripts apps/api/scripts
git mv prisma.config.ts apps/api/prisma.config.ts
git mv tsconfig.json apps/api/tsconfig.json
git mv eslint.config.js apps/api/eslint.config.js
git mv package.json apps/api/package.json
```

不要移动：`node_modules`、`.env`、`pnpm-lock.yaml`、`CLAUDE.md`、`README.md`、`docs/`、`.gitignore`

- [ ] **Step 2: 复制 .env 文件（未被 git 跟踪）**

```bash
cp .env apps/api/.env 2>/dev/null || echo "no .env at root, skip"
```

- [ ] **Step 3: 更新 `apps/api/package.json`**

修改两处：
1. `"name": "iam-service"` → `"name": "@iam/api"`
2. 在 `"module"` 字段后添加 `"exports"` 字段：

```json
{
  "name": "@iam/api",
  "type": "module",
  "private": true,
  "module": "index.ts",
  "exports": {
    ".": "./src/app.ts"
  },
  ...
}
```

- [ ] **Step 4: 创建新的根 `package.json`**

```json
{
  "name": "iam-monorepo",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2.5.0"
  }
}
```

- [ ] **Step 5: 重新安装依赖**

```bash
pnpm install
```

预期：pnpm 识别到 workspace，在根安装 turbo，在 apps/api/node_modules 安装后端依赖。

- [ ] **Step 6: 验证后端正常启动**

```bash
cd apps/api && bun run src/index.ts
```

预期：服务在端口 30000 启动，访问 `http://localhost:30000/doc/swagger` 可见文档。

如有 path alias 错误，检查 `apps/api/tsconfig.json` 中的 `paths` 配置是否以 `"baseUrl": "."` 为基准（相对于 apps/api/）。

- [ ] **Step 7: Commit**

```bash
cd ../..
git add -A
git commit -m "chore: 将后端迁移至 apps/api/"
```

---

### Task 3: 创建 packages/shared

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/enums/service.status.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p packages/shared/src/enums
```

- [ ] **Step 2: 创建 `packages/shared/package.json`**

```json
{
  "name": "@iam/shared",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  }
}
```

- [ ] **Step 3: 创建 `packages/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: 创建 `packages/shared/src/enums/service.status.ts`**

将 `apps/api/src/enums/service.status.ts` 的枚举定义原样复制过来：

```typescript
export enum ServiceStatusCode {
  Success = 200,
  Unauthorized = 401,
  UserNotExisting = 4001,
  WrongPassword = 4002,
  Forbidden = 403,
  Maintancing = 4031,
  Failure = 99999,
}
```

- [ ] **Step 5: 创建 `packages/shared/src/index.ts`**

```typescript
export * from "./enums/service.status";
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): 初始化 @iam/shared 包，迁入 ServiceStatusCode 枚举"
```

---

### Task 4: 将 @iam/shared 接入 @iam/api

**Files:**
- Modify: `apps/api/package.json` — 添加 @iam/shared 依赖
- Modify: `apps/api/src/enums/service.status.ts` — 改为 re-export

- [ ] **Step 1: 在 `apps/api/package.json` 的 dependencies 中添加**

```json
"@iam/shared": "workspace:*"
```

- [ ] **Step 2: 将 `apps/api/src/enums/service.status.ts` 改为 re-export**

用以下内容完全替换该文件：

```typescript
export { ServiceStatusCode } from "@iam/shared";
```

现有所有 `import { ServiceStatusCode } from "@/enums/service.status"` 或 `@enums/service.status` 的代码无需修改。

- [ ] **Step 3: 重新安装并验证**

```bash
pnpm install
cd apps/api && bun run src/index.ts
```

预期：后端正常启动，无 import 报错。

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/api/package.json apps/api/src/enums/service.status.ts
git commit -m "feat(api): 从 @iam/shared 消费 ServiceStatusCode 枚举"
```

---

### Task 5: 将动态路由注册改为静态导入

> **背景：** `create-app.ts` 当前使用 `require()` 动态加载路由，导致 TypeScript 无法推断 `typeof app` 的具体路由类型，`hc<AppType>` 无法工作。需改为静态 `import` 使 AppType 携带完整路由类型信息。

**Files:**
- Modify: `apps/api/src/lib/core/create-app.ts`

- [ ] **Step 1: 用静态导入替换 `apps/api/src/lib/core/create-app.ts` 的完整内容**

```typescript
import type { AppBindings } from "@/lib/lib";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { errorHandler } from "@/middlewares/error.handler";
import { pinoLogger } from "../clients/pino";
import defaultHook from "./openapi/default-hook";

// 顶层路由
import authRouter from "@/routes/auth/auth.index";
import internalRouter from "@/routes/internal/internal.index";
import openRouter from "@/routes/open/open.index";
import publicRouter from "@/routes/public/public.index";
import ssoRouter from "@/routes/sso/sso.index";

// admin 子路由
import adminClientRouter from "@/routes/admin/client/client.index";
import adminEmploymentRouter from "@/routes/admin/employment/employment.index";
import adminOrganizationRouter from "@/routes/admin/organization/organization.index";
import adminPositionRouter from "@/routes/admin/position/position.index";
import adminUserRouter from "@/routes/admin/user/user.index";

export function createRouter() {
  return new OpenAPIHono<AppBindings>({
    strict: false,
    defaultHook,
  });
}

export default function createApp() {
  const app = new OpenAPIHono();

  app.use("/static/*", serveStatic({ root: "./" }));

  app.use(logger(
    (str: string, ...args: any[]) => {
      pinoLogger.info(`[INFO] ${new Date().toISOString()} - ${str}`, ...args);
    },
  ));

  app.onError(errorHandler);

  app.route("/", publicRouter);
  app.route("/", authRouter);
  app.route("/", internalRouter);
  app.route("/", openRouter);
  app.route("/", ssoRouter);
  app.route("/", adminClientRouter);
  app.route("/", adminEmploymentRouter);
  app.route("/", adminOrganizationRouter);
  app.route("/", adminPositionRouter);
  app.route("/", adminUserRouter);

  app.doc("/doc", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "IAM Service",
    },
  });

  app.get("/doc/scalar", Scalar({
    content: {
      openapi: "3.0.0",
      info: { version: "1.0.0", title: "IAM Service" },
    },
    url: "/doc",
    cdn: "/static/scalar/api-reference.js",
  }));

  return app;
}
```

- [ ] **Step 2: 验证后端启动且所有路由仍然工作**

```bash
cd apps/api && bun run src/index.ts
```

访问 `http://localhost:30000/doc/swagger`，确认所有路由（/public/\*、/admin/\*、/auth/\*、/sso/\*）都出现在文档中。

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/api/src/lib/core/create-app.ts
git commit -m "refactor(api): 将路由注册改为静态导入以支持 AppType 类型推导"
```

---

### Task 6: 从 @iam/api 导出 AppType

**Files:**
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: 更新 `apps/api/src/app.ts`**

将文件内容改为：

```typescript
import createApp from "./lib/core/create-app";

const app = createApp();

export type AppType = typeof app;
export default app;
```

- [ ] **Step 2: 运行类型检查验证 AppType 可导出**

```bash
cd apps/api && bunx tsc --noEmit 2>&1 | head -20
```

预期：无报错。

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/api/src/app.ts
git commit -m "feat(api): 导出 AppType 以支持 Hono RPC 客户端"
```

---

### Task 7: 脚手架初始化 @iam/admin

**Files:**
- Create: `apps/admin/`（ADP 脚手架生成）

- [ ] **Step 1: 在 apps/ 目录下运行 ADP 脚手架**

```bash
cd apps
pnpm dlx create-umi@latest admin
```

交互选项：
- Template: **Ant Design Pro**
- Language: **TypeScript**
- Package manager: **pnpm**
- 其余选项保持默认

- [ ] **Step 2: 更新 `apps/admin/package.json`**

修改 `"name"` 字段，并在生成的 `package.json` 的对应区块中**追加**以下条目（不要替换已有内容）：

1. 将 `"name"` 改为 `"@iam/admin"`

2. 在 `"devDependencies"` 中追加：
```json
"@iam/api": "workspace:*",
"@hono/zod-openapi": "^1.1.4"
```

3. 在 `"dependencies"` 中追加：
```json
"@iam/shared": "workspace:*",
"hono": "^4.12.8"
```

说明：
- `@iam/api` 作为 devDep（仅引用类型，不打包进前端）
- `@hono/zod-openapi` 作为 devDep（TypeScript 解析 AppType 依赖链时需要其类型定义，版本与 apps/api 保持一致）
- `hono` 作为 dep（`hono/client` 在浏览器运行时需要）

- [ ] **Step 3: 从 monorepo 根重新安装依赖**

```bash
cd ../.. && pnpm install
```

预期：@iam/api 和 @iam/shared 被 symlink 到 apps/admin/node_modules/@iam/。

- [ ] **Step 4: 验证 admin 开发服务器启动**

```bash
cd apps/admin && pnpm dev
```

预期：开发服务器在 `http://localhost:8000` 启动，看到 ADP 默认登录页。

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/admin/
git commit -m "feat(admin): 初始化 Ant Design Pro 管理前端 @iam/admin"
```

---

### Task 8: 配置开发代理和 Hono RPC 客户端

**Files:**
- Modify: `apps/admin/.umirc.ts`
- Create: `apps/admin/src/lib/api-client.ts`

- [ ] **Step 1: 在 `apps/admin/.umirc.ts` 中添加开发代理**

在 `defineConfig({})` 内添加 `proxy` 配置项：

```typescript
proxy: {
  '/public': {
    target: 'http://localhost:30000',
    changeOrigin: true,
  },
  '/admin': {
    target: 'http://localhost:30000',
    changeOrigin: true,
  },
  '/auth': {
    target: 'http://localhost:30000',
    changeOrigin: true,
  },
  '/sso': {
    target: 'http://localhost:30000',
    changeOrigin: true,
  },
  '/internal': {
    target: 'http://localhost:30000',
    changeOrigin: true,
  },
  '/open': {
    target: 'http://localhost:30000',
    changeOrigin: true,
  },
},
```

- [ ] **Step 2: 创建 `apps/admin/src/lib/api-client.ts`**

```typescript
import { hc } from 'hono/client';
import type { AppType } from '@iam/api';

export const apiClient = hc<AppType>('/', {
  init: {
    credentials: 'include',
  },
});
```

说明：base URL 为 `/`，开发时请求被 UMI proxy 转发到 localhost:30000，生产时 nginx 反代同域。

- [ ] **Step 3: 验证 Hono RPC 类型推导**

创建临时文件 `apps/admin/src/lib/_rpc-check.ts`：

```typescript
import { apiClient } from './api-client';

// 仅用于类型检查，运行 tsc --noEmit 验证
async function _checkTypes() {
  const res = await apiClient.public['user-info'].$get();
  if (res.ok) {
    const body = await res.json();
    // 在 IDE 中 hover body.data 应该显示 UserDetailDto 类型
    const _username: string = body.data.username;
    const _roles: string[] = body.data.roles;
    console.log(_username, _roles);
  }
}
```

- [ ] **Step 4: 运行类型检查**

```bash
cd apps/admin && bunx tsc --noEmit 2>&1 | head -30
```

**如果无错误**：Hono RPC 类型推导正常。删除 `_rpc-check.ts` 并继续。

**如果 `apiClient.public['user-info'].$get` 有类型错误**：说明 `@hono/zod-openapi` 的 `.openapi()` 路由类型与 `hc` 不完全兼容。在 Task 9 后记录具体错误信息，作为 Plan 2 的参考（Plan 2 的业务页面可以直接使用 `fetch` + 手动类型，或在 Task 5 为每个需要的路由添加同路径的标准 `.get()/.post()` 包装）。

- [ ] **Step 5: Commit**

```bash
git add apps/admin/.umirc.ts apps/admin/src/lib/api-client.ts
git rm -f apps/admin/src/lib/_rpc-check.ts 2>/dev/null || true
git commit -m "feat(admin): 配置开发代理和 Hono RPC 客户端"
```

---

### Task 9: 实现 SSO 认证与 Admin Role 鉴权

**Files:**
- Modify: `apps/admin/src/app.tsx`
- Modify: `apps/admin/src/access.ts`
- Create: `apps/admin/src/pages/403.tsx`
- Modify: `apps/admin/.umirc.ts`

- [ ] **Step 1: 确认 admin role 的实际角色码**

```bash
grep -r "admin\|role" apps/api/src/services/role/ --include="*.ts" -n | head -20
```

记录实际的 admin role 码（示例中用 `"admin"` 占位，请替换为实际值）。

- [ ] **Step 2: 更新 `apps/admin/src/app.tsx` 中的 `getInitialState`**

找到脚手架生成的 `getInitialState` 函数，替换其实现：

```typescript
export async function getInitialState(): Promise<{
  currentUser?: { username: string; roles: string[] };
}> {
  try {
    const res = await fetch('/public/user-info', {
      credentials: 'include',
    });

    if (res.status === 401) {
      // 未登录 → 跳转 SSO 授权端点
      // client 参数需与数据库中 admin 前端对应的 OAuth client code 一致
      const redirectUrl = encodeURIComponent(window.location.href);
      window.location.href = `/sso/authorize?client=admin&redirectUrl=${redirectUrl}`;
      return {};
    }

    if (res.ok) {
      const body = await res.json();
      return {
        currentUser: {
          username: body.data.username as string,
          roles: (body.data.roles as string[]) ?? [],
        },
      };
    }
  } catch {
    // 网络错误 — 不跳转，显示错误状态
  }
  return {};
}
```

注意：`client=admin` 中的 `admin` 需替换为实际在 `client` 表中注册的管理后台 client code。

- [ ] **Step 3: 更新 `apps/admin/src/access.ts`**

替换脚手架生成的内容：

```typescript
export default function access(initialState: {
  currentUser?: { username: string; roles: string[] };
}) {
  const roles = initialState?.currentUser?.roles ?? [];

  return {
    isAdmin: roles.includes('admin'), // 替换为实际 admin role 码
  };
}
```

- [ ] **Step 4: 创建 `apps/admin/src/pages/403.tsx`**

```typescript
import { Button, Result } from 'antd';
import { history } from '@umijs/max';

export default function NoPermission() {
  return (
    <Result
      status="403"
      title="无访问权限"
      subTitle="您的账号没有访问管理后台的权限，请联系管理员。"
      extra={
        <Button type="primary" onClick={() => history.push('/')}>
          返回首页
        </Button>
      }
    />
  );
}
```

- [ ] **Step 5: 在 `apps/admin/.umirc.ts` 中配置 403 页面**

在 `defineConfig({})` 内添加：

```typescript
unAccessible: '/403',
```

- [ ] **Step 6: 添加左侧导航菜单占位**

在 `.umirc.ts` 的 `routes` 配置中，添加四个模块的菜单项（页面内容在 Plan 2 中实现）：

```typescript
routes: [
  { path: '/', redirect: '/users' },
  { path: '/users', name: '用户管理', icon: 'team', component: './users/index' },
  { path: '/organizations', name: '组织管理', icon: 'apartment', component: './organizations/index' },
  { path: '/positions', name: '职位管理', icon: 'solution', component: './positions/index' },
  { path: '/employments', name: '雇佣关系', icon: 'profile', component: './employments/index' },
  { path: '/403', component: './403', hideInMenu: true },
],
```

- [ ] **Step 7: 为每个模块创建最小占位页面**

为每个路由创建空页面，避免 404，Plan 2 中再实现具体内容：

`apps/admin/src/pages/users/index.tsx`：
```typescript
export default function UsersPage() {
  return <div>用户管理 — 即将上线</div>;
}
```

`apps/admin/src/pages/organizations/index.tsx`：
```typescript
export default function OrganizationsPage() {
  return <div>组织管理 — 即将上线</div>;
}
```

`apps/admin/src/pages/positions/index.tsx`：
```typescript
export default function PositionsPage() {
  return <div>职位管理 — 即将上线</div>;
}
```

`apps/admin/src/pages/employments/index.tsx`：
```typescript
export default function EmploymentsPage() {
  return <div>雇佣关系 — 即将上线</div>;
}
```

- [ ] **Step 8: 端对端验证认证流程**

前提：确保 `client` 表中已有 code 为 `admin`（或 Step 2 中使用的实际 client code）的记录。

```bash
# Terminal 1 — 启动后端
cd apps/api && bun run src/index.ts

# Terminal 2 — 启动前端
cd apps/admin && pnpm dev
```

验证步骤：
1. 浏览器访问 `http://localhost:8000`
2. 预期：被重定向到 SSO 登录页（/public/user-info 返回 401）
3. 用有 admin role 的账号登录
4. 预期：重定向回 admin 后台，左侧显示四个菜单项
5. 用无 admin role 的账号登录
6. 预期：显示 403 无权限页面

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src/app.tsx apps/admin/src/access.ts apps/admin/src/pages/ apps/admin/.umirc.ts
git commit -m "feat(admin): 实现 SSO 认证与 admin role 鉴权流程"
```

---

## 完成后的验证清单

- [ ] `pnpm dev`（从 monorepo 根）能同时启动 api 和 admin
- [ ] `http://localhost:30000/doc/swagger` 显示所有路由（约 30+ 条）
- [ ] `http://localhost:8000` 未登录时跳转到 SSO 登录页
- [ ] 登录后有 admin role 的用户可以看到四个菜单项
- [ ] 登录后无 admin role 的用户看到 403 页面
- [ ] `bunx tsc --noEmit` 在 apps/api 和 apps/admin 中均无报错

---

## 已知前置依赖

1. **数据库中需要一条 admin client 记录**：在 `client` 表中创建一条 `code=admin`（或自定义）的 OAuth client 记录，供 SSO authorize 端点识别。
2. **Hono RPC 兼容性结果**：Task 8 验证的结果决定 Plan 2 的 API 调用方式。若完全兼容则用 `apiClient`；若有限兼容则 Plan 2 对不兼容路由用类型化 `fetch`。
