# IAM (Identity and Access Management) Monorepo

基于 pnpm workspace + Turborepo 的身份与访问管理平台。仓库包含公共 IAM API、管理端 API、OIDC Provider、
后台 worker、管理后台前端和 SSO 门户前端，并把数据库层、API 基础设施、领域 DTO、队列和跨端契约拆分为
独立 workspace package。

## ✨ 特性

- **Monorepo 一体化开发**：pnpm workspace 管理依赖，Turborepo 编排开发、构建和检查任务
- **服务分层**：`apps/api` 承载 public/open/internal/sso/auth 等公共能力，`apps/admin-api` 承载 admin REST 与管理端 tRPC，`apps/oidc-provider` 承载标准 OIDC 协议面，`apps/worker` 承载后台队列消费和运维面板
- **共享包拆分**：`packages/db` 提供 Drizzle schema/relations/client/migrations，`packages/api-core` 提供 Hono/OpenAPI/tRPC/Redis/Session Kernel/日志/中间件等基础设施，`packages/contracts` 提供跨端共享枚举和稳定契约，`packages/domain` 提供共享 DTO、审计 helper 和业务错误，`packages/jobs` 与 `packages/user-profile-read-model` 提供 BullMQ 队列与用户档案读模型能力
- **类型安全调用**：管理后台通过 `@trpc/client` 消费 `@iam/admin-api/trpc` 暴露的 `AppRouter` 类型
- **声明式后端装配**：API 后端的 `app.config.ts` 声明 API tier，app-local composition root materialize 路由和 tier 中间件，再交给 `@iam/api-core` 挂载
- **Drizzle + PostgreSQL**：数据库层集中在 `packages/db`，使用 Drizzle ORM v1 relations 和 PostgreSQL
- **企业集成能力**：企业微信、短信服务、ORCAS 集成、OIDC Provider、权限委托、用户档案读模型、导入导出和 MySQL 到 PostgreSQL 迁移脚本

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
│   ├── oidc-provider/               # Node.js OIDC Provider（@iam/oidc-provider）
│   │   ├── src/
│   │   │   ├── composition/         # Provider/http/repository/session/store/worker 装配
│   │   │   ├── provider/            # oidc-provider 配置与事件处理
│   │   │   ├── session/             # Session Kernel 适配
│   │   │   ├── storage/             # OIDC adapter 存储
│   │   │   ├── stores/              # Redis/DB-backed store
│   │   │   ├── app.ts
│   │   │   └── env.ts
│   │   ├── Dockerfile
│   │   └── .env.example
│   ├── worker/                      # 后台任务 runtime（@iam/worker）
│   │   ├── src/
│   │   │   ├── commands/            # user-profile backfill/repair 命令
│   │   │   ├── composition/         # runtime、模块、HTTP/Bull Board 装配
│   │   │   ├── http/                # health 与 Bull Board
│   │   │   ├── modules/             # worker module registry
│   │   │   ├── env.ts
│   │   │   └── index.ts
│   │   ├── Dockerfile
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
│   ├── api-core/                    # Hono/OpenAPI/tRPC/中间件/日志/Redis/Session Kernel 等后端基础设施（@iam/api-core）
│   ├── contracts/                   # 跨端共享枚举与稳定契约类型（@iam/contracts）
│   ├── db/                          # Drizzle schema、relations、migrations、db client（@iam/db）
│   ├── domain/                      # 共享 DTO schema/type、审计 helper、业务错误（@iam/domain）
│   ├── jobs/                        # BullMQ queue/worker 基础设施（@iam/jobs）
│   └── user-profile-read-model/     # 用户档案读模型 producer/query/worker（@iam/user-profile-read-model）
├── docker/                          # 本地依赖栈、开发和生产 compose 文件
├── docs/                            # 架构评审、设计稿、实施计划和安全整改文档
├── scripts/                         # 仓库级辅助脚本
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### 后端装配模型

API 后端公共装配逻辑在 `packages/api-core/src/core/`。`apps/api` 和 `apps/admin-api` 通过自己的
`app.config.ts` 声明 tier：

- `apps/api/app.config.ts`
  - `/public`：通用用户 API
  - `/open`：公开 API
  - `/internal`：内部 API
  - `/sso`：单点登录 API
  - `/auth`：认证 API
- `apps/admin-api/app.config.ts`
  - `/admin`：管理端 REST API
  - `/rpc`：管理端 tRPC API，路由目录映射到 `src/routes/trpc`

