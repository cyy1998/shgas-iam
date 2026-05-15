# IAM (Identity and Access Management) Monorepo

基于 pnpm workspace + Turborepo 的身份与访问管理平台。仓库包含公共 IAM API、管理端 API、管理后台前端和 SSO 门户前端，并把数据库层、API 基础设施和跨端枚举拆分为独立 workspace package。

## ✨ 特性

- **Monorepo 一体化开发**：pnpm workspace 管理依赖，Turborepo 编排开发、构建和检查任务
- **服务分层**：`apps/api` 承载 public/open/internal/sso/auth 等公共能力，`apps/admin-api` 承载 admin REST 与管理端 tRPC
- **三类共享包**：`packages/db` 提供 Drizzle schema/relations/client/migrations，`packages/api-core` 提供 Hono/OpenAPI/tRPC/Redis/中间件等基础设施，`packages/contracts` 提供跨端共享枚举
- **类型安全调用**：管理后台通过 `@trpc/client` 消费 `@iam/admin-api/trpc` 暴露的 `AppRouter` 类型
- **声明式后端装配**：各后端应用的 `app.config.ts` 声明 API tier，路由和 tier 中间件通过 `@iam/api-core` 自动发现
- **Drizzle + PostgreSQL**：数据库层集中在 `packages/db`，使用 Drizzle ORM v1 relations 和 PostgreSQL
- **企业集成能力**：企业微信、短信服务、ORCAS 集成、导入导出、权限委托和 MySQL 到 PostgreSQL 迁移脚本

## 📦 仓库结构

