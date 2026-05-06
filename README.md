# IAM (Identity and Access Management) Monorepo

基于 pnpm workspace + Turborepo 的身份与访问管理平台。仓库同时包含 Bun + Hono 后端、管理后台前端和 SSO 门户前端，覆盖用户、组织、职位、雇佣关系、角色权限、客户端管理和单点登录等 IAM 核心能力。

## ✨ 特性

- **Monorepo 一体化开发**：pnpm workspace 管理依赖，Turborepo 编排开发、构建和检查任务
- **三端同仓**：`apps/api` 提供 REST / tRPC / OpenAPI 服务，`apps/admin` 提供管理后台，`apps/sso` 提供登录与用户自助门户
- **类型安全调用**：管理后台通过 `@trpc/client` 消费 `@iam/api/trpc` 暴露的 `AppRouter` 类型
- **声明式后端装配**：`apps/api/app.config.ts` 声明 API tier，路由和 tier 中间件通过 Bun glob 自动发现
- **Drizzle + PostgreSQL**：后端使用 Drizzle ORM v1 relations 和 PostgreSQL，schema 与 relations 拆分在 `apps/api/src/db/`
- **共享代码包**：`packages/shared` 收敛跨端共用枚举和状态码
- **企业集成能力**：企业微信、短信服务、ORCAS 集成、导入导出、权限委托和 MySQL 到 PostgreSQL 迁移脚本

## 📦 仓库结构