`apps/api/src/app.ts` 和 `apps/admin-api/src/app.ts` 会调用各自的 `src/composition/` 根模块，先 materialize
生产 runtime、repository、service、route 和 middleware，再把 route/middleware records 传给 `createApp`。
`createApp` 只负责按 app config 的 tier/basePath 挂载这些记录并配置 OpenAPI/Scalar、请求日志和错误处理，不再在
app 入口里创建 app-specific DI 实例。

`apps/oidc-provider` 不走 Hono tier 模型；它是 Node.js 24 + `oidc-provider` 应用，通过 `src/composition/`
装配 provider、HTTP server、session、repositories 和 stores。`apps/worker` 是 Bun 后台任务 runtime，通过
`IAM_WORKER_ENABLED_MODULES` 选择模块，当前模块为 `user-profile`，并可开启 health endpoint 和 Bull Board。

### 共享包职责

- `@iam/db`：集中维护 PostgreSQL schema、relations、migrations、Drizzle client 和查询工具
- `@iam/api-core`：提供 `defineConfig`、`createApp`、路由工厂、OpenAPI helper、统一响应、错误、中间件、Redis、日志、Session Kernel 和 tRPC 基础设施
- `@iam/contracts`：提供前后端共享枚举与稳定契约，避免在多个应用里重复定义状态码和业务枚举
- `@iam/domain`：提供共享 DTO schema/type、审计 helper、脱敏规则和可复用业务错误
- `@iam/jobs`：提供 BullMQ 连接、队列、worker 和默认 job options
- `@iam/user-profile-read-model`：提供用户档案读模型 producer、query service、dirty marker 和 worker module

## 🛠️ 技术栈

### 后端（`apps/api`、`apps/admin-api`、`apps/oidc-provider`、`apps/worker`）

- **运行时**：`apps/api`、`apps/admin-api` 和 `apps/worker` 使用 Bun；`apps/oidc-provider` 使用 Node.js 24
- **Web 框架**：Hono + `@hono/zod-openapi`（API 后端与 worker HTTP）
- **RPC**：tRPC v11（管理端 tRPC 位于 `apps/admin-api`）
- **OIDC**：Node.js 24 + `oidc-provider` 9
- **后台任务**：Bun + BullMQ worker，Bull Board 作为可选运维面板
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

- **包管理**：pnpm workspace（根 `packageManager` 为 `pnpm@11.5.0`）
- **任务编排**：Turborepo
- **语言**：TypeScript 6 / native preview 工具链

## 🚀 快速开始

### 环境要求

- Bun 1.x
- Node.js 24.x（OIDC Provider、前端构建镜像和部分工具链使用）
- pnpm 11.x（根 `packageManager` 当前为 `pnpm@11.5.0`）
- PostgreSQL（本地 compose 使用 `postgres:18`）
- Redis

### 安装依赖

```bash
pnpm install
```

### 启动本地依赖

推荐先启动 PostgreSQL 与 Redis：

```bash
docker compose -f docker/docker-compose-dev.yml up -d db redis
```

`docker/docker-compose-dev.yml` 中 PostgreSQL 默认暴露在 `localhost:5432`，Redis 默认暴露在
`localhost:6390`。如果在宿主机直接运行 Bun 服务，本地环境变量请按应用使用
`IAM_API_REDIS_HOST=localhost` / `IAM_API_REDIS_PORT=6390`、
`IAM_ADMIN_API_REDIS_HOST=localhost` / `IAM_ADMIN_API_REDIS_PORT=6390`、
`IAM_OIDC_PROVIDER_REDIS_HOST=localhost` / `IAM_OIDC_PROVIDER_REDIS_PORT=6390` 或
`IAM_WORKER_REDIS_HOST=localhost` / `IAM_WORKER_REDIS_PORT=6390`。

### 配置环境变量

```bash
cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
cp apps/admin-api/.env.example apps/admin-api/.env
cp apps/oidc-provider/.env.example apps/oidc-provider/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/sso/.env.example apps/sso/.env.local
cp docker/.env.dev.example docker/.env
cp gateway/.env.example gateway/.env
```

本地 PostgreSQL 对应的连接串可设置为：

```dotenv
IAM_API_DATABASE_URL=postgresql://iam:iam_password@localhost:5432/iam_db
```

`packages/db` 的 Drizzle CLI 仍使用包内 `DATABASE_URL`；运行 app 时使用各 app 自己的
`IAM_<APP>_DATABASE_URL`。

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
- OIDC Provider 直连：默认 <http://localhost:30002>，Docker dev 宿主机端口为 <http://localhost:30015>
- Worker dashboard：Docker dev 宿主机端口默认 <http://localhost:30016/admin/queues>（需启用 Bull Board）
- 公共 API Scalar 文档：<http://localhost:30000>
- 管理端 API Scalar 文档：<http://localhost:30001>
- 管理后台：默认 <http://localhost:8001/iam-admin>
- SSO 门户：默认 <http://localhost:8000/portal>

