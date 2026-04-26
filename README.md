# IAM (Identity and Access Management) Monorepo

一个基于 pnpm workspace + Turborepo 组织的身份与访问管理平台，包含后端服务（Hono + Bun）与管理后台前端（UMI Max + React），提供用户认证、授权、组织管理、角色权限等核心 IAM 能力。

## ✨ 特性

- **Monorepo 一体化开发**：pnpm workspace 管理依赖，Turborepo 编排构建/开发/检查任务
- **后端 + 前端同仓**：`apps/api` 提供 RESTful/OIDC 服务，`apps/admin` 提供管理后台 UI
- **端到端类型安全**：管理后台通过 `hono/client` 直接引入 `@iam/api` 的 `AppType`，请求与响应全程类型推导
- **共享代码包**：`packages/shared` 收敛跨端共用的枚举/常量（如 `ServiceStatusCode`）
- **现代化技术栈**：Bun 运行时、Hono 框架、Prisma ORM、Zod 校验、OpenAPI/Scalar 文档
- **完整的 IAM 能力**：用户/组织/职位/雇佣关系/角色/权限/客户端管理、OIDC 单点登录
- **企业级集成**：企业微信、短信验证、数据导入导出、权限委托

## 📦 仓库结构

```
iam-service/
├── apps/
│   ├── api/                        # 后端服务（@iam/api）
│   │   ├── src/                    # 源代码（详见下文）
│   │   ├── static/                 # Scalar / Swagger 静态资源
│   │   ├── scripts/                # 维护脚本
│   │   ├── app.config.ts           # 应用/Tier 声明式配置（defineConfig）
│   │   ├── Dockerfile              # 多阶段镜像（pnpm install → Bun runtime）
│   │   ├── prisma.config.ts
│   │   ├── eslint.config.js
│   │   ├── tsconfig.json
│   │   ├── .env.example            # 后端环境变量模板
│   │   └── package.json
│   └── admin/                      # 管理后台前端（@iam/admin）
│       ├── src/
│       │   ├── pages/              # 页面：users / organizations / positions / employments / 403
│       │   ├── components/
│       │   ├── models/             # UMI Max 数据流模型
│       │   ├── services/
│       │   ├── lib/api-client.ts   # 基于 hono/client 的类型安全 API 客户端
│       │   ├── access.ts           # 权限策略
│       │   └── app.ts              # UMI 运行时配置
│       ├── mock/
│       ├── .umirc.ts               # UMI 配置与路由定义
│       └── package.json
├── packages/
│   └── shared/                     # 前后端共享代码（@iam/shared）
│       └── src/
│           ├── enums/service.status.ts
│           └── index.ts
├── docs/
├── pnpm-workspace.yaml             # 工作区配置
├── turbo.json                      # Turborepo 流水线
└── package.json                    # 根脚本（turbo dev/build/lint/typecheck）
```

### `apps/api/src` 内部结构

```
src/
├── app.ts                # 一行装配：createApp(appConfig)，导出 AppType
├── index.ts              # 服务入口（Bun server 配置）
├── env.ts                # 环境变量 Zod 校验
├── routes/               # 按访问级别分组：admin / auth / internal / open / public / sso
│                         # 每组可放 _middleware.ts（defineMiddleware）；*.index.ts 由框架自动发现
├── services/             # 业务逻辑层（每模块 *.service / *.repository / *.schema / *.type）
├── trpc/                 # tRPC 装配（trpc.ts、app.router.ts、routers/<group>/index.ts）
├── db/                   # schema.prisma、生成产物、SQL 脚本
├── lib/
│   ├── clients/          # Redis 等外部客户端
│   ├── logger/           # Pino logger
│   ├── integrations/     # 第三方集成（orcas / sms / wechat）
│   └── core/             # 框架胶水：create-app、create-router、define-config、business-op、openapi/、pagination/
├── middlewares/          # 认证、错误处理等 Hono 中间件
├── utils/                # HTTP、Zod、分页工具；tools/glob.ts（Bun glob 自动加载）
├── enums/                # 服务状态码等枚举
├── errors/               # 继承 CustomError 的自定义错误
└── types/                # lib.d.ts（Hono Bindings/路由助手）、global.d.ts
```

> 应用装配采用**声明式配置 + 自动发现**：在 `apps/api/app.config.ts` 中通过 `defineConfig` 声明 tier；`createApp` 通过 `Bun.Glob` 扫描 `routes/**/*.index.ts` 与 `routes/*/_middleware.ts` 自动挂载。新增同组域名无需改动 `app.config.ts`，仅新增 tier 时才需追加配置。

## 🛠️ 技术栈

### 后端（`apps/api`）