```text
iam-service/
├── apps/
│   ├── api/                         # 后端服务（@iam/api）
│   │   ├── src/
│   │   │   ├── routes/              # public/open/admin/internal/sso/auth/trpc 分组路由
│   │   │   ├── services/            # 领域服务、repository、schema、type
│   │   │   ├── db/                  # Drizzle schema、relations、SQL 脚本和连接
│   │   │   ├── trpc/                # tRPC root router 与上下文
│   │   │   ├── lib/                 # 框架胶水、日志、外部集成、分页/OpenAPI 工具
│   │   │   ├── middlewares/         # 认证、错误处理、404 等中间件
│   │   │   └── env.ts               # 环境变量 Zod 校验
│   │   ├── static/                  # Scalar / Swagger 静态资源
│   │   ├── scripts/                 # 维护和迁移脚本
│   │   ├── app.config.ts            # API tier、OpenAPI、Scalar 配置
│   │   ├── drizzle.config.ts        # Drizzle Kit 配置
│   │   ├── Dockerfile
│   │   └── .env.example
│   ├── admin/                       # 管理后台（@iam/admin）
│   │   ├── src/pages/               # users / organizations / positions / employments / 403
│   │   ├── src/lib/api-client.ts    # tRPC client
│   │   ├── src/services/            # 页面侧服务封装
│   │   ├── src/models/              # Umi Max model
│   │   ├── .umirc.ts                # 路由、base、proxy 配置
│   │   └── .env.example
│   └── sso/                         # SSO 门户（@iam/sso）
│       ├── src/pages/               # login / reset-password / user-info / system-maintenance
│       ├── src/services/            # auth/open/public API 调用
│       ├── src/assets/              # 登录页和密码页图片素材
│       ├── .umirc.ts
│       └── .env.example
├── packages/
│   └── shared/                      # 跨端共享枚举与工具（@iam/shared）
├── docker/                          # 本地依赖栈和开发 compose 文件
├── docs/                            # 架构评审、设计稿和实施计划
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### 后端装配模型

`apps/api/app.config.ts` 中的 `tiers` 决定根路径和文档分组。当前 tier 为：

- `/public`：通用用户 API
- `/open`：公开 API
- `/admin`：管理端 API
- `/internal`：内部 API
- `/sso`：单点登录 API
- `/auth`：认证 API
- `/rpc`：tRPC API

`createApp` 会自动扫描 `apps/api/src/routes/**/*.index.ts` 并挂载到对应 tier；`apps/api/src/routes/*/_middleware.ts` 会作为 tier 级中间件加载。新增普通 REST 路由时通常不需要手动改入口文件，新增 tier 或 tRPC root 组合时才需要更新配置/组合器。

## 🛠️ 技术栈

### 后端（`apps/api`）

- **运行时**：Bun
- **Web 框架**：Hono + `@hono/zod-openapi`
- **RPC**：tRPC v11
- **API 文档**：Scalar UI + OpenAPI 3.1
- **数据库**：PostgreSQL + Drizzle ORM v1 / Drizzle Kit
- **缓存**：Redis / ioredis
- **验证与错误**：Zod、自定义 `CustomError`、统一响应封装
- **认证/加密**：bcrypt / bcrypt-ts、sm-crypto
- **基础设施**：Pino、hono-pino、axios、CSV/XLSX 导入导出工具
- **代码检查**：ESLint（Antfu 配置）

### 前端（`apps/admin`、`apps/sso`）

- **框架**：Umi Max + React 18
- **UI**：Ant Design + `@ant-design/pro-components`
- **管理后台 API**：`@trpc/client` + `@iam/api/trpc` 类型推导
- **SSO 门户 API**：封装 `fetch`，统一处理 cookie、业务状态码和跳转
- **格式化**：Prettier + `prettier-plugin-organize-imports`

### 工程

- **包管理**：pnpm workspace（根 `packageManager` 为 `pnpm@10.33.2`）
- **任务编排**：Turborepo
- **语言**：TypeScript 6 / native preview 工具链

## 🚀 快速开始

### 环境要求

- Bun 1.x
- Node.js 18+（前端和工具链使用；Dockerfile 当前基于 Node 24 镜像安装依赖）
- pnpm 10.x
- PostgreSQL（本地 compose 使用 `postgres:18`）
- Redis

### 安装依赖

```bash
pnpm install
```

### 启动本地依赖

推荐先启动 PostgreSQL 与 Redis：

```bash
docker compose -f docker/docker-compose-dependency.yml up -d db redis
```

该 compose 文件也包含 `db-mysql`，主要用于历史数据迁移或对照调试；当前后端运行时主线使用 PostgreSQL。

### 配置环境变量

```bash
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/sso/.env.example apps/sso/.env.local
```

本地 PostgreSQL 对应的后端连接串可设置为：

```dotenv
DATABASE_URL=postgresql://iam:iam_password@localhost:5432/iam_db?schema=public
```

### 初始化数据库

快速同步本地库：

```bash
pnpm --filter @iam/api db:push
```

需要生成并执行迁移时：

```bash
pnpm --filter @iam/api db:generate
pnpm --filter @iam/api db:migrate
```

### 启动应用

```bash
pnpm dev
```

常用访问地址：

- 后端服务：<http://localhost:30000>
- Scalar API 文档首页：<http://localhost:30000>
- 管理后台：默认 `http://localhost:8001/iam-admin`（复制 `apps/admin/.env.example` 后）
- SSO 门户：默认 `http://localhost:8000/iam-sso`（复制 `apps/sso/.env.example` 后）

### 单独启动子项目

```bash
pnpm --filter @iam/api dev
pnpm --filter @iam/admin dev
pnpm --filter @iam/sso dev
```

## 🧭 开发命令

### 根目录

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
```

### 后端

```bash
pnpm --filter @iam/api dev
pnpm --filter @iam/api serve
pnpm --filter @iam/api lint
pnpm --filter @iam/api lint:fix
pnpm --filter @iam/api typecheck

pnpm --filter @iam/api db:generate
pnpm --filter @iam/api db:migrate
pnpm --filter @iam/api db:push
pnpm --filter @iam/api migrate:mysql-to-postgres
```

### 前端

```bash
pnpm --filter @iam/admin dev
pnpm --filter @iam/admin build
pnpm --filter @iam/admin format
pnpm --filter @iam/admin typecheck

pnpm --filter @iam/sso dev
pnpm --filter @iam/sso build
pnpm --filter @iam/sso format
pnpm --filter @iam/sso typecheck
```

## 🧩 开发指南

### 添加 REST API

1. 在 `apps/api/src/services/<domain>/` 中补充 `*.schema.ts`、`*.repository.ts`、`*.service.ts` 和 `*.type.ts`
2. 在 `apps/api/src/routes/<tier>/<domain>/` 下新增或更新 `*.routes.ts`、`*.handlers.ts`、`*.index.ts`
3. 如需业务操作封装或 tRPC 复用，可补充 `*.ops.ts`
4. `*.index.ts` 会被 `createApp` 自动发现；只有新增 tier 时才需要改 `apps/api/app.config.ts`
5. tier 级中间件放在 `apps/api/src/routes/<tier>/_middleware.ts`

### 添加 tRPC API

1. 在对应路由目录新增或更新 `*.trpc.ts`
2. 在 `apps/api/src/trpc/routers/<group>/index.ts` 中组合到 group router
3. 管理后台通过 `apps/admin/src/lib/api-client.ts` 中的 `apiClient` 调用，类型来自 `@iam/api/trpc`

### 修改数据库 Schema

1. 编辑 `apps/api/src/db/schema/core/*.ts`
2. 如有关联查询，更新 `apps/api/src/db/relations/core/*.ts`
3. 确保 schema / relations 被对应 `index.ts` 导出
4. 本地快速同步：`pnpm --filter @iam/api db:push`
5. 迁移式变更：`pnpm --filter @iam/api db:generate && pnpm --filter @iam/api db:migrate`

核心表覆盖 `user`、`organization`、`organization_closure`、`position`、`employment`、`role`、`privilege`、`client`、`login_log` 以及多类角色、组织、职位和委托关联表；登录会话主要存储在 Redis。

## ⚙️ 环境变量

### 后端（`apps/api/.env`）

以 `apps/api/.env.example` 和 `apps/api/src/env.ts` 为准：

| 变量名                          | 说明                                         | 默认值/示例          |
| ------------------------------- | -------------------------------------------- | -------------------- |
| `DATABASE_URL`                  | PostgreSQL 连接字符串，可带 `?schema=public` | `postgresql://...`   |
| `REDIS_URL`                     | Redis 地址                                   | `localhost`          |
| `REDIS_PORT`                    | Redis 端口                                   | `6379`               |
| `REDIS_DB`                      | Redis DB 编号                                | `0`                  |
| `PORT`                          | API 监听端口                                 | `30000`              |
| `NODE_ENV`                      | 运行环境；生产环境会关闭 OpenAPI 文档        | `development`        |
| `LOG_LEVEL`                     | Pino 日志级别                                | `info`               |
| `IAM_SECRET_KEY`                | 签名/加密密钥                                | 必填                 |
| `PASSWORD_HASH_ROUNDS`          | 密码哈希轮数                                 | `10`                 |
| `DEFAULT_USER_PASSWORD`         | 默认用户密码                                 | `default123`         |
| `MAGIC_CODE`                    | 特殊操作验证码                               | 必填                 |
| `WX_CORPID` / `WX_CORPSECRET`   | 企业微信配置                                 | 必填                 |
| `SMS_URL` / `SMS_SIGNATURE_KEY` | 短信服务配置                                 | 必填                 |
| `ORCAS_URL`                     | ORCAS 服务地址                               | 必填                 |
| `PURVEYOR_PARENT_ORG`           | 供应商父组织 ID                              | 必填                 |
| `REDIS_EXPIRE_TIME`             | Redis 默认过期时间（秒）                     | `86400`              |
| `AUTH_CODE_EXPIRE_TIME`         | 授权码过期时间（秒）                         | `300`                |
| `LOGIN_ENDPOINT`                | 登录端点                                     | `/auth/login`        |
| `AUTHORIZATION_ENDPOINT`        | 授权端点                                     | `/auth/authorize`    |
| `LOGOUT_ENDPOINT`               | 登出端点                                     | `/auth/logout`       |
| `THIRDPARTY_OA_ENDPOINT`        | 第三方 OA 端点                               | `/sso/thirdparty/oa` |

### 管理后台（`apps/admin/.env.local`）

| 变量名                      | 说明                       | 默认值           |
| --------------------------- | -------------------------- | ---------------- |
| `PORT`                      | Umi dev server 端口        | `8001`           |
| `UMI_APP_SSO_AUTHORIZE_URL` | SSO 授权端点               | `/sso/authorize` |
| `UMI_APP_SSO_LOGOUT_URL`    | SSO 登出端点               | `/sso/logout`    |
| `UMI_APP_SSO_CLIENT_CODE`   | 当前应用注册的 client code | `iam`            |
| `UMI_APP_ADMIN_ROLE_CODE`   | 允许访问后台的角色码       | `iam:admin`      |

### SSO 门户（`apps/sso/.env.local`）

| 变量名                    | 说明                               | 默认值                                          |
| ------------------------- | ---------------------------------- | ----------------------------------------------- |
| `PORT`                    | Umi dev server 端口                | `8000`                                          |
| `UMI_APP_API_PREFIX`      | API 前缀；开发环境通常走同域 proxy | `/api/iam` 示例                                 |
| `UMI_APP_SSO_CLIENT_CODE` | SSO 客户端代码                     | `iam`                                           |
| `UMI_APP_WELL_KNOWN_URL`  | authentication configuration 端点  | `/sso/.well-known/authentication-configuration` |

## 📚 API 文档

开发环境启动后访问 <http://localhost:30000> 打开 Scalar 文档首页。各 tier 的 OpenAPI JSON 位于对应路径的 `/doc`，例如：

- <http://localhost:30000/public/doc>
- <http://localhost:30000/admin/doc>
- <http://localhost:30000/sso/doc>
- <http://localhost:30000/rpc/doc>

`NODE_ENV=production` 时 OpenAPI/Scalar 默认关闭。

## 🗄️ 数据库

当前主库为 PostgreSQL，Drizzle schema 位于 `apps/api/src/db/schema/`，relations 位于 `apps/api/src/db/relations/`，SQL 辅助脚本位于 `apps/api/src/db/sql/`。

常用命令：

```bash
pnpm --filter @iam/api db:push
pnpm --filter @iam/api db:generate
pnpm --filter @iam/api db:migrate
```

历史 MySQL 数据迁移脚本：

```bash
pnpm --filter @iam/api migrate:mysql-to-postgres
```

## 🚢 部署

### 后端

```bash
pnpm install --frozen-lockfile
pnpm --filter @iam/api db:migrate
pnpm --filter @iam/api serve
```

### 前端

```bash
pnpm --filter @iam/admin build
pnpm --filter @iam/sso build
```

构建产物分别位于：

- `apps/admin/dist`，默认 base 为 `/iam-admin`
- `apps/sso/dist`，默认 base 为 `/iam-sso`

静态服务器需要把 `/public`、`/open`、`/admin`、`/internal`、`/sso`、`/auth`、`/rpc` 等后端路径反向代理到 API 服务。

### Docker

仓库提供后端镜像构建文件，构建上下文为仓库根目录：

```bash
docker build -f apps/api/Dockerfile -t iam-api .
docker run --rm -p 30000:30000 --env-file apps/api/.env iam-api
```

本地依赖栈：

```bash
docker compose -f docker/docker-compose-dependency.yml up -d
```

`docker/docker-compose-dev.yml` 当前包含 MySQL 主从和 API 编排，更适合历史 MySQL 场景或迁移验证；用于当前 PostgreSQL 主线前请先核对 `DATABASE_URL`。

## 🔧 调试与排障

- 日志：`LOG_LEVEL` 控制 Pino 输出级别
- API 调试：开发环境访问 Scalar 文档首页 <http://localhost:30000>
- 数据调试：Drizzle Kit 命令或直接连接本地 PostgreSQL
- 前端代理：查看 `apps/admin/.umirc.ts` 和 `apps/sso/.umirc.ts`
- 类型检查：`pnpm typecheck`

## 🤝 贡献指南

1. Fork 并创建功能分支
2. 遵守代码规范（后端 ESLint，前端 Prettier）
3. 必要时补充文档、类型和迁移
4. 提交 Pull Request 描述变更范围、环境变量或数据库变更

提交信息使用 Conventional Commits：

```text
<类型>[可选作用域]: <描述>
```

常用类型：`feat`、`fix`、`docs`、`style`、`refactor`、`test`、`chore`

## 📄 许可证

待补充。

---

**最后更新**：2026-05-06