### 单独启动子项目

```bash
pnpm --filter @iam/api dev
pnpm --filter @iam/admin-api dev
pnpm --filter @iam/oidc-provider dev
pnpm --filter @iam/worker dev
pnpm --filter @iam/admin dev
pnpm --filter @iam/sso dev
```

## 🧭 开发命令

### 根目录

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm e2e
pnpm typecheck
```

首次在 Linux/WSL 环境运行 Playwright E2E 前，先安装浏览器与 Chromium 系统依赖：

```bash
pnpm e2e:install
```

如果当前环境不能使用 `sudo`，可以先运行 `pnpm e2e:install:browsers` 安装浏览器，再让有 sudo 权限的
WSL 用户执行 `pnpm e2e:install` 补齐系统依赖。

### 公共 API

```bash
pnpm --filter @iam/api dev
pnpm --filter @iam/api serve
pnpm --filter @iam/api lint
pnpm --filter @iam/api lint:fix
pnpm --filter @iam/api test
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api migrate:mysql-to-postgres
```

### 管理端 API

```bash
pnpm --filter @iam/admin-api dev
pnpm --filter @iam/admin-api serve
pnpm --filter @iam/admin-api lint
pnpm --filter @iam/admin-api lint:fix
pnpm --filter @iam/admin-api test
pnpm --filter @iam/admin-api typecheck
```

### OIDC Provider

```bash
pnpm --filter @iam/oidc-provider dev
pnpm --filter @iam/oidc-provider serve
pnpm --filter @iam/oidc-provider lint
pnpm --filter @iam/oidc-provider lint:fix
pnpm --filter @iam/oidc-provider test
pnpm --filter @iam/oidc-provider typecheck
```

### Worker

```bash
pnpm --filter @iam/worker dev
pnpm --filter @iam/worker serve
pnpm --filter @iam/worker lint
pnpm --filter @iam/worker lint:fix
pnpm --filter @iam/worker test
pnpm --filter @iam/worker typecheck
pnpm --filter @iam/worker user-profile:backfill
pnpm --filter @iam/worker user-profile:repair
```

### 数据库包

```bash
pnpm --filter @iam/db lint
pnpm --filter @iam/db test
pnpm --filter @iam/db typecheck
pnpm --filter @iam/db db:generate
pnpm --filter @iam/db db:migrate
pnpm --filter @iam/db db:push
```

### 共享包

```bash
pnpm --filter @iam/api-core lint
pnpm --filter @iam/api-core test
pnpm --filter @iam/api-core typecheck
pnpm --filter @iam/contracts lint
pnpm --filter @iam/contracts test
pnpm --filter @iam/contracts typecheck
pnpm --filter @iam/domain lint
pnpm --filter @iam/domain test
pnpm --filter @iam/domain typecheck
pnpm --filter @iam/jobs lint
pnpm --filter @iam/jobs test
pnpm --filter @iam/jobs typecheck
pnpm --filter @iam/user-profile-read-model lint
pnpm --filter @iam/user-profile-read-model test
pnpm --filter @iam/user-profile-read-model typecheck
```

### 前端

```bash
pnpm --filter @iam/admin dev
pnpm --filter @iam/admin build
pnpm --filter @iam/admin format
pnpm --filter @iam/admin test
pnpm --filter @iam/admin test:watch
pnpm --filter @iam/admin test:coverage
pnpm --filter @iam/admin e2e
pnpm --filter @iam/admin typecheck

pnpm --filter @iam/sso dev
pnpm --filter @iam/sso build
pnpm --filter @iam/sso format
pnpm --filter @iam/sso test
pnpm --filter @iam/sso test:watch
pnpm --filter @iam/sso test:coverage
pnpm --filter @iam/sso e2e
pnpm --filter @iam/sso typecheck
```

`pnpm test` 通过 Turborepo 调度后端、shared、gateway 与两个前端的包级 `test` 任务。前端 `test` 使用
Vitest + React Testing Library + MSW，`test:coverage` 生成覆盖率报告但第一期不设置全局覆盖率硬阈值。
`pnpm e2e` 是独立的 Playwright mocked smoke 流程，只调度 `@iam/admin#e2e` 与 `@iam/sso#e2e`，不会混入
常规 `pnpm test`。Linux/WSL 下包级 `e2e` 会先检查 Playwright Chromium 的系统依赖，缺失时会提示运行
`pnpm e2e:install`。

