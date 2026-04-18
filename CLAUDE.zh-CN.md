# CLAUDE.zh-CN.md

本文件为 Claude Code (claude.ai/code) 提供在此代码仓库中工作的指引。

## 项目概述

本仓库是一个基于 **pnpm + Turborepo 的 Monorepo** 的 IAM（身份与访问管理）平台，包含：

- **`apps/api`**（`@iam/api`）— 后端服务（Bun + Hono + Prisma）
- **`apps/admin`**（`@iam/admin`）— 管理后台前端（UMI Max + React + Ant Design Pro）
- **`packages/shared`**（`@iam/shared`）— 跨包共享代码（枚举、常量等）

关键特征：

- **包管理器**：pnpm（根 `package.json` 中 `packageManager: pnpm@10.33.0`）
- **任务编排**：[Turborepo](https://turbo.build/) — `turbo dev / build / lint / typecheck`
- **端到端类型安全**：`apps/admin` 通过 `hono/client` 从 `@iam/api` 引入 `AppType`（见 `apps/admin/src/lib/api-client.ts`），前端发起的每个请求都具备类型推导
- **工作区布局**：`pnpm-workspace.yaml` 中声明 `apps/*` 与 `packages/*`

## 仓库结构

```
iam-service/
├── apps/
│   ├── api/                # 后端（@iam/api）— Bun + Hono
│   │   ├── src/
│   │   ├── static/swagger/
│   │   ├── scripts/
│   │   ├── prisma.config.ts
│   │   ├── eslint.config.js
│   │   └── tsconfig.json
│   └── admin/              # 管理后台前端（@iam/admin）— UMI Max + React
│       ├── src/
│       │   ├── pages/      # users / organizations / positions / employments / 403
│       │   ├── components/
│       │   ├── models/
│       │   ├── services/
│       │   ├── lib/api-client.ts
│       │   ├── access.ts
│       │   └── app.ts
│       ├── mock/
│       ├── .umirc.ts       # 路由、proxy、UMI 配置
│       └── .env.example    # UMI_APP_* 变量
├── packages/
│   └── shared/             # @iam/shared — 枚举、跨端常量
│       └── src/
│           ├── enums/service.status.ts
│           └── index.ts
├── docs/
├── pnpm-workspace.yaml
├── turbo.json
└── package.json            # 根脚本：turbo dev/build/lint/typecheck
```

## 开发命令

### 前置条件

- **Bun**（与 `apps/api` 中 `devEngines.runtime` 匹配）— 用于运行后端
- **Node.js ≥ 18** — UMI Max 构建所需
- **pnpm ≥ 10** — 根 `packageManager` 固定为 `pnpm@10.33.0`
- **MySQL** — 通过 `DATABASE_URL` 接入
- **Redis** — 通过 `REDIS_URL` / `REDIS_PORT` / `REDIS_DB` 配置

### 根级命令（Turborepo）

```bash
pnpm install        # 安装所有工作区依赖
pnpm dev            # turbo dev — 并行运行所有包的 dev
pnpm build          # turbo build — 遵循 ^build 依赖顺序
pnpm lint           # turbo lint
pnpm typecheck      # turbo typecheck
```

### 后端（`apps/api` — `@iam/api`）

```bash
pnpm --filter @iam/api dev          # bun --hot src/index.ts
pnpm --filter @iam/api serve        # 生产：bun run src/index.ts
pnpm --filter @iam/api lint
pnpm --filter @iam/api lint:fix
pnpm --filter @iam/api typecheck    # bunx tsc --noEmit

# Prisma（通过 --filter 在 apps/api 下执行）
pnpm --filter @iam/api exec prisma generate
pnpm --filter @iam/api exec prisma migrate dev --name <name>
pnpm --filter @iam/api exec prisma studio
```

### 管理后台（`apps/admin` — `@iam/admin`）

```bash
pnpm --filter @iam/admin dev        # max dev（UMI Max）
pnpm --filter @iam/admin build      # max build → apps/admin/dist
pnpm --filter @iam/admin format     # prettier
```

## 架构

### 后端（`apps/api/src`）

- **`app.ts`** — Hono 应用装配与 OpenAPI 注册
- **`index.ts`** — 服务入口，导出 Bun server 配置
- **`env.ts`** — 使用 Zod 做环境变量校验
- **`routes/`** — 按访问级别分组的 API：
  - `admin/` — 后台管理接口（client、employment、organization、position、user）
  - `auth/` — 认证
  - `internal/` — 内部服务调用
  - `open/` — 开放 API
  - `public/` — 公共 API
  - `sso/` — OIDC 单点登录
- **`services/`** — 业务逻辑层，按业务域划分文件夹，每个包含：
  - `*.service.ts` — 主要服务函数
  - `*.repository.ts` — Prisma 调用
  - `*.schema.ts` — Zod 校验
  - `*.type.ts` — TS 类型
- **`db/`** — `schema.prisma`、`generated/` 下的 Prisma 客户端与 Zod schema、`sql/` 下的原生 SQL
- **`lib/`** — 外部客户端（Redis、Pino、OpenAPI 工具）
- **`middlewares/`** — Hono 中间件（错误处理等）
- **`utils/`** — HTTP、Zod、分页工具
- **`enums/`** — 状态码、使用类型等
- **`errors/`** — 继承自 `CustomError` 的自定义错误

路径别名（见 `apps/api/tsconfig.json`）：`@/*`、`@db`、`@lib/*`、`@services/*`、`@repositories/*`、`@schemas/*`、`@enums/*`、`@mapper/*`、`@errors/*`、`@middlewares/*`、`@utils/*`、`@prisma-client/*`。

### 管理后台（`apps/admin/src`）

- **`.umirc.ts`** — UMI 配置：路由定义、`proxy`（将 `/admin`、`/auth`、`/public`、`/sso`、`/internal`、`/open` 代理到后端）、`antd`、`access`、`model`、`initialState`、`request`、`layout`
- **`app.ts`** — UMI 运行时配置
- **`access.ts`** — 访问策略（基于 `UMI_APP_ADMIN_ROLE_CODE` 判断角色）
- **`pages/`** — `users`、`organizations`、`positions`、`employments`、`403`
- **`lib/api-client.ts`** — `hc<AppType>('/')` 类型安全的 Hono 客户端；`@iam/api` 中定义的每条路由都能被正确推导
- **`models/`** — UMI 数据流模型
- **`services/`**、**`components/`**、**`utils/`**

环境变量 — UMI Max 仅注入 `UMI_APP_` 前缀的变量：

- `UMI_APP_SSO_AUTHORIZE_URL`（默认 `/sso/authorize`）
- `UMI_APP_SSO_CLIENT_CODE`（默认 `iam`）
- `UMI_APP_ADMIN_ROLE_CODE`（默认 `iam:admin`）

本地覆盖：将 `apps/admin/.env.example` 复制为 `apps/admin/.env.local`。

### 共享包（`packages/shared`）

- `@iam/shared` — `apps/api` 与 `apps/admin` 均通过 `workspace:*` 引用
- 当前从 `src/enums/service.status.ts` 导出 `ServiceStatusCode` 等状态码
- 新增跨端共用的常量/枚举请放在此处，避免在两个应用间复制

### 关键模式

1. **路由处理器**：Hono + `@hono/zod-openapi`（OpenAPI 感知 + Zod 校验）
2. **服务层**：业务逻辑写在 `*.service.ts`，DB 访问隔离到 `*.repository.ts`
3. **错误处理**：自定义错误携带 `ServiceStatusCode`，由 `errorHandler` 中间件统一捕获
4. **校验**：Zod schema 同时驱动运行时校验与 TS 类型
5. **分页**：`@/utils/page.util` 的 `paginate` 工具
6. **日志**：Pino 在 `@/lib/clients/pino` 中配置，并通过 `app.ts` 的中间件接入
7. **类型化 RPC**：前端通过 `hc<AppType>` 消费后端类型 — 保持 `apps/api` 在 `./src/app.ts` 的导出类型正确

### 数据流

1. 请求 → 路由处理器（`@hono/zod-openapi` 校验）→ Service → Repository → Prisma → 数据库
2. 响应 ← Service 格式化数据 ← Repository 返回 Prisma 模型 ← 数据库
3. 前端（`apps/admin`）通过 `apps/admin/src/lib/api-client.ts` 中的 `apiClient` 调用后端，类型通过 `@iam/api` 的 `AppType` 导出共享

## 环境变量

### 后端（`apps/api/.env`）

完整 Schema 见 `apps/api/src/env.ts`，必需变量：

- `DATABASE_URL` — MySQL 连接字符串（Prisma 直接读取）
- `REDIS_URL`、`REDIS_PORT`、`REDIS_DB`
- `PORT`（默认 30000）
- `IAM_SECRET_KEY`
- `WX_CORPID`、`WX_CORPSECRET`
- `SMS_URL`、`SMS_SIGNATURE_KEY`
- `ORCAS_URL`
- `LOG_LEVEL`（默认 `info`）
- `LOGIN_ENDPOINT`、`AUTHORIZATION_ENDPOINT`、`LOGOUT_ENDPOINT`、`THIRDPARTY_OA_ENDPOINT`

模板：`apps/api/.env.example`。通过 `pnpm --filter @iam/api dev/serve` 启动时 CWD 即为 `apps/api`，Bun 会自动加载 `apps/api/.env`；`pnpm --filter @iam/api exec prisma ...` 同理。

### 前端（`apps/admin/.env` / `.env.local`）

仅 `UMI_APP_*` 前缀的变量会注入客户端 — 参见上文。

## 代码风格

- **后端**：ESLint（Antfu 配置）— 必须分号、双引号、最大行长 120（警告）
- **前端**：Prettier + ESLint（`.prettierrc`、`.eslintrc.js`）— `prettier-plugin-organize-imports` 整理导入
- **格式化**：由 ESLint / Prettier 负责，不要引入其他格式化器
- **VS Code**：`.vscode/settings.json` 启用保存时自动修复
- **导入**：`apps/api` 中优先使用路径别名（`@/`、`@services/` 等），避免相对路径

## 核心原则

- **简单优先**：每次变更尽可能少改动文件
- **不走捷径**：定位并修复根因，坚守高级开发者标准
- **最小影响面**：不做无关改动；尊重包边界（不要把只属于 api 的代码泄漏到 shared 包里）

## 测试

当前未配置测试框架。补充测试时可考虑：后端用 `bun:test` 或 Vitest，管理后台用 Vitest / Playwright。

## 部署

### 后端

```bash
pnpm install --frozen-lockfile
pnpm --filter @iam/api exec prisma generate
pnpm --filter @iam/api exec prisma migrate deploy
pnpm --filter @iam/api serve   # 或：bun run apps/api/src/index.ts
```

- 静态资源（Swagger）位于 `apps/api/static/`
- 部署前必须执行数据库迁移（`prisma migrate deploy`）

### 管理后台

```bash
pnpm --filter @iam/admin build  # 产物位于 apps/admin/dist
```

将 `apps/admin/dist` 交由 Nginx / CDN 托管，并将 `/admin`、`/auth`、`/public`、`/sso`、`/internal`、`/open` 反向代理至后端。

## 常见任务

### 新增 API 接口

1. 在 `apps/api/src/services/<业务域>/*.schema.ts` 中添加或扩展 Zod schema
2. 在 `*.service.ts` 中实现业务逻辑，必要时在 repository 中添加新的 DB 查询
3. 在 `apps/api/src/routes/<分组>/` 下添加路由处理器
4. 如果是新路由组，在 `apps/api/src/app.ts` 中挂载
5. 前端通过 `apiClient.<path>.$get/$post(...)` 直接调用，类型自动同步

### 修改数据库 Schema

1. 编辑 `apps/api/src/db/schema.prisma`
2. `pnpm --filter @iam/api exec prisma generate`
3. `pnpm --filter @iam/api exec prisma migrate dev --name <name>`
4. Zod schema 由 `prisma-zod-generator` 自动重新生成

### 在 api 与 admin 间共享代码

- 放入 `packages/shared/src/`，并在 `packages/shared/src/index.ts` 中重新导出
- 两端都通过 `import { ... } from "@iam/shared"` 引用

### 调试

- Pino 日志 — 通过 `LOG_LEVEL` 调整级别
- Scalar API 文档：<http://localhost:30000/doc/scalar>
- 使用 `prisma studio` 查看数据
- UMI 的 proxy 定义在 `apps/admin/.umirc.ts`，切换后端目标时更新这里即可
