# IAM (Identity and Access Management) Monorepo

IAM 提供统一登录、应用接入、组织与任职管理、角色授权和应用委托。管理后台维护用户与应用，SSO 门户处理登录，接入应用可使用 OIDC 或 Custom SSO。目录查询支持用户和组织搜索。

## 仓库结构

- `apps/auth-api` 提供身份认证、企微回调、风控与账号自助。
- `apps/sso-api` 提供 Custom SSO、OIDC 和 APISIX 用户会话鉴权。
- `apps/integration-api` 提供内部应用鉴权、目录查询、应用委托及集成写入。
- `apps/admin-api` 提供管理端 REST 和 tRPC。
- `apps/worker` 运行队列消费和周期维护。
- `apps/ops` 提供人工维护与核验命令。
- `apps/gateway` 提供 APISIX 配置校验与发布 API。
- `apps/admin` 和 `apps/sso` 分别是管理后台与 SSO 门户。
- `packages/` 存放共享能力。
- `e2e/system/` 存放整套系统的端到端测试。

模块职责、源码入口和共享包清单见[仓库地图](docs/engineering/repository-map.md)。运行时关系和请求路径见[系统架构](docs/engineering/system-architecture.md)。

## 快速开始

从仓库根目录执行。使用 Node.js 24、Bun 1.4.4、根 [package.json](package.json) 指定版本的 pnpm，以及 Docker Compose。

### 1. 安装依赖并启动 PostgreSQL 和 Redis

```bash
pnpm install
cp docker/.env.dev.example docker/.env
docker compose --env-file docker/.env -f docker/compose.dev.yaml up --wait db redis
```

Compose 会解析整份开发配置，即使只启动 `db redis`，也需要模板中提供的 `IAM_GATEWAY_DATABASE_URL`。
这一步可以保留模板中的 Gateway 占位连接串。实际启动 Gateway 前，请按[网关配置手册](docs/releases/apisix-gateway-release.md#服务与首次配置)准备独立的数据库只读账号和 APISIX Admin 凭据。

### 2. 配置应用和迁移工具

```bash
cp packages/db/.env.example packages/db/.env
cp apps/auth-api/.env.example apps/auth-api/.env
cp apps/sso-api/.env.example apps/sso-api/.env
cp apps/integration-api/.env.example apps/integration-api/.env
cp apps/admin-api/.env.example apps/admin-api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/sso/.env.example apps/sso/.env.local
```

开发 Compose 默认将 PostgreSQL 和 Redis 发布到宿主机的 `5432` 和 `6390`。把 Auth API、SSO API、Integration API、Admin API 和 Worker 示例中的 Redis URL
统一改成 `redis://localhost:6390/0`。如果调整了 Compose 端口或数据库配置，同步修改应用 URL 和迁移工具的 `DATABASE_URL`。
Auth API 的 SM2 私钥与 SSO 前端的公钥需要配对。SSO API 的 OIDC 内外网 origin 须匹配访问入口，见[登录与会话手册](docs/releases/authentication-and-session.md)。

### 3. 执行数据库迁移

```bash
pnpm --filter @iam/db db:migrate
```

### 4. 启动应用

在各自的终端执行对应命令。

```bash
pnpm --filter @iam/auth-api dev
pnpm --filter @iam/sso-api dev
pnpm --filter @iam/integration-api dev
pnpm --filter @iam/admin-api dev
pnpm --filter @iam/worker dev
pnpm --filter @iam/admin dev
pnpm --filter @iam/sso dev
```

- Auth API：<http://localhost:30000>
- SSO API：<http://localhost:30002>
- Integration API：<http://localhost:30005>
- 管理端 API 和 Scalar 文档首页：<http://localhost:30001>
- 管理后台：<http://localhost:8001/iam-admin/>
- SSO 门户：<http://localhost:8000/portal/>

源码开发默认启用 Scalar 首页和 OpenAPI JSON，例如 Auth API 的 `/auth/doc`、SSO API 的 `/oidc/doc`、Integration API 的 `/doc` 和 Admin API 的 `/admin/doc`。
开发 Compose 默认以生产模式运行这些服务。本地调试时可在 `docker/.env` 中把对应的
`IAM_AUTH_API_NODE_ENV`、`IAM_SSO_API_NODE_ENV`、`IAM_INTEGRATION_API_NODE_ENV` 或 `IAM_ADMIN_API_NODE_ENV` 设为 `development`。

Gateway 与人工维护命令分别见 [Gateway README](apps/gateway/README.md) 和 [Ops README](apps/ops/README.md)。

## 开发与项目文档

- [构建、测试与开发命令](docs/engineering/commands.md)提供 6 个核心根命令（`pnpm check`、`pnpm fix`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:e2e`、`pnpm verify`）、定向测试与 GitHub Actions `ci-gate` 说明，[测试与验证](docs/engineering/testing.md)说明各层级选择与资源隔离。
- [文档索引](docs/index.md)登记工程规范、功能规则、接入指南、运维手册和 ADR。[AGENTS.md](AGENTS.md)按任务指向适用规则。
- [功能与业务规则](docs/features/README.md)和 [GLOSSARY.md](GLOSSARY.md)维护业务行为与领域术语。
- [使用与接入指南](docs/guides/README.md)面向管理员和接入应用，[运维操作入口](docs/releases/README.md)覆盖部署、维护和恢复。

## 贡献指南

按[编码风格与命名约定](docs/engineering/coding-style.md)修改代码，提交前可运行 `pnpm check` 或 `pnpm verify`。涉及文档时，按[文档索引的维护方式](docs/index.md#维护方式)更新对应出处并运行 `pnpm check:docs`。提交信息使用 Conventional Commits。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