后续 OpenSpec 前端变更的验收规则：

- 修改纯逻辑、请求封装、service wrapper 或 API 契约消费时，应新增或更新对应 Vitest 测试；如不自动化覆盖，需要在任务或设计中说明原因。
- 修改登录、重置密码、管理端核心 CRUD、客户端配置等关键页面流程时，应新增或更新 mocked E2E smoke；如不自动化覆盖，需要明确豁免原因。
- 仅调整样式、布局或文案且不改变业务逻辑时，可用 lint、build、截图 smoke 或人工 smoke 作为合理验证，不强制补低价值单测。

## 🧩 开发指南

### 添加公共 REST API

1. 在 `apps/api/src/services/<domain>/` 中补充 `*.schema.ts`、`*.repository.ts`、`*.service.ts` 和 `*.type.ts`
2. 在 `apps/api/src/routes/<tier>/<domain>/` 下新增或更新 `*.routes.ts`、`*.handlers.ts`、`*.index.ts`
3. `*.index.ts` 暴露 route factory，handler factory 在 `apps/api/src/composition/routes/index.ts` 中接线
4. 只有新增 tier 时才需要改 `apps/api/app.config.ts`
5. tier 级中间件放在 `apps/api/src/routes/<tier>/_middleware.ts`，生产 middleware 在 composition 中 materialize

### 添加管理端 REST / tRPC API

1. 在 `apps/admin-api/src/services/<domain>/` 中补充领域服务、repository、schema 和 type
2. REST 路由放在 `apps/admin-api/src/routes/admin/<domain>/`
3. 如需让 REST 和 tRPC 共用业务操作，可在路由目录内补充 `*.adapter.ts`
4. tRPC procedure 放在对应 `*.trpc.ts`，并在 `apps/admin-api/src/trpc/routers/admin/index.ts` 组合到管理端 router
5. 管理后台通过 `apps/admin/src/lib/api-client.ts` 中的 `apiClient` 调用，类型来自 `@iam/admin-api/trpc`

### 添加后台任务模块

1. 队列契约优先放在 `packages/contracts/src/jobs/`，BullMQ 基础设施放在 `packages/jobs`
2. 业务读模型或 worker 逻辑可放在拥有该能力的共享包，例如 `packages/user-profile-read-model`
3. 在 `apps/worker/src/modules/registry.ts` 兼容 `WorkerModule` 接口，并在 `apps/worker/src/composition/index.ts` 装配
4. 新模块应支持 `IAM_WORKER_ENABLED_MODULES=<module-key>`、`all` 和 `none`

### 修改共享契约

跨端共享枚举和稳定契约放在 `packages/contracts/src/`。新增导出后记得同步 `packages/contracts/src/index.ts`，并运行受影响应用的 typecheck。

### 修改数据库 Schema

1. 编辑 `packages/db/src/schema/core/*.ts`
2. 如有关联查询，更新 `packages/db/src/relations/core/*.ts`
3. 确保 schema / relations 被对应 `index.ts` 导出
4. 本地快速同步：`pnpm --filter @iam/db db:push`
5. 迁移式变更：`pnpm --filter @iam/db db:generate && pnpm --filter @iam/db db:migrate`