- **运行时**：[Bun](https://bun.sh/)
- **Web 框架**：[Hono](https://hono.dev/) + [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi)
- **API 文档**：[`@scalar/hono-api-reference`](https://github.com/scalar/scalar)（Scalar UI）
- **ORM**：[Prisma 7](https://www.prisma.io/) + `@prisma/adapter-mariadb`
- **Schema 生成**：[`prisma-zod-generator`](https://github.com/omar-dulaimi/prisma-zod-generator)
- **认证/加密**：`oidc-provider`、`bcrypt-ts`、`sm-crypto`
- **基础设施**：`ioredis`、`pino` / `hono-pino`、`axios`、`luxon`
- **代码检查**：ESLint（Antfu 配置）

### 前端（`apps/admin`）

- **框架**：[UMI Max](https://umijs.org/) + React 18
- **UI**：[Ant Design](https://ant.design/) + [`@ant-design/pro-components`](https://procomponents.ant.design/)
- **API 客户端**：`hono/client`，直接消费 `@iam/api` 暴露的 `AppType` 实现类型推导
- **代码格式化**：Prettier + `prettier-plugin-organize-imports`

### 工程协作

- **包管理**：[pnpm](https://pnpm.io/) workspace（见 `pnpm-workspace.yaml`）
- **任务编排**：[Turborepo](https://turbo.build/)（见 `turbo.json`）
- **验证**：[Zod](https://zod.dev/)

## 🚀 快速开始

### 环境要求

- **Bun** ≥ 1.0（供 `apps/api` 使用）
- **Node.js** ≥ 18（UMI Max 构建所需）
- **pnpm** ≥ 10（根 `packageManager` 字段为 `pnpm@10.33.0`）
- **MySQL** ≥ 8.0
- **Redis** ≥ 6.0

### 安装与启动

```bash
# 克隆仓库
git clone <repository-url>
cd iam-service

# 在仓库根目录安装所有工作区依赖
pnpm install

# 配置后端环境变量
cp apps/api/.env.example apps/api/.env
# 按需编辑 apps/api/.env

# 配置前端环境变量（可选，UMI 只注入 UMI_APP_ 前缀）
cp apps/admin/.env.example apps/admin/.env.local

# 初始化数据库（在 apps/api 下执行）
pnpm --filter @iam/api exec prisma generate
pnpm --filter @iam/api exec prisma migrate dev

# 一键启动所有应用（turbo 并行）
pnpm dev
```

启动后：

- 后端服务：<http://localhost:30000>
- API 文档（Scalar UI）：<http://localhost:30000/doc/scalar>
- 管理后台：UMI 开发服务器默认监听 `http://localhost:8000`，已在 `.umirc.ts` 中将 `/admin`、`/auth`、`/public`、`/sso`、`/internal`、`/open` 等路径代理至后端

### 仅启动某个子项目

```bash
# 只启动后端
pnpm --filter @iam/api dev

# 只启动管理后台
pnpm --filter @iam/admin dev
```

## 🧭 开发指南

### 根级脚本（Turborepo 编排）

```bash
pnpm dev          # 并行启动所有包的 dev 任务
pnpm build        # 按依赖顺序执行所有包的 build
pnpm lint         # 执行各包的 lint
pnpm typecheck    # 执行各包的 typecheck
```

### 后端常用命令（`apps/api`）

```bash
pnpm --filter @iam/api dev         # bun --hot src/index.ts
pnpm --filter @iam/api serve       # 生产模式启动
pnpm --filter @iam/api lint        # eslint src/
pnpm --filter @iam/api lint:fix
pnpm --filter @iam/api typecheck   # bunx tsc --noEmit

# 数据库
pnpm --filter @iam/api exec prisma generate
pnpm --filter @iam/api exec prisma migrate dev --name <name>
pnpm --filter @iam/api exec prisma studio
```

### 前端常用命令（`apps/admin`）

```bash
pnpm --filter @iam/admin dev        # max dev
pnpm --filter @iam/admin build      # max build
pnpm --filter @iam/admin format     # prettier
```

### 添加新 API 端点

1. 在 `apps/api/src/services/<domain>/*.schema.ts` 中补充 Zod schema
2. 在 `apps/api/src/services/<domain>/*.service.ts` 实现业务逻辑，必要时新增 repository
3. 在 `apps/api/src/routes/<group>/<domain>/` 下补齐 `*.routes.ts` / `*.handlers.ts` / `*.ops.ts` / `*.trpc.ts` / `*.index.ts`
4. **无需手动挂载** —— `*.index.ts` 由 `createApp` 通过 glob 自动发现；新增 tier 才需要在 `apps/api/app.config.ts` 的 `tiers` 中追加，并在 `apps/api/src/trpc/routers/<group>/` 下放置组合器
5. Tier 级中间件放置在 `routes/<group>/_middleware.ts`，使用 `defineMiddleware([...])` 导出
6. 前端可直接通过 `apiClient.xxx.$get(...)` 或 `trpcClient.<group>.<domain>.<op>.query/mutate(...)` 调用，类型自动同步

### 修改数据库 Schema

1. 编辑 `apps/api/src/db/schema.prisma`
2. `pnpm --filter @iam/api exec prisma generate`
3. `pnpm --filter @iam/api exec prisma migrate dev --name <name>`
4. Zod schema 由 `prisma-zod-generator` 自动产出

### 代码风格

- 后端使用 ESLint（Antfu 配置）：双引号、分号必须、最大行长 120
- 前端使用 Prettier + ESLint，`.prettierrc` 为准
- 保存时由 `.vscode/settings.json` 触发自动修复
- 导入路径：后端优先使用 `@/`、`@services/` 等别名（见 `apps/api/tsconfig.json`）

## ⚙️ 环境变量

### 后端（`apps/api/.env`）

详见 `apps/api/.env.example` 及 `apps/api/src/env.ts` 中的 Zod schema：

| 变量名                   | 说明                                  | 默认值   | 必需 |
| ------------------------ | ------------------------------------- | -------- | ---- |
| `DATABASE_URL`           | MySQL 连接字符串（Prisma 使用）       | -        | 是   |
| `REDIS_URL`              | Redis 服务器地址                      | -        | 是   |
| `REDIS_PORT`             | Redis 端口                            | -        | 是   |
| `REDIS_DB`               | Redis 数据库编号                      | -        | 是   |
| `PORT`                   | 服务监听端口                          | `30000`  | 否   |
| `IAM_SECRET_KEY`         | JWT / 签名密钥                        | -        | 是   |
| `WX_CORPID`              | 企业微信 CorpID                       | -        | 是   |
| `WX_CORPSECRET`          | 企业微信 CorpSecret                   | -        | 是   |
| `SMS_URL`                | 短信服务地址                          | -        | 是   |
| `SMS_SIGNATURE_KEY`      | 短信签名密钥                          | -        | 是   |
| `ORCAS_URL`              | 外部 ORCAS 服务地址                   | -        | 是   |
| `LOG_LEVEL`              | 日志级别                              | `"info"` | 否   |
| `LOGIN_ENDPOINT`         | 登录端点                              | -        | 是   |
| `AUTHORIZATION_ENDPOINT` | 授权端点                              | -        | 是   |
| `LOGOUT_ENDPOINT`        | 登出端点                              | -        | 是   |
| `THIRDPARTY_OA_ENDPOINT` | 第三方 OA 端点                        | -        | 是   |

### 前端（`apps/admin/.env` / `.env.local`）

UMI Max 只会将前缀为 `UMI_APP_` 的变量注入到客户端：

| 变量名                      | 说明                            |
| --------------------------- | ------------------------------- |
| `UMI_APP_SSO_AUTHORIZE_URL` | SSO 授权端点（默认 `/sso/authorize`） |
| `UMI_APP_SSO_CLIENT_CODE`   | 当前应用注册的 client code（默认 `iam`） |
| `UMI_APP_ADMIN_ROLE_CODE`   | 允许访问后台的角色码（默认 `iam:admin`） |

> `.env` 与 `.env.local` 均不会被提交，参考对应目录下的 `.env.example` 按需复制。

## 📚 API 文档

- 启动后端后访问 <http://localhost:30000/doc/scalar>（Scalar UI）
- 路由分组：
  - `/admin/*` — 后台管理接口
  - `/auth/*` — 认证接口
  - `/sso/*` — OIDC 单点登录
  - `/public/*` — 公共接口
  - `/open/*` — 对外开放接口
  - `/internal/*` — 服务间内部接口

## 🗄️ 数据库

核心模型：`User`、`Organization`（闭包表）、`Position`、`Employment`、`Role`、`Privilege`、`Client`、`Session`。

```bash
# 修改 apps/api/src/db/schema.prisma 后：
pnpm --filter @iam/api exec prisma generate
pnpm --filter @iam/api exec prisma migrate dev --name <name>

# 生产环境
pnpm --filter @iam/api exec prisma migrate deploy
```

## 🚢 部署

### 后端

```bash
pnpm install --frozen-lockfile
pnpm --filter @iam/api exec prisma generate
pnpm --filter @iam/api exec prisma migrate deploy
pnpm --filter @iam/api serve    # 或 bun run apps/api/src/index.ts
```

### 前端

```bash
pnpm --filter @iam/admin build  # 产物在 apps/admin/dist
```

将 `apps/admin/dist` 产物部署到静态服务器（Nginx/CDN），并将 `/admin`、`/auth`、`/public`、`/sso`、`/internal`、`/open` 反向代理至后端。

### Docker

仓库已提供多阶段 `apps/api/Dockerfile`（pnpm 安装依赖 → Bun 运行时）。**构建上下文为仓库根目录**：

```bash
docker build -f apps/api/Dockerfile -t iam-api .
docker run --rm -p 30000:30000 --env-file apps/api/.env iam-api
```

## 🔧 调试与故障排除

- 日志：Pino（`LOG_LEVEL` 控制级别：`trace` / `debug` / `info` / `warn` / `error` / `fatal`）
- API 调试：Scalar UI
- 数据调试：`prisma studio`
- UMI 运行时调试：浏览器 DevTools + `.umirc.ts` 中的 `proxy` 配置

## 🤝 贡献指南

1. Fork 并创建功能分支
2. 遵守代码规范（ESLint / Prettier）
3. 必要时补充文档与类型
4. 提交 Pull Request 描述变更

约定式提交（Conventional Commits）：

```
<类型>[可选作用域]: <描述>
```

常用类型：`feat`、`fix`、`docs`、`style`、`refactor`、`test`、`chore`

## 📄 许可证

[根据项目实际情况添加]

---

**最后更新**：2026-04-26