```text
iam-service/
├── apps/
│   ├── api/                         # 公共 IAM API（@iam/api）
│   │   ├── src/
│   │   │   ├── routes/              # public / open / internal / sso / auth 分组路由
│   │   │   ├── services/            # 公共 API 使用的领域服务、repository、schema、type
│   │   │   ├── lib/                 # 外部集成、异步任务、客户端封装等应用侧工具
│   │   │   ├── middlewares/         # 应用侧中间件
│   │   │   ├── enums/               # 应用私有枚举
│   │   │   └── env.ts               # 环境变量 Zod 校验
│   │   ├── scripts/                 # 维护和历史迁移脚本
│   │   ├── static/                  # Scalar / Swagger 静态资源
│   │   ├── app.config.ts            # API tier、OpenAPI、Scalar 配置
│   │   ├── Dockerfile
│   │   └── .env.example
│   ├── admin-api/                   # 管理端 API（@iam/admin-api）
│   │   ├── src/
│   │   │   ├── routes/              # admin REST 与 rpc/tRPC 路由
│   │   │   ├── services/            # 管理端领域服务、repository、schema、type
│   │   │   ├── trpc/                # 管理端 AppRouter 组合
│   │   │   ├── lib/                 # 管理端应用侧工具和客户端封装
│   │   │   └── env.ts
│   │   ├── static/                  # Scalar / Swagger 静态资源
│   │   ├── app.config.ts
│   │   ├── Dockerfile
│   │   └── .env.example
│   ├── admin/                       # 管理后台前端（@iam/admin）
│   │   ├── src/pages/               # users / organizations / positions / employments / 403
│   │   ├── src/components/          # 可复用 UI 组件
│   │   ├── src/lib/api-client.ts    # tRPC client，类型来自 @iam/admin-api/trpc
│   │   ├── src/services/            # 页面侧服务封装
│   │   ├── src/models/              # Umi Max model
│   │   ├── .umirc.ts                # 路由、base、proxy 配置
│   │   └── .env.example
│   └── sso/                         # SSO 门户前端（@iam/sso）
│       ├── src/pages/               # login / reset-password / user-info / system-maintenance
│       ├── src/services/            # auth/open/public API 调用
│       ├── src/assets/              # 登录页和密码页图片素材
│       ├── src/lib/                 # 浏览器侧通用封装
│       ├── src/utils/
│       ├── .umirc.ts
│       └── .env.example
├── packages/
│   ├── api-core/                    # Hono/OpenAPI/tRPC/中间件/日志/Redis 等后端基础设施（@iam/api-core）
│   ├── contracts/                   # 跨端共享枚举与契约类型（@iam/contracts）
│   └── db/                          # Drizzle schema、relations、migrations、db client（@iam/db）
├── docker/                          # 本地依赖栈、开发和生产 compose 文件
├── docs/                            # 架构评审、设计稿、实施计划和安全整改文档
├── scripts/                         # 仓库级辅助脚本
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### 后端装配模型

后端公共装配逻辑在 `packages/api-core/src/core/`。每个 Bun 后端应用通过自己的 `app.config.ts` 声明 tier：

- `apps/api/app.config.ts`
  - `/public`：通用用户 API
  - `/open`：公开 API
  - `/internal`：内部 API
  - `/sso`：单点登录 API
  - `/auth`：认证 API
- `apps/admin-api/app.config.ts`
  - `/admin`：管理端 REST API
  - `/rpc`：管理端 tRPC API，路由目录映射到 `src/routes/trpc`

`createApp` 会扫描 `src/routes/**/*.index.ts` 并挂载到对应 tier；`src/routes/<tier>/_middleware.ts` 会作为 tier 级中间件加载。新增普通 REST 路由时通常只需要在对应应用的 `src/routes/<tier>/<domain>/` 下补齐路由文件；新增 tier 时才需要更新对应 `app.config.ts`。

### 共享包职责

- `@iam/db`：集中维护 PostgreSQL schema、relations、migrations、Drizzle client 和查询工具
- `@iam/api-core`：提供 `defineConfig`、`createApp`、路由工厂、OpenAPI helper、统一响应、错误、中间件、Redis、日志和 tRPC 基础设施
- `@iam/contracts`：提供前后端共享枚举，避免在多个应用里重复定义状态码和业务枚举

## 🛠️ 技术栈

### 后端（`apps/api`、`apps/admin-api`）

- **运行时**：Bun
- **Web 框架**：Hono + `@hono/zod-openapi`
- **RPC**：tRPC v11（管理端 tRPC 位于 `apps/admin-api`）
- **API 文档**：Scalar UI + OpenAPI 3.1
- **数据库**：PostgreSQL + Drizzle ORM v1 / Drizzle Kit（集中在 `packages/db`）
- **缓存**：Redis / ioredis
- **验证与错误**：Zod、自定义错误、统一响应封装
- **认证/加密**：bcrypt / bcrypt-ts、sm-crypto
- **基础设施**：Pino、hono-pino、axios、CSV/XLSX 导入导出工具
- **代码检查**：ESLint（Antfu 配置）

### 前端（`apps/admin`、`apps/sso`）

- **框架**：Umi Max + React 18
- **UI**：Ant Design + `@ant-design/pro-components`
- **管理后台 API**：`@trpc/client` + `@iam/admin-api/trpc` 类型推导
- **SSO 门户 API**：封装 `fetch`，统一处理 cookie、业务状态码和跳转
- **格式化**：Prettier + `prettier-plugin-organize-imports`

### 工程

- **包管理**：pnpm workspace（根 `packageManager` 为 `pnpm@11.1.2`）
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

`docker/docker-compose-dependency.yml` 中 PostgreSQL 暴露在 `localhost:5432`，Redis 暴露在 `localhost:6390`。如果在宿主机直接运行 Bun 服务，本地环境变量请使用 `REDIS_URL=localhost`、`REDIS_PORT=6390`。

### 配置环境变量

```bash
cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
cp apps/admin-api/.env.example apps/admin-api/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/sso/.env.example apps/sso/.env.local
```

本地 PostgreSQL 对应的连接串可设置为：

```dotenv
DATABASE_URL=postgresql://iam:iam_password@localhost:5432/iam_db
```

### 初始化数据库

快速同步本地库：

```bash
pnpm --filter @iam/db db:push
```

需要生成并执行迁移时：

```bash
pnpm --filter @iam/db db:generate
pnpm --filter @iam/db db:migrate
```

`@iam/api` 也保留了数据库脚本代理命令，`pnpm --filter @iam/api db:push` 会转发到 `@iam/db`。

### 启动应用

```bash
pnpm dev
```

常用访问地址：

- 公共 API：<http://localhost:30000>
- 管理端 API：<http://localhost:30001>
- 公共 API Scalar 文档：<http://localhost:30000>
- 管理端 API Scalar 文档：<http://localhost:30001>
- 管理后台：默认 <http://localhost:8001/iam-admin>
- SSO 门户：默认 <http://localhost:8000/portal>

### 单独启动子项目

```bash
pnpm --filter @iam/api dev
pnpm --filter @iam/admin-api dev
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