核心表覆盖 `user`、`organization`、`organization_closure`、`position`、`employment`、`role`、`privilege`、
`client`、`user_profile`、`user_profile_dirty`、`audit_log` 以及多类角色、组织、职位和委托关联表；登录会话主要存储在 Redis。

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
| `IAM_API_DATABASE_URL`          | PostgreSQL 连接字符串，可带 `?schema=public`     | `postgresql://...` |
| `IAM_API_REDIS_HOST`            | Redis 地址                                       | `localhost`        |
| `IAM_API_REDIS_PORT`            | Redis 端口；使用本地 compose 时宿主机端口为 6390 | `6379` / `6390`    |
| `IAM_API_REDIS_PASSWORD`        | Redis 密码；空字符串会转换为未设置               | 空                 |
| `IAM_API_REDIS_DB`              | Redis DB 编号                                    | `0`                |
| `IAM_API_PORT`                  | 公共 API 监听端口                                | `30000`            |
| `NODE_ENV`                      | 运行环境；生产环境会关闭 OpenAPI 文档            | `development`      |
| `IAM_API_LOG_LEVEL`             | Pino 日志级别                                    | `info`             |
| `IAM_API_LOG_FORMAT`            | Pino 日志格式                                    | `auto`             |
| `IAM_API_PASSWORD_HASH_ROUNDS`  | 密码哈希轮数                                     | `10`               |
| `IAM_API_MAGIC_CODE`            | 特殊操作验证码                                   | 必填               |
| `IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID` | 当前密码登录 SM2 密钥编号                 | `2026-05-primary`  |
| `IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON` | 密码登录 SM2 私钥映射 JSON         | `{"kid":"private"}` |
| `IAM_API_LOGIN_CREDENTIAL_MAX_SKEW_MS` | 密码登录凭证时间戳允许偏差（毫秒）       | `300000`           |
| `IAM_API_LOGIN_CREDENTIAL_NONCE_TTL_SECONDS` | 密码登录 nonce 防重放 TTL（秒）   | `360`              |
| `IAM_API_SESSION_KERNEL_NAMESPACE` | Session Kernel Redis key namespace           | `sess:v2:`         |
| `IAM_API_SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS` | PrincipalSession idle TTL（秒） | `86400` |
| `IAM_API_SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS` | PrincipalSession absolute TTL（秒） | `86400` |
| `IAM_API_SESSION_KERNEL_TOMBSTONE_TTL_SECONDS` | Session Kernel tombstone 保留时间（秒） | `86400` |
| `IAM_API_SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS` | Session Kernel tombstone grace 时间（秒） | `300` |
| `IAM_API_SESSION_LOOKUP_HMAC_CURRENT_ID` | 当前 Session lookup HMAC key id        | `2026-06-primary`  |
| `IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET` | 当前 Session lookup HMAC secret；生产必填且至少 32 字符 | 必填 |
| `IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_ID` / `IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET` | 上一个 lookup HMAC key，用于轮换窗口 | 可选 |
| `IAM_API_WECHAT_CORP_ID` / `IAM_API_WECHAT_CORP_SECRET` | 企业微信配置             | 必填               |
| `IAM_API_SMS_URL` / `IAM_API_SMS_SIGNATURE_KEY` | 短信服务配置                    | 必填               |
| `IAM_API_ORCAS_URL`             | ORCAS 服务地址                                   | 必填               |
| `IAM_API_SESSION_DEFAULT_TTL_SECONDS` | Redis 默认过期时间（秒）                  | `86400`            |
| `IAM_API_AUTH_CODE_TTL_SECONDS` | 授权码过期时间（秒）                             | `300`              |
| `IAM_API_LOGIN_ENDPOINT`        | 登录端点                                         | `/portal/login`    |
| `IAM_API_SSO_INTERNAL_ORIGIN`   | 内网 SSO 入口 origin，用于 discovery URL 拼接     | 必填               |
| `IAM_API_SSO_EXTERNAL_ORIGIN`   | 外网 SSO 入口 origin，用于 discovery URL 拼接     | 必填               |
| `IAM_API_AUTHORIZATION_ENDPOINT` | 授权端点                                        | `/sso/authorize`   |
| `IAM_API_LOGOUT_ENDPOINT`       | 登出端点                                         | `/sso/logout`      |
| `IAM_API_THIRDPARTY_OA_ENDPOINT` | 第三方 OA 端点                                  | `/sso/thirdparty/oa` |
| `IAM_API_CAP_ENABLED` / `IAM_API_CAP_SITE_KEY` / `IAM_API_CAP_SECRET` | Cap 人机校验开关、站点 key 与 secret | `false` / `iam-sso` / 必填 |
| `IAM_API_CAP_CHALLENGE_TTL_MS` / `IAM_API_CAP_TOKEN_TTL_SECONDS` | Cap challenge 与 token 有效期 | `600000` / `600` |
| `IAM_API_HUMAN_VERIFICATION_WINDOW_SECONDS` / `IAM_API_HUMAN_VERIFICATION_LOGIN_FAILURE_THRESHOLD` / `IAM_API_HUMAN_VERIFICATION_LOOKUP_THRESHOLD` | 人机校验风险窗口和触发阈值 | `600` / `3` / `20` |
| `IAM_API_USER_PROFILE_DSL_MAX_LIMIT` | 用户档案 DSL 查询最大 limit | `100` |

### 管理端 API（`apps/admin-api/.env`）

以 `apps/admin-api/.env.example` 和 `apps/admin-api/src/env.ts` 为准：

