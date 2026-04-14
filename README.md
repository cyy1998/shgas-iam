# IAM (Identity and Access Management) Service

一个基于 Bun 和 Hono 框架构建的身份与访问管理服务，提供用户认证、授权、组织管理、角色权限等核心 IAM 功能。

## ✨ 特性

- **现代化技术栈**: 使用 Bun 运行时、Hono 框架、Prisma ORM 和 TypeScript
- **完整的 IAM 功能**: 用户管理、组织架构、职位管理、角色权限、单点登录
- **标准化 API**: 基于 OpenAPI 规范的 RESTful API，自带 Swagger UI 文档
- **强类型安全**: 全程 TypeScript 类型安全，Zod 运行时验证
- **多租户支持**: 客户端隔离，支持多应用接入
- **企业级功能**: 微信集成、短信验证、权限委托、数据导入导出

## 🛠️ 技术栈

### 核心框架

- **运行时**: [Bun](https://bun.sh/) - 快速的全能 JavaScript 运行时
- **Web 框架**: [Hono](https://hono.dev/) - 轻量级、快速的 Web 框架
- **API 文档**: [@hono/zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) - OpenAPI 集成
- **API UI**: [@hono/swagger-ui](https://github.com/honojs/middleware/tree/main/packages/swagger-ui) - Swagger UI 集成

### 数据库与 ORM

- **ORM**: [Prisma](https://www.prisma.io/) - 下一代 Node.js 和 TypeScript ORM
- **数据库**: MySQL (通过 Prisma 适配器)
- **模式生成**: [prisma-zod-generator](https://github.com/omar-dulaimi/prisma-zod-generator) - 从 Prisma 生成 Zod schema

### 认证与安全

- **OIDC 提供商**: [oidc-provider](https://github.com/panva/node-oidc-provider) - OAuth 2.0 和 OIDC 实现
- **密码哈希**: [bcrypt-ts](https://github.com/iamdavidfrancis/bcrypt-ts) - 密码安全哈希
- **加密**: [sm-crypto](https://github.com/JuneAndGreen/sm-crypto) - 国密算法支持

### 基础设施

- **缓存**: [ioredis](https://github.com/redis/ioredis) - Redis 客户端
- **日志**: [pino](https://github.com/pinojs/pino) - 极简日志库
- **HTTP 客户端**: [axios](https://axios-http.com/) - HTTP 请求库
- **日期处理**: [luxon](https://moment.github.io/luxon/) - 现代日期库

### 开发工具

- **包管理**: [pnpm](https://pnpm.io/) - 快速、节省磁盘空间的包管理器
- **代码检查**: [ESLint](https://eslint.org/) (Antfu 配置)
- **验证**: [Zod](https://zod.dev/) - TypeScript 优先的模式验证
- **数据格式**: [xlsx](https://sheetjs.com/) - Excel 文件处理

## 🚀 快速开始

### 环境要求

- **Bun** >= 1.0.0 (查看 `package.json` 中的 `devEngines.runtime`)
- **MySQL** >= 8.0
- **Redis** >= 6.0
- **Node.js** >= 18 (如果需要使用 npm/pnpm)

### 安装步骤

1. **克隆仓库**

   ```bash
   git clone <repository-url>
   cd iam-service
   ```

2. **安装依赖**

   ```bash
   # 使用 pnpm (推荐)
   pnpm install

   ```

3. **配置环境变量**
   复制 `.env.example` 到 `.env` 并填写必要配置：

   ```bash
   cp .env.example .env
   ```

   编辑 `.env` 文件，配置数据库、Redis 和其他服务连接信息。

4. **数据库设置**

   ```bash
   # 生成 Prisma 客户端
   pnpm prisma generate

   # 创建并应用数据库迁移
   pnpm prisma migrate dev

   # 可选：使用 Prisma Studio 查看数据
   pnpm prisma studio
   ```

5. **启动开发服务器**

   ```bash
   pnpm dev
   ```

   服务将在 http://localhost:30000 启动，Swagger UI 文档在 http://localhost:30000/doc/swagger

## 📁 项目结构

```
iam-service/
├── src/                          # 源代码目录
│   ├── app.ts                    # Hono应用主文件，路由注册
│   ├── index.ts                  # 服务入口点
│   ├── env.ts                    # 环境变量配置与验证
│   ├── db/                       # 数据库相关
│   │   ├── generated/            # Prisma生成的类型和客户端
│   │   │   ├── prisma/          # Prisma客户端和类型定义
│   │   │   └── schemas/         # Zod模式定义
│   │   └── sql/                  # 原始SQL脚本
│   │       ├── iam/             # IAM相关SQL
│   │       └── scripts/         # 数据同步和维护脚本
│   ├── enums/                    # 枚举定义
│   ├── errors/                   # 自定义错误类
│   ├── lib/                      # 库和工具
│   │   ├── clients/             # 外部客户端（如Redis、Pino）
│   │   ├── core/                # 核心工具（OpenAPI、应用创建）
│   │   └── pagination/          # 分页工具
│   ├── middlewares/              # Hono中间件
│   ├── routes/                   # API路由
│   │   ├── admin/               # 管理后台API
│   │   │   ├── client/         # 客户端管理
│   │   │   ├── employment/     # 雇佣关系管理
│   │   │   ├── organization/   # 组织管理
│   │   │   ├── position/       # 职位管理
│   │   │   └── user/           # 用户管理
│   │   ├── auth/                # 认证相关路由
│   │   ├── internal/            # 内部服务调用路由
│   │   ├── open/                # 公开API路由
│   │   ├── public/              # 公共API路由
│   │   └── sso/                 # 单点登录路由
│   ├── services/                # 业务逻辑服务层
│   │   ├── client/              # 客户端服务
│   │   ├── delegation/          # 权限委托服务
│   │   ├── employment/          # 雇佣关系服务
│   │   ├── mobile/              # 移动端服务
│   │   ├── organization/        # 组织服务
│   │   ├── position/            # 职位服务
│   │   ├── privilege/           # 权限服务
│   │   ├── role/                # 角色服务
│   │   ├── session/             # 会话服务
│   │   └── user/                # 用户服务
│   └── utils/                   # 工具函数
│       ├── http/                # HTTP相关工具
│       └── zod/                 # Zod模式工具
├── static/                       # 静态文件
│   └── swagger/                 # Swagger UI资源
├── scripts/                      # 部署和维护脚本
│   └── set-tender-privileges.sh # 设置招标权限脚本
├── debug/                        # 调试工具
├── prisma.config.ts              # Prisma配置
├── pnpm-workspace.yaml           # pnpm工作区配置
├── tsconfig.json                 # TypeScript配置
├── eslint.config.js              # ESLint配置
└── package.json                  # 项目依赖和脚本
```

## ⚙️ 环境变量配置

项目使用 Zod 进行环境变量验证，所有必需的环境变量定义在 `src/env.ts` 中：

### 配置文件模板

项目提供了 `.env.example` 文件作为环境变量配置模板。开始开发前：

```bash
# 复制模板文件
cp .env.example .env

# 编辑 .env 文件，填写实际的配置值
```

**注意**: `.env` 文件包含敏感信息，已添加到 `.gitignore`，切勿提交到版本控制。

| 变量名                   | 说明                                  | 默认值   | 必需 |
| ------------------------ | ------------------------------------- | -------- | ---- |
| `DATABASE_URL`           | MySQL 数据库连接字符串（Prisma 使用） | -        | 是   |
| `REDIS_URL`              | Redis 服务器地址                      | -        | 是   |
| `REDIS_PORT`             | Redis 端口                            | -        | 是   |
| `REDIS_DB`               | Redis 数据库编号                      | -        | 是   |
| `PORT`                   | 服务监听端口                          | `30000`  | 否   |
| `IAM_SECRET_KEY`         | JWT 签名密钥                          | -        | 是   |
| `WX_CORPID`              | 企业微信 CorpID                       | -        | 是   |
| `WX_CORPSECRET`          | 企业微信 CorpSecret                   | -        | 是   |
| `SMS_URL`                | 短信服务地址                          | -        | 是   |
| `SMS_SIGNATURE_KEY`      | 短信签名密钥                          | -        | 是   |
| `ORCAS_URL`              | 外部 ORCAS 服务地址                   | -        | 是   |
| `LOG_LEVEL`              | 日志级别                              | `"info"` | 否   |
| `LOGIN_ENDPOINT`         | 登录端点地址                          | -        | 是   |
| `AUTHORIZATION_ENDPOINT` | 授权端点地址                          | -        | 是   |
| `LOGOUT_ENDPOINT`        | 登出端点地址                          | -        | 是   |
| `THIRDPARTY_OA_ENDPOINT` | 第三方 OA 端点地址                    | -        | 是   |

**注意**:

- `DATABASE_URL` 由 Prisma 直接读取，用于数据库连接
- 其他变量由 `src/env.ts` 中的 Zod schema 验证和管理
- 所有以 `_ENDPOINT` 结尾的变量通常配置为路径（如 `/auth/login`），而非完整 URL

## 📚 API 文档

项目使用 OpenAPI 规范，并集成了 Swagger UI 用于 API 文档浏览和测试。

### 访问 API 文档

1. 启动开发服务器：`pnpm dev`
2. 打开浏览器访问：http://localhost:30000/doc/scalar

### API 分类

- **管理接口** (`/admin/*`): 系统管理功能，包括用户、组织、职位、客户端等管理
- **认证接口** (`/auth/*`): 用户登录、注册、令牌刷新等认证功能
- **单点登录** (`/sso/*`): OIDC 协议的单点登录集成
- **公开接口** (`/public/*`): 无需认证即可访问的接口
- **内部接口** (`/internal/*`): 服务间调用的内部接口

## 🛠️ 开发指南

### 开发命令

```bash
# 启动开发服务器（热重载）
pnpm dev

# 启动生产服务器
pnpm serve

# 代码检查
pnpm lint

# 代码检查并自动修复
pnpm lint:fix

# 生成 Prisma 客户端（数据库 schema 变更后）
pnpm prisma generate

# 创建并应用数据库迁移
pnpm prisma migrate dev --name <迁移名称>

# 打开 Prisma Studio 管理数据
pnpm prisma studio
```

### 添加新 API 端点

1. **定义数据模式**: 在相应的 `src/services/*/*.schema.ts` 中添加 Zod schema
2. **实现服务逻辑**: 在 `src/services/*/*.service.ts` 中实现业务逻辑
3. **创建路由处理器**: 在 `src/routes/*/*.handlers.ts` 中添加路由处理函数
4. **注册路由**: 在相应的路由组文件中注册新路由
5. **更新 OpenAPI 文档**: 使用 `@hono/zod-openapi` 装饰器自动生成文档

### 代码风格

项目使用 **ESLint** 进行代码检查和格式化，配置基于 Antfu 的风格：

- **行长度**: 最大 120 字符（仅警告）
- **分号**: 必需
- **引号**: 双引号
- **导入**: 使用路径别名（`@/`、`@services/` 等），避免相对路径

VS Code 用户可启用 `.vscode/settings.json` 中的设置，实现保存时自动修复。

### 架构模式

项目采用分层架构和一系列设计模式：

1. **路由处理器**: 使用 Hono 的 OpenAPI 集成与 Zod 验证
2. **服务层**: 业务逻辑在服务中，数据库操作在仓储层
3. **错误处理**: 自定义错误类配合服务状态码（参见 `ServiceStatusCode` 枚举），由 `errorHandler` 中间件统一处理
4. **验证**: Zod schema 同时用于运行时验证和 TypeScript 类型
5. **分页**: 使用 `@/utils/page.util` 中的 `paginate` 工具
6. **路径别名**: 在 tsconfig.json 中配置（如 `@/*`、`@services/*`、`@db`、`@lib/*`）
7. **错误码**: 标准化的错误码定义在 `src/enums/service.status.ts`
8. **日志**: Pino 日志库配置在 `@/lib/clients/pino`，通过中间件在 `app.ts` 中使用

### 数据流

1. **请求流程**: 请求 → 路由处理器（Zod OpenAPI 验证输入） → 服务方法 → 仓储方法 → Prisma 客户端 → 数据库
2. **响应流程**: 响应 ← 服务格式化数据 ← 仓储返回 Prisma 模型 ← 数据库

### 测试

项目当前未配置测试框架。建议根据需求添加测试：

- **单元测试**: 使用 `bun:test` 或 Vitest 测试服务层和工具函数
- **集成测试**: 测试 API 端点与数据库交互
- **E2E 测试**: 测试完整业务流程

测试文件通常放置在 `__tests__` 目录或与源文件并列的 `*.test.ts` 文件中。

## 🗄️ 数据库

### 数据模型

核心数据模型包括：

- **User**: 用户信息，支持微信集成
- **Organization**: 组织架构，支持树形结构（使用闭包表优化查询）
- **Position**: 职位定义
- **Employment**: 雇佣关系（用户-组织-职位关联）
- **Role**: 角色定义
- **Privilege**: 权限定义
- **Client**: OAuth 客户端
- **Session**: 用户会话

### 数据库操作

```bash
# 1. 修改 Prisma schema
编辑 `src/db/schema.prisma`

# 2. 生成 Prisma 客户端和 Zod schema
pnpm prisma generate

# 3. 创建迁移
pnpm prisma migrate dev --name <描述性名称>

# 4. 应用迁移到生产环境
pnpm prisma migrate deploy
```

## 🚢 部署

### 生产环境部署

1. **构建准备**

   ```bash
   # 安装生产依赖
   pnpm install --production

   # 生成 Prisma 客户端
   pnpm prisma generate

   # 应用数据库迁移
   pnpm prisma migrate deploy
   ```

2. **启动服务**

   ```bash
   # 使用生产模式启动
   pnpm serve

   # 或直接运行
   bun src/index.ts
   ```

3. **进程管理**（推荐）
   - 使用 **PM2**: `pm2 start ecosystem.config.js`
   - 使用 **Docker**: 构建自定义镜像
   - 使用 **Systemd**: 创建 systemd 服务单元

### Docker 部署

项目支持 Docker 容器化部署，可参考以下 Dockerfile 示例：

```dockerfile
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN bun install --frozen-lockfile
COPY . .
RUN bunx prisma generate

FROM oven/bun:1-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/static ./static
EXPOSE 30000
CMD ["bun", "run", "serve"]
```

## 🔧 调试与故障排除

### 日志系统

项目使用 **Pino** 日志库，支持结构化日志和多级别输出：

```typescript
import logger from "@/lib/clients/pino";

logger.info("信息日志");
logger.warn("警告日志");
logger.error("错误日志", { error: err });
```

通过 `LOG_LEVEL` 环境变量控制日志级别：`trace`、`debug`、`info`、`warn`、`error`、`fatal`

### 调试工具

- **Swagger UI**: API 测试和调试
- **Prisma Studio**: 数据库数据查看和编辑
- **调试目录**: `debug/` 包含调试脚本和工具

## 📊 数据同步与维护

### 数据导入导出

项目支持通过 Excel/CSV 格式批量导入导出数据：

- **用户数据导入**: 支持从外部系统同步用户信息
- **组织架构同步**: 保持组织树与外部系统一致
- **权限批量设置**: 通过脚本批量配置权限

### 维护脚本

- `scripts/set-tender-privileges.sh`: 设置招标相关权限
- `src/db/sql/scripts/`: 数据维护和同步 SQL 脚本

## 🤝 贡献指南

1. **Fork 仓库**并创建功能分支
2. **遵循代码规范**，确保通过 ESLint 检查
3. **添加测试**（如有需要）
4. **更新文档**反映代码变更
5. **提交 Pull Request**并描述变更内容

### 提交信息规范

使用约定式提交（Conventional Commits）格式：

```
<类型>[可选作用域]: <描述>

[可选正文]

[可选脚注]
```

常用类型：`feat`、`fix`、`docs`、`style`、`refactor`、`test`、`chore`

## 📄 许可证

[根据项目实际情况添加许可证信息]

## 📞 支持与反馈

- **问题报告**: 使用 GitHub Issues
- **功能请求**: 通过 Issues 提交
- **文档问题**: 提交 PR 修复

---

**最后更新**: 2026-04-10