### 公共 API

```bash
pnpm --filter @iam/api dev
pnpm --filter @iam/api serve
pnpm --filter @iam/api lint
pnpm --filter @iam/api lint:fix
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api migrate:mysql-to-postgres
```

### 管理端 API

```bash
pnpm --filter @iam/admin-api dev
pnpm --filter @iam/admin-api serve
pnpm --filter @iam/admin-api lint
pnpm --filter @iam/admin-api lint:fix
pnpm --filter @iam/admin-api typecheck
```

### 数据库包

```bash
pnpm --filter @iam/db lint
pnpm --filter @iam/db typecheck
pnpm --filter @iam/db db:generate
pnpm --filter @iam/db db:migrate
pnpm --filter @iam/db db:push
```

### 共享包

```bash
pnpm --filter @iam/api-core lint
pnpm --filter @iam/api-core typecheck
pnpm --filter @iam/contracts lint
pnpm --filter @iam/contracts typecheck
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

### 添加公共 REST API

1. 在 `apps/api/src/services/<domain>/` 中补充 `*.schema.ts`、`*.repository.ts`、`*.service.ts` 和 `*.type.ts`
2. 在 `apps/api/src/routes/<tier>/<domain>/` 下新增或更新 `*.routes.ts`、`*.handlers.ts`、`*.index.ts`
3. `*.index.ts` 会被 `createApp` 自动发现；只有新增 tier 时才需要改 `apps/api/app.config.ts`
4. tier 级中间件放在 `apps/api/src/routes/<tier>/_middleware.ts`

### 添加管理端 REST / tRPC API

1. 在 `apps/admin-api/src/services/<domain>/` 中补充领域服务、repository、schema 和 type
2. REST 路由放在 `apps/admin-api/src/routes/admin/<domain>/`
3. 如需让 REST 和 tRPC 共用业务操作，可在路由目录内补充 `*.ops.ts`
4. tRPC procedure 放在对应 `*.trpc.ts`，并在 `apps/admin-api/src/trpc/routers/admin/index.ts` 组合到管理端 router
5. 管理后台通过 `apps/admin/src/lib/api-client.ts` 中的 `apiClient` 调用，类型来自 `@iam/admin-api/trpc`

### 修改共享契约

跨端共享枚举和稳定契约放在 `packages/contracts/src/`。新增导出后记得同步 `packages/contracts/src/index.ts`，并运行受影响应用的 typecheck。

### 修改数据库 Schema

1. 编辑 `packages/db/src/schema/core/*.ts`
2. 如有关联查询，更新 `packages/db/src/relations/core/*.ts`
3. 确保 schema / relations 被对应 `index.ts` 导出
4. 本地快速同步：`pnpm --filter @iam/db db:push`
5. 迁移式变更：`pnpm --filter @iam/db db:generate && pnpm --filter @iam/db db:migrate`

核心表覆盖 `user`、`organization`、`organization_closure`、`position`、`employment`、`role`、`privilege`、`client`、`login_log` 以及多类角色、组织、职位和委托关联表；登录会话主要存储在 Redis。

## ⚙️ 环境变量

### 数据库包（`packages/db/.env`）

以 `packages/db/.env.example` 和 `packages/db/drizzle.config.ts` 为准：

| 变量名         | 说明                                         | 默认值/示例        |
| -------------- | -------------------------------------------- | ------------------ |
| `DATABASE_URL` | PostgreSQL 连接字符串，可带 `?schema=public` | `postgresql://...` |

### 公共 API（`apps/api/.env`）

以 `apps/api/.env.example` 和 `apps/api/src/env.ts` 为准：

| 变量名                          | 说明                                             | 默认值/示例        |
| ------------------------------- | ------------------------------------------------ | ------------------ |
| `DATABASE_URL`                  | PostgreSQL 连接字符串，可带 `?schema=public`     | `postgresql://...` |
| `REDIS_URL`                     | Redis 地址                                       | `localhost`        |
| `REDIS_PORT`                    | Redis 端口；使用本地 compose 时宿主机端口为 6390 | `6379` / `6390`    |
| `REDIS_PASSWORD`                | Redis 密码；空字符串会转换为未设置               | 空                 |
| `REDIS_DB`                      | Redis DB 编号                                    | `0`                |
| `PORT`                          | 公共 API 监听端口                                | `30000`            |
| `NODE_ENV`                      | 运行环境；生产环境会关闭 OpenAPI 文档            | `development`      |
| `LOG_LEVEL`                     | Pino 日志级别                                    | `info`             |
| `IAM_SECRET_KEY`                | 签名/加密密钥                                    | 必填               |
| `PASSWORD_HASH_ROUNDS`          | 密码哈希轮数                                     | `10`               |
| `DEFAULT_USER_PASSWORD`         | 默认用户密码                                     | `default123`       |
| `MAGIC_CODE`                    | 特殊操作验证码                                   | 必填               |
| `WX_CORPID` / `WX_CORPSECRET`   | 企业微信配置                                     | 必填               |
| `SMS_URL` / `SMS_SIGNATURE_KEY` | 短信服务配置                                     | 必填               |
| `ORCAS_URL`                     | ORCAS 服务地址                                   | 必填               |
| `PURVEYOR_PARENT_ORG`           | 供应商父组织 ID                                  | 必填               |
| `REDIS_EXPIRE_TIME`             | Redis 默认过期时间（秒）                         | `86400`            |
| `AUTH_CODE_EXPIRE_TIME`         | 授权码过期时间（秒）                             | `300`              |
| `LOGIN_ENDPOINT`                | 登录端点                                         | `/portal/login`    |
| `AUTHORIZATION_ENDPOINT`        | 授权端点                                         | `/sso/authorize`   |
| `LOGOUT_ENDPOINT`               | 登出端点                                         | `/sso/logout`      |
| `THIRDPARTY_OA_ENDPOINT`        | 第三方 OA 端点                                   | `/sso/thirdparty/oa` |

### 管理端 API（`apps/admin-api/.env`）

以 `apps/admin-api/.env.example` 和 `apps/admin-api/src/env.ts` 为准：

| 变量名                 | 说明                                             | 默认值/示例        |
| ---------------------- | ------------------------------------------------ | ------------------ |
| `DATABASE_URL`         | PostgreSQL 连接字符串                            | `postgresql://...` |
| `REDIS_URL`            | Redis 地址                                       | `localhost`        |
| `REDIS_PORT`           | Redis 端口；使用本地 compose 时宿主机端口为 6390 | `6379` / `6390`    |
| `REDIS_PASSWORD`       | Redis 密码；空字符串会转换为未设置               | 空                 |
| `REDIS_DB`             | Redis DB 编号                                    | `0`                |
| `PORT`                 | 管理端 API 监听端口                              | `30001`            |
| `NODE_ENV`             | 运行环境                                         | `development`      |
| `LOG_LEVEL`            | Pino 日志级别                                    | `info`             |
| `PASSWORD_HASH_ROUNDS` | 密码哈希轮数                                     | `10`               |
| `ADMIN_CLIENT_CODES`   | 允许访问管理端 API 的 client code，逗号分隔      | `iam-admin`        |
| `ADMIN_ROLE_CODES`     | 允许访问管理端 API 的角色码，逗号分隔            | `iam:admin`        |

### 管理后台（`apps/admin/.env.local`）

| 变量名                      | 说明                       | 默认值           |
| --------------------------- | -------------------------- | ---------------- |
| `PORT`                      | Umi dev server 端口        | `8001`           |
| `UMI_APP_SSO_AUTHORIZE_URL` | SSO 授权端点               | `/sso/authorize` |
| `UMI_APP_SSO_LOGOUT_URL`    | SSO 登出端点               | `/sso/logout`    |
| `UMI_APP_SSO_CLIENT_CODE`   | 当前应用注册的 client code | `iam-admin`      |
| `UMI_APP_ADMIN_ROLE_CODE`   | 允许访问后台的角色码       | `iam:admin`      |

### SSO 门户（`apps/sso/.env.local`）

| 变量名                    | 说明                               | 默认值                                          |
| ------------------------- | ---------------------------------- | ----------------------------------------------- |
| `PORT`                    | Umi dev server 端口                | `8000`                                          |
| `UMI_APP_API_PREFIX`      | API 前缀；为空时使用同域相对路径   | 空                                              |
| `UMI_APP_SSO_CLIENT_CODE` | SSO 客户端代码                     | `iam`                                           |
| `UMI_APP_WELL_KNOWN_URL`  | authentication configuration 端点  | `/sso/.well-known/authentication-configuration` |

## 📚 API 文档

开发环境启动后分别访问两个后端服务的根路径打开 Scalar 文档首页：

- 公共 API 文档首页：<http://localhost:30000>
- 管理端 API 文档首页：<http://localhost:30001>

各 tier 的 OpenAPI JSON 位于对应路径的 `/doc`，例如：

- <http://localhost:30000/public/doc>
- <http://localhost:30000/open/doc>
- <http://localhost:30000/internal/doc>
- <http://localhost:30000/sso/doc>
- <http://localhost:30000/auth/doc>
- <http://localhost:30001/admin/doc>
- <http://localhost:30001/rpc/doc>

`NODE_ENV=production` 时 OpenAPI/Scalar 默认关闭。

## 🗄️ 数据库

当前主库为 PostgreSQL，Drizzle schema 位于 `packages/db/src/schema/`，relations 位于 `packages/db/src/relations/`，migrations 位于 `packages/db/src/migrations/`。

常用命令：

```bash
pnpm --filter @iam/db db:push
pnpm --filter @iam/db db:generate
pnpm --filter @iam/db db:migrate
```

历史 MySQL 数据迁移脚本仍在公共 API 应用内：

```bash
pnpm --filter @iam/api migrate:mysql-to-postgres
```

## 🚢 部署

### 后端

```bash
pnpm install --frozen-lockfile
pnpm --filter @iam/db db:migrate
pnpm --filter @iam/api serve
pnpm --filter @iam/admin-api serve
```

### 前端

```bash
pnpm --filter @iam/admin build
pnpm --filter @iam/sso build
```

构建产物分别位于：

- `apps/admin/dist`，默认 base 为 `/iam-admin`
- `apps/sso/dist`，默认 base 为 `/portal`

静态服务器需要把后端路径按服务拆分反向代理：

- `/public`、`/open`、`/internal`、`/sso`、`/auth` 代理到公共 API 服务
- `/admin`、`/rpc` 代理到管理端 API 服务

### Docker

仓库提供两个后端镜像构建文件，构建上下文为仓库根目录：

```bash
docker build -f apps/api/Dockerfile -t iam-api .
docker build -f apps/admin-api/Dockerfile -t iam-admin-api .

docker run --rm -p 30000:30000 --env-file apps/api/.env iam-api
docker run --rm -p 30001:30001 --env-file apps/admin-api/.env iam-admin-api
```

本地依赖栈：

```bash
docker compose -f docker/docker-compose-dependency.yml up -d
```

开发编排：

```bash
docker compose -f docker/docker-compose-dev.yml up -d
```

`docker/docker-compose-dev.yml` 会同时编排 PostgreSQL、Redis、公共 API 和管理端 API；`docker/docker-compose-prod.yml` 提供 PostgreSQL 主从、Redis、公共 API 和管理端 API 的生产部署模板，使用前请补齐生产环境变量。

## 🔧 调试与排障

- 日志：`LOG_LEVEL` 控制 Pino 输出级别
- API 调试：开发环境分别访问 <http://localhost:30000> 和 <http://localhost:30001>
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

**最后更新**：2026-05-13