| 变量名                 | 说明                                             | 默认值/示例        |
| ---------------------- | ------------------------------------------------ | ------------------ |
| `IAM_ADMIN_API_DATABASE_URL` | PostgreSQL 连接字符串                       | `postgresql://...` |
| `IAM_ADMIN_API_REDIS_HOST`   | Redis 地址                                  | `localhost`        |
| `IAM_ADMIN_API_REDIS_PORT`   | Redis 端口；使用本地 compose 时宿主机端口为 6390 | `6379` / `6390` |
| `IAM_ADMIN_API_REDIS_PASSWORD` | Redis 密码；空字符串会转换为未设置         | 空                 |
| `IAM_ADMIN_API_REDIS_DB`     | Redis DB 编号                               | `0`                |
| `IAM_ADMIN_API_PORT`         | 管理端 API 监听端口                         | `30001`            |
| `NODE_ENV`             | 运行环境                                         | `development`      |
| `IAM_ADMIN_API_LOG_LEVEL`    | Pino 日志级别                               | `info`             |
| `IAM_ADMIN_API_LOG_FORMAT`   | Pino 日志格式                               | `auto`             |
| `IAM_ADMIN_API_PASSWORD_HASH_ROUNDS` | 密码哈希轮数                        | `10`               |
| `IAM_ADMIN_API_ADMIN_CLIENT_CODES` | 允许访问管理端 API 的 client code，逗号分隔 | `iam-admin` |
| `IAM_ADMIN_API_ADMIN_ROLE_CODES` | 允许访问管理端 API 的角色码，逗号分隔   | `iam:admin`        |
| `IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE` | Session Kernel Redis key namespace；需与公共 API 一致 | `sess:v2:` |
| `IAM_ADMIN_API_SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS` | PrincipalSession idle TTL（秒） | `86400` |
| `IAM_ADMIN_API_SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS` | PrincipalSession absolute TTL（秒） | `86400` |
| `IAM_ADMIN_API_SESSION_KERNEL_TOMBSTONE_TTL_SECONDS` | Session Kernel tombstone 保留时间（秒） | `86400` |
| `IAM_ADMIN_API_SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS` | Session Kernel tombstone grace 时间（秒） | `300` |
| `IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_ID` / `IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET` | 当前 Session lookup HMAC key；需与公共 API 一致 | 必填 |
| `IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_ID` / `IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET` | 上一个 lookup HMAC key，用于轮换窗口 | 可选 |

### OIDC Provider（`apps/oidc-provider/.env`）

以 `apps/oidc-provider/.env.example` 和 `apps/oidc-provider/src/env.ts` 为准。关键变量包括：

| 变量名 | 说明 | 默认值/示例 |
| --- | --- | --- |
| `IAM_OIDC_PROVIDER_DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://...` |
| `IAM_OIDC_PROVIDER_REDIS_HOST` / `IAM_OIDC_PROVIDER_REDIS_PORT` / `IAM_OIDC_PROVIDER_REDIS_DB` | Redis 连接配置 | `localhost` / `6379` / `0` |
| `IAM_OIDC_PROVIDER_PORT` | 容器内监听端口；Docker dev 映射到宿主机 `30015` | `30002` |
| `IAM_OIDC_PROVIDER_ISSUER` | 对外 issuer，必须以 `/oidc` 结尾 | `http://localhost:30080/oidc` |
| `IAM_OIDC_PROVIDER_PUBLIC_ORIGIN` | 对外 origin，必须与 issuer origin 一致且不带 path | `http://localhost:30080` |
| `IAM_OIDC_PROVIDER_COOKIE_KEYS` | 至少两个逗号分隔的 cookie key，每个至少 32 字符 | 必填 |
| `IAM_OIDC_PROVIDER_CURRENT_JWK_JSON` / `IAM_OIDC_PROVIDER_PREVIOUS_JWK_JSON` | current/previous RS256 private JWK | 必填 / 可选 |
| `IAM_OIDC_PROVIDER_*_TTL_SECONDS` | global session、authorization code、interaction、access token、ID token、client cache TTL | 见 `.env.example` |
| `IAM_OIDC_PROVIDER_CLIENT_AUTH_FAILURE_LIMIT` / `IAM_OIDC_PROVIDER_CLIENT_AUTH_FAILURE_WINDOW_SECONDS` | client 认证失败限流配置 | `5` / `60` |
| `IAM_OIDC_PROVIDER_SESSION_KERNEL_*` / `IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_*` | Session Kernel 配置；需与 API/admin-api 协调 | 见 `.env.example` |

### Worker（`apps/worker/.env`）

以 `apps/worker/.env.example` 和 `apps/worker/src/env.ts` 为准。关键变量包括：

