# CLAUDE.zh-CN.md

本文件为 Claude Code (claude.ai/code) 提供在此代码仓库中工作的指引。

## 项目概述

这是一个使用以下技术构建的 IAM（身份与访问管理）服务：

- **运行时**：Bun（见 package.json 中的 `devEngines.runtime`）
- **框架**：Hono 及 OpenAPI 扩展（`@hono/zod-openapi`）
- **数据库**：MySQL，使用 Prisma ORM
- **会话存储**：Redis（ioredis 客户端）
- **认证**：OIDC 提供者（`oidc-provider`）用于 SSO
- **API 文档**：Swagger UI，访问路径 `/doc/swagger`
- **代码风格**：ESLint，使用 Antfu 配置（需分号、双引号、最大行长 120）

## 开发命令

### 前置条件

- **Bun** 运行时（版本需与 package.json 中 `devEngines.runtime` 兼容）
- **MySQL** 数据库，连接字符串配置在 `DATABASE_URL` 环境变量中
- **Redis** 实例用于会话存储（通过 `REDIS_URL`、`REDIS_PORT`、`REDIS_DB` 配置）
- **环境变量**：设置必要变量（见 `src/env.ts`），使用 `.env` 文件但不提交至仓库

### 常用命令

```bash
# 安装依赖（使用 pnpm）
pnpm install

# 启动带热重载的开发服务器
pnpm dev

# 启动生产服务器
pnpm serve

# 代码检查
pnpm lint

# 代码检查并自动修复
pnpm lint:fix

# 数据库操作（package.json 中未列出，但常用）
pnpm prisma generate    # Schema 变更后生成 Prisma 客户端
pnpm prisma migrate dev # 创建并应用迁移
pnpm prisma studio      # 打开 Prisma Studio 进行数据检查
```

## 架构

### 应用结构

- **`src/app.ts`**：主 Hono 应用，包含路由注册和 OpenAPI 配置
- **`src/index.ts`**：服务入口，导出 Bun 服务器配置
- **`src/env.ts`**：使用 Zod 进行环境变量验证
- **`src/routes/`**：按访问级别组织的 API 路由：
  - `admin/` – 管理端接口（客户端、雇佣关系、组织、职位、用户管理）
  - `auth/` – 认证接口
  - `internal/` – 内部服务调用
  - `open/` – 开放 API
  - `public/` – 公共 API
  - `sso/` – 单点登录接口
- **`src/services/`**：业务逻辑层，每个模块包含：
  - `*.service.ts` – 主要服务函数
  - `*.repository.ts` – 数据库查询（Prisma 调用）
  - `*.schema.ts` – 用于验证的 Zod Schema
  - `*.type.ts` – TypeScript 类型定义
- **`src/db/`**：数据库配置
  - `schema.prisma` – 定义模型的 Prisma Schema
  - `generated/` – 自动生成的 Prisma 客户端和 Zod Schema
  - `sql/` – 用于数据同步的原生 SQL 脚本
- **`src/lib/`**：外部客户端配置（Redis、Pino 日志、OpenAPI 工具）
- **`src/middlewares/`**：Hono 中间件（错误处理等）
- **`src/utils/`**：共享工具函数（HTTP 辅助、Zod 工具、分页）
- **`src/enums/`**：TypeScript 枚举（状态码、使用类型等）
- **`src/errors/`**：继承自 `CustomError` 的自定义错误类

### 关键模式

1. **路由处理器**：使用 Hono 的 OpenAPI 集成与 Zod 验证
2. **服务层**：业务逻辑在 Service 中，数据库操作在 Repository 中
3. **错误处理**：使用服务状态码的自定义错误类（见 `ServiceStatusCode` 枚举），由 `errorHandler` 中间件捕获
4. **验证**：Zod Schema 同时用于运行时验证和 TypeScript 类型
5. **分页**：使用 `@/utils/page.util` 中的 `paginate` 工具
6. **路径别名**：在 tsconfig.json 中配置（如 `@/*`、`@services/*` 等）
7. **错误码**：在 `src/enums/service.status.ts` 中定义的标准化错误码
8. **日志**：Pino 日志配置在 `@/lib/clients/pino`，通过 `app.ts` 中的中间件使用

### 数据流

1. 请求 → 路由处理器（Zod OpenAPI 验证输入）→ Service 方法 → Repository 方法 → Prisma 客户端 → 数据库
2. 响应 ← Service 格式化数据 ← Repository 返回 Prisma 模型 ← 数据库

### 依赖项

- **核心**：`hono`、`@hono/zod-openapi`、`@hono/swagger-ui`
- **数据库**：`@prisma/client`、`@prisma/adapter-mariadb`、`prisma-zod-generator`
- **认证**：`oidc-provider`、`bcrypt-ts`、`sm-crypto`
- **外部 API**：`axios`（HTTP 客户端）、`ioredis`（Redis）、`pino`（日志）
- **工具库**：`luxon`（日期时间）、`zod`（验证）、`xlsx`（Excel）、`csv-parse`

## 环境变量

必要的环境变量（完整 Schema 见 `src/env.ts`）：

- `DATABASE_URL`：MySQL 连接字符串（供 Prisma 使用）
- `REDIS_URL`、`REDIS_PORT`、`REDIS_DB`：Redis 配置
- `PORT`：服务端口（默认：30000）
- `IAM_SECRET_KEY`：JWT/签名密钥
- `WX_CORPID`、`WX_CORPSECRET`：企业微信集成
- `SMS_URL`、`SMS_SIGNATURE_KEY`：短信服务配置
- `ORCAS_URL`：外部服务 URL
- `LOG_LEVEL`：Pino 日志级别（默认："info"）

## 代码风格

- **ESLint**：Antfu 配置，包含代码风格规则
- **格式化**：由 ESLint 处理（Prettier 已禁用）
- **VS Code**：`.vscode/settings.json` 中的设置开启保存时 ESLint 自动修复
- **导入**：使用路径别名（`@/`、`@services/` 等），不使用相对路径
- **行长度**：最大 120 个字符（仅警告）
- **分号**：必须使用
- **引号**：双引号

## 核心原则

- **简单优先**：每次变更尽可能简单，只改动必要的代码
- **不走捷径**：找到根本原因，不做临时修复，遵守高级开发者标准
- **最小影响范围**：只改动必要的部分，避免引入新的问题

## 测试

目前未配置测试框架，可考虑使用 `bun:test` 或 Vitest 添加测试。

## 部署

- 服务通过 Bun 运行（`bun run serve`）
- 静态文件从 `static/` 目录提供
- Swagger UI 资源在 `static/swagger/`
- 部署前必须应用数据库迁移（`prisma migrate deploy`）

## 常见任务

### 添加新的 API 接口

1. 在对应的 `src/services/*/*.schema.ts` 中添加 Zod Schema
2. 在相关的 `src/routes/*/*.ts` 中添加路由处理器
3. 如果是新路由组，在 `src/app.ts` 中注册路由
4. 在 `src/services/*/*.service.ts` 中实现 Service 方法
5. 如需新的数据库查询，在 Repository 中添加对应方法

### 修改数据库 Schema

1. 编辑 `src/db/schema.prisma`
2. 生成 Prisma 客户端：`bunx prisma generate`
3. 创建迁移：`bunx prisma migrate dev --name 描述性名称`
4. 更新 Zod Schema（由 prisma-zod-generator 自动生成）

### 调试

- 日志使用 Pino，通过 `LOG_LEVEL` 配置日志级别
- 调试工具在 `debug/` 目录中
- 本地运行时 Swagger UI 访问地址：`http://localhost:30000/doc/swagger`
