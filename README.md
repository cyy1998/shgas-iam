# IAM (Identity and Access Management) Monorepo

IAM 提供统一登录、应用接入、组织与任职管理、角色授权和应用委托。管理后台维护用户与应用，SSO 门户处理登录，接入应用可使用 OIDC 或 Custom SSO。目录查询支持用户和组织搜索。

## 仓库结构

- `apps/api` 提供公共、开放、内部、单点登录和认证 API，并承载 OIDC。`apps/admin-api` 提供管理端 REST 和 tRPC。
- `apps/worker` 运行队列消费和周期维护，`apps/ops` 提供人工维护与核验命令，`apps/gateway` 提供 APISIX 配置校验与发布 API。
- `apps/admin` 和 `apps/sso` 分别是管理后台与 SSO 门户。`packages/` 存放共享能力，`e2e/system/` 存放整套系统的端到端测试。

模块职责、源码入口和共享包清单见[仓库地图](docs/engineering/repository-map.md)。运行时关系和请求路径见[系统架构](docs/engineering/system-architecture.md)。

## 快速开始

从仓库根目录执行。使用 Node.js 24、Bun 1.4.2、根 [package.json](package.json) 指定版本的 pnpm，以及 Docker Compose。

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
cp apps/api/.env.example apps/api/.env
cp apps/admin-api/.env.example apps/admin-api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/sso/.env.example apps/sso/.env.local
```

开发 Compose 默认将 PostgreSQL 和 Redis 发布到宿主机的 `5432` 和 `6390`。把 API、Admin API 和 Worker 示例中的 Redis URL
改成 `redis://localhost:6390/0`。如果调整了 Compose 端口或数据库配置，同步修改应用 URL 和迁移工具的 `DATABASE_URL`。
API 与 SSO 的登录密钥需要配对，OIDC 的内外网 origin 与访问入口需要一致，见[登录与会话手册](docs/releases/authentication-and-session.md)。

### 3. 执行数据库迁移

```bash
pnpm --filter @iam/db db:migrate
```

### 4. 启动需要的应用

在各自的终端执行对应命令。

```bash
pnpm --filter @iam/api dev
pnpm --filter @iam/admin-api dev
pnpm --filter @iam/worker dev
pnpm --filter @iam/admin dev
pnpm --filter @iam/sso dev
```

- 公共 API 和 Scalar 文档首页：<http://localhost:30000>
- 管理端 API 和 Scalar 文档首页：<http://localhost:30001>
- 管理后台：<http://localhost:8001/iam-admin/>
- SSO 门户：<http://localhost:8000/portal/>

生产环境默认关闭 Scalar 和 OpenAPI 文档。Gateway 与人工维护命令分别见 [Gateway README](apps/gateway/README.md) 和 [Ops README](apps/ops/README.md)。

## 开发与项目文档

- [构建、测试与开发命令](docs/engineering/commands.md)提供构建、定向测试和验证入口，[测试与验证](docs/engineering/testing.md)说明何时使用各通道。
- [文档索引](docs/index.md)登记工程规范、功能规则、接入指南、运维手册和 ADR。[AGENTS.md](AGENTS.md)按任务指向适用规则。
- [功能与业务规则](docs/features/README.md)和 [CONTEXT.md](CONTEXT.md)维护业务行为与领域术语。
- [使用与接入指南](docs/guides/README.md)面向管理员和接入应用，[运维操作入口](docs/releases/README.md)覆盖部署、维护和恢复。

## 贡献指南

按[编码风格与命名约定](docs/engineering/coding-style.md)修改代码。涉及文档时，按[文档索引的维护方式](docs/index.md#维护方式)更新对应出处并运行 `pnpm check:docs`。提交信息使用 Conventional Commits。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