| 变量名 | 说明 | 默认值/示例 |
| --- | --- | --- |
| `IAM_WORKER_DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://...` |
| `IAM_WORKER_REDIS_HOST` / `IAM_WORKER_REDIS_PORT` / `IAM_WORKER_REDIS_DB` | Redis 连接配置 | `localhost` / `6379` / `0` |
| `IAM_WORKER_ENABLED_MODULES` | 启用模块：`all`、`none` 或逗号分隔模块 key；当前模块为 `user-profile` | `all` |
| `IAM_WORKER_HTTP_ENABLED` / `IAM_WORKER_HTTP_PORT` / `IAM_WORKER_HEALTH_PATH` | health/Bull Board HTTP server 配置 | `true` / `30003` / `/healthz` |
| `IAM_WORKER_BULL_BOARD_ENABLED` / `IAM_WORKER_BULL_BOARD_PATH` | 是否启用 Bull Board 与挂载路径 | `false` / `/admin/queues` |
| `IAM_WORKER_BULL_BOARD_AUTH_ENABLED` / `IAM_WORKER_BULL_BOARD_USERNAME` / `IAM_WORKER_BULL_BOARD_PASSWORD` | Bull Board Basic Auth 配置；生产启用 dashboard 时必须配置 | `true` / `iam-worker` / `iam-worker-dev` |
| `IAM_WORKER_USER_PROFILE_CONCURRENCY` | user-profile worker 并发数 | `2` |
| `IAM_WORKER_USER_PROFILE_REBUILD_BATCH_SIZE` / `IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE` | rebuild/backfill 批大小 | `100` / `500` |
| `IAM_WORKER_USER_PROFILE_REPAIR_STALE_SECONDS` | repair 命令默认修复 stale pending/processing 的秒数 | `300` |

### 管理后台（`apps/admin/.env.local`）

| 变量名                      | 说明                       | 默认值           |
| --------------------------- | -------------------------- | ---------------- |
| `PORT`                      | Umi dev server 端口        | `8001`           |
| `UMI_APP_ADMIN_API_PREFIX`  | 管理端 API 前缀            | `/api/iam`       |
| `UMI_APP_ADMIN_SSO_AUTHORIZE_URL` | SSO 授权端点         | `/sso/authorize` |
| `UMI_APP_ADMIN_SSO_LOGOUT_URL` | SSO 登出端点            | `/sso/logout`    |
| `UMI_APP_ADMIN_CLIENT_CODE` | 当前应用注册的 client code | `iam-admin`      |
| `UMI_APP_ADMIN_ROLE_CODE`   | 允许访问后台的角色码       | `iam:admin`      |
| `UMI_APP_ADMIN_GRAFANA_URL` | Grafana 系统日志入口       | `http://localhost:30030` |
| `UMI_APP_ADMIN_SYSTEM_LOG_ENV` | Grafana dashboard 环境变量 | `dev`         |

### SSO 门户（`apps/sso/.env.local`）

| 变量名                    | 说明                                                    | 默认值                                          |
| ------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| `PORT`                    | Umi dev server 端口                                     | `8000`                                          |
| `UMI_APP_SSO_API_PREFIX`  | API 前缀；为空时使用同域相对路径                        | `/api/iam`                                     |
| `UMI_APP_SSO_CLIENT_CODE` | SSO 客户端代码                                          | `iam`                                           |
| `UMI_APP_SSO_WELL_KNOWN_URL` | authentication configuration 端点                    | `/sso/.well-known/authentication-configuration` |
| `UMI_APP_SSO_CAP_SITE_KEY` | Cap 站点 key                                           | `iam-sso`                                       |
| `UMI_APP_SSO_CAP_ENDPOINT` | 内嵌 Cap challenge/redeem 端点                         | `/api/iam/open/cap/iam-sso/`                    |
| `UMI_APP_SSO_CAP_WASM_URL` | 本地 Cap WASM 资源；避免浏览器请求 jsDelivr CDN        | `/portal/cap/cap_wasm_bg.wasm`                  |
| `UMI_APP_SSO_CAP_PAKO_URL` | 本地 pako fallback 资源；避免旧浏览器请求 jsDelivr CDN | `/portal/cap/pako_inflate.min.js`               |
| `UMI_APP_SSO_LOGIN_CREDENTIAL_KID` | 密码登录 SM2 公钥编号                          | `2026-05-primary`                               |
| `UMI_APP_SSO_LOGIN_CREDENTIAL_PUBLIC_KEY` | 密码登录 SM2 公钥；与后端私钥映射匹配 | 必填                                            |

Cap 前端资源已放在 `apps/sso/public/cap/`，构建时会复制到 SSO 产物的 `cap/` 目录。生产环境若调整 `base` / `publicPath`，需要同步覆盖 `UMI_APP_SSO_CAP_WASM_URL` 和 `UMI_APP_SSO_CAP_PAKO_URL`。

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
pnpm --filter @iam/oidc-provider serve
pnpm --filter @iam/worker serve
```

### 前端

```bash
pnpm --filter @iam/admin build
pnpm --filter @iam/sso build
```

构建产物分别位于：

- `apps/admin/dist`，默认 base 为 `/iam-admin`
- `apps/sso/dist`，默认 base 为 `/portal`

静态服务器或 APISIX 需要把后端路径按服务拆分反向代理：

- `/public`、`/open`、`/internal`、`/sso`、`/auth` 代理到公共 API 服务
- `/admin`、`/rpc` 代理到管理端 API 服务
- `/oidc` 代理到 Node.js OIDC Provider，并保留外部 Host 与协议转发头

### Docker

仓库提供四个后端镜像构建文件，构建上下文为仓库根目录：

```bash
docker build -f apps/api/Dockerfile -t iam-api .
docker build -f apps/admin-api/Dockerfile -t iam-admin-api .
docker build -f apps/oidc-provider/Dockerfile -t iam-oidc-provider .
docker build -f apps/worker/Dockerfile -t iam-worker .

docker run --rm -p 30000:30000 --env-file apps/api/.env iam-api
docker run --rm -p 30001:30001 --env-file apps/admin-api/.env iam-admin-api
docker run --rm -p 30002:30002 --env-file apps/oidc-provider/.env iam-oidc-provider
docker run --rm -p 30003:30003 --env-file apps/worker/.env iam-worker
```

本地依赖栈：

```bash
docker compose -f docker/docker-compose-dev.yml up -d db redis
```

开发编排：

```bash
docker compose -f docker/docker-compose-dev.yml up -d
```

`docker/docker-compose-dev.yml` 是唯一的开发编排入口，会同时编排 PostgreSQL、Redis、APISIX、公共 API、
管理端 API、OIDC Provider、worker-user-profile、worker-dashboard、SSO 前端和管理端前端。开发环境变量模板在
`docker/.env.dev.example`，复制为 `docker/.env` 后按需替换本地端口、代理、第三方服务和开发密钥。
如需同时启动 Loki、Grafana 和 Alloy，追加 `--profile observability`。

```bash
docker compose -f docker/docker-compose-dev.yml up -d --build oidc-provider apisix-etcd apisix
pnpm gateway:apisix:validate -- --env dev:iam
pnpm gateway:apisix:diff -- --env dev:iam --env-file .env
```

若 Docker 构建需要使用宿主机代理，请在 `docker/.env` 中配置 `DOCKER_BUILD_HTTP_PROXY`、
`DOCKER_BUILD_HTTPS_PROXY` 和 `DOCKER_BUILD_NO_PROXY`。代理监听在宿主机回环地址时，应将地址写为
`host.docker.internal`，不能使用容器自身的 `127.0.0.1`。访问 APISIX Admin API 时还需确保
`127.0.0.1` 在宿主机 `NO_PROXY` 中。Gateway CLI 的 APISIX Admin API 地址和 key 配置在
`gateway/.env`，模板见 `gateway/.env.example`；通过 `pnpm gateway:apisix:*` 执行时，`--env-file .env`
会解析到 gateway package 目录下的 `.env`。生产模板还包含
OIDC Provider 和 Worker，使用前必须补齐 issuer、current/previous RS256 JWK、cookie keys、Redis、worker
dashboard 凭据和限流参数。

OIDC 接入见 [docs/features/oidc/oidc-integration.md](docs/features/oidc/oidc-integration.md)，发布与回滚见
[docs/releases/oidc-release-runbook.md](docs/releases/oidc-release-runbook.md)。

## 🔧 调试与排障

- 日志：`IAM_API_LOG_LEVEL`、`IAM_ADMIN_API_LOG_LEVEL` 或 `IAM_OIDC_PROVIDER_LOG_LEVEL` 控制 Pino 输出级别
- API 调试：开发环境分别访问 <http://localhost:30000> 和 <http://localhost:30001>
- 数据调试：Drizzle Kit 命令或直接连接本地 PostgreSQL
- 前端代理：查看 `apps/admin/.umirc.ts` 和 `apps/sso/.umirc.ts`
- 测试：`pnpm test`，已配置 Bun 测试的后端/共享包通过 `bun test --parallel` 隔离测试文件间的 module mock；前端和 OIDC Provider 使用 Vitest；Playwright mocked smoke 通过 `pnpm e2e` 或包级 `e2e` 执行
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

**最后更新**：2026-07-02
